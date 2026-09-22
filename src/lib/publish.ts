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

// Reclama ATÓMICAMENTE este content_item para publicarlo, ANTES de tocar la
// red: si dos llamadas concurrentes a publishPendingContentItems coinciden
// (dos pestañas, doble click en "Continuar proceso de vídeos"), ambas verían
// "sin publicaciones todavía" con un simple SELECT previo y las dos subirían
// el MISMO vídeo a Metricool — justo el duplicado que la rotación por cuenta
// existe para evitar. El UNIQUE de content_item_id hace que, si dos INSERT
// compiten, como mucho uno gane la fila; el perdedor ve changes=0 y se retira
// sin haber llamado a Metricool.
function claimForPublication(contentItemId: number, accountId: number): boolean {
  const now = new Date().toISOString();
  const res = db
    .prepare(
      `INSERT INTO content_item_publications(content_item_id, publish_account_id, status, created_at, updated_at)
       VALUES(?, ?, 'pending', ?, ?)
       ON CONFLICT(content_item_id) DO NOTHING`
    )
    .run(contentItemId, accountId, now, now);
  return res.changes > 0;
}

// Rotación: el MISMO vídeo nunca sale en más de una cuenta a la vez —
// subirlo idéntico a varias cuentas dispara detección de spam/duplicado en
// Instagram y puede acabar en shadowban. En su lugar, cada vídeo va a UNA
// sola cuenta, turnándose en orden entre las activas (vídeo 1 -> cuenta 1,
// vídeo 2 -> cuenta 2, ..., al llegar al final se vuelve a empezar).
// El turno se calcula contando cuántos vídeos de este usuario ya se
// asignaron antes — sin necesitar un contador aparte guardado en Ajustes.
function nextAccountForRotation(userId: number, accounts: PublishAccount[]): PublishAccount {
  const { n } = db
    .prepare(
      `SELECT COUNT(*) as n FROM content_item_publications cip
       JOIN content_items ci ON ci.id = cip.content_item_id
       WHERE ci.user_id = ?`
    )
    .get(userId) as { n: number };
  return accounts[n % accounts.length];
}

// Actualiza la fila ya reclamada por claimForPublication con el resultado
// real — nunca inserta (eso ya lo hizo el claim).
function recordPublicationResult(
  contentItemId: number,
  status: "scheduled" | "error",
  metricoolPostId: string | null,
  errorMsg: string | null
): void {
  db.prepare(
    `UPDATE content_item_publications SET status = ?, metricool_post_id = ?, error_msg = ?, updated_at = ?
     WHERE content_item_id = ?`
  ).run(status, metricoolPostId, errorMsg, new Date().toISOString(), contentItemId);
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
    recordPublicationResult(item.id, "scheduled", postId, null);
    return "scheduled";
  } catch (e) {
    recordPublicationResult(item.id, "error", null, (e as Error).message.slice(0, 500));
    return "error";
  }
}

// Programa en Metricool todo content_item ya listo (status 'por_subir' +
// vídeo adjunto) que aún no se haya asignado a ninguna cuenta — a UNA sola
// cuenta, la que le toque por rotación (ver nextAccountForRotation).
// autoPublish deja en manos de Metricool el momento exacto de publicar; este
// ciclo (el POLL_CRON de siempre, no hace falta más frecuencia) solo crea el
// post con antelación.
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

    const account = nextAccountForRotation(item.user_id, accounts);
    if (!claimForPublication(item.id, account.id)) continue; // ya reclamado (por esta u otra llamada concurrente)

    checked++;
    const result = await publishToAccount(item, account, settings.metricoolUserToken, settings.metricoolUserId);
    if (result === "scheduled") scheduled++;
    else errors++;

    // Una vez asignado (éxito o error) a su cuenta, el content_item se da por
    // gestionado — el detalle de si esa cuenta concreta falló queda en
    // content_item_publications.status/error_msg, visible en el calendario.
    db.prepare(`UPDATE content_items SET status = 'subido', updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      item.id
    );
  }

  return { checked, scheduled, errors, noAccounts };
}
