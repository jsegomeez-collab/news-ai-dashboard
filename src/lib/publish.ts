import { db } from "./db";
import { readUserSettings } from "./settings";
import { listActivePublishAccounts, type PublishAccount } from "./publishAccounts";
import { uploadVideo, createScheduledPost } from "./metricool";
import { buildScriptText } from "./scriptText";

type DueItem = {
  id: number;
  user_id: number;
  video_path: string;
  scheduled_date: string;
  scheduled_time: string | null;
  linked_type: string | null;
  linked_id: number | null;
  title: string | null;
};

// El texto del post es el guion tal cual (hook+cuerpo+cta) — no se resume ni
// se reescribe para Metricool, es literalmente lo que dice el vídeo.
function captionFor(item: DueItem): string {
  if (item.linked_type && item.linked_id) {
    const table = item.linked_type === "script" ? "scripts" : "competitor_scripts";
    const row = db.prepare(`SELECT hook, body, cta FROM ${table} WHERE id = ?`).get(item.linked_id) as
      | { hook: string | null; body: string | null; cta: string | null }
      | undefined;
    if (row) return buildScriptText(row).slice(0, 2100); // Metricool: 2200 caracteres máx
  }
  return (item.title ?? "").slice(0, 2100);
}

function hasPublication(contentItemId: number, accountId: number): boolean {
  return !!db
    .prepare(`SELECT 1 FROM content_item_publications WHERE content_item_id = ? AND publish_account_id = ?`)
    .get(contentItemId, accountId);
}

function recordPublication(
  contentItemId: number,
  accountId: number,
  status: "scheduled" | "error",
  metricoolPostId: string | null,
  errorMsg: string | null
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO content_item_publications(content_item_id, publish_account_id, metricool_post_id, status, error_msg, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?)`
  ).run(contentItemId, accountId, metricoolPostId, status, errorMsg, now, now);
}

async function publishToAccount(
  item: DueItem,
  account: PublishAccount,
  token: string,
  mcUserId: string
): Promise<"scheduled" | "error"> {
  const text = captionFor(item);
  const publicationDateUTC = `${item.scheduled_date}T${item.scheduled_time ?? "12:00"}:00`;
  try {
    // Se sube el vídeo una vez POR CUENTA destino (no se comparte entre
    // cuentas): no se pudo confirmar sin una cuenta real de Metricool si un
    // media subido bajo un blogId es referenciable desde otro, así que se
    // prioriza la opción segura aunque suba el mismo archivo varias veces.
    const mediaUrl = await uploadVideo(token, mcUserId, account.blog_id, item.video_path);
    const postId = await createScheduledPost({
      userToken: token,
      userId: mcUserId,
      blogId: account.blog_id,
      network: account.network,
      text,
      mediaUrl,
      publicationDateUTC,
    });
    recordPublication(item.id, account.id, "scheduled", postId, null);
    return "scheduled";
  } catch (e) {
    recordPublication(item.id, account.id, "error", null, (e as Error).message.slice(0, 500));
    return "error";
  }
}

// Programa en Metricool (una llamada por cuenta destino activa) todo
// content_item ya listo para publicar (status 'por_subir' + vídeo adjunto)
// que aún no se haya intentado con alguna cuenta. autoPublish deja en manos
// de Metricool el momento exacto de publicar — este ciclo (cada POLL_CRON,
// no hace falta más frecuencia) solo necesita crear el post con antelación,
// no estar despierto justo a la hora programada.
export async function publishPendingContentItems(
  userId?: number
): Promise<{ checked: number; scheduled: number; errors: number; noAccounts: number }> {
  const scope = userId !== undefined ? ` AND user_id = ?` : ``;
  const params = userId !== undefined ? [userId] : [];
  const items = db
    .prepare(
      `SELECT id, user_id, video_path, scheduled_date, scheduled_time, linked_type, linked_id, title
       FROM content_items
       WHERE status = 'por_subir' AND video_path IS NOT NULL${scope}`
    )
    .all(...(params as never[])) as DueItem[];

  let checked = 0,
    scheduled = 0,
    errors = 0,
    noAccounts = 0;

  for (const item of items) {
    const settings = readUserSettings(item.user_id);
    if (!settings.metricoolUserToken || !settings.metricoolUserId) continue; // sin Metricool configurado: se ignora

    const accounts = listActivePublishAccounts(item.user_id);
    if (accounts.length === 0) {
      noAccounts++;
      continue;
    }

    const pending = accounts.filter((a) => !hasPublication(item.id, a.id));
    if (pending.length === 0) continue; // ya se intentó con todas las cuentas activas

    checked++;
    for (const account of pending) {
      const result = await publishToAccount(item, account, settings.metricoolUserToken, settings.metricoolUserId);
      if (result === "scheduled") scheduled++;
      else errors++;
    }

    const stillMissing = accounts.some((a) => !hasPublication(item.id, a.id));
    if (!stillMissing) {
      db.prepare(`UPDATE content_items SET status = 'subido', updated_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        item.id
      );
    }
  }

  return { checked, scheduled, errors, noAccounts };
}
