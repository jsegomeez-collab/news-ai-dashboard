import { accountsDue, markAccountChecked, insertVideo } from "./competitor";
import { ytdlpAvailable, fetchRecentVideos, videoPageUrl, parseYtdlpDate, type YtdlpVideoMeta } from "./ytdlp";
import { fetchRecentReels } from "./providers/instagram";
import { readUserSettings } from "./settings";

export type CompetitorPollResult = {
  checked: number;
  inserted: number;
  skipped: number;
  // Dependencias ausentes detectadas durante este poll ("yt-dlp", "apify"),
  // para poder avisar de verdad en vez de un booleano `available` que nunca
  // reflejaba nada (antes siempre valía true, pasara lo que pasara).
  unavailable: string[];
};

type DueAccount = {
  id: number;
  user_id: number;
  platform: string;
  handle: string;
  url: string;
  check_interval_hours: number;
  min_views: number;
  min_likes: number;
  min_comments: number;
};

// Revisa las cuentas de competencia que toca comprobar y descubre videos nuevos.
// Enrutado por plataforma:
//   • instagram → Apify (proxies residenciales, no expone IP ni cuenta)
//   • youtube / tiktok → yt-dlp
// Sin userId: TODAS las cuentas debidas de todos los usuarios (worker de
// fondo). Con userId: solo las de ese usuario (endpoints HTTP por-usuario).
export async function pollCompetitorAccounts(userId?: number): Promise<CompetitorPollResult> {
  const accounts = accountsDue(userId) as DueAccount[];
  if (accounts.length === 0) return { checked: 0, inserted: 0, skipped: 0, unavailable: [] };

  // yt-dlp solo hace falta para youtube/tiktok; Instagram va por Apify.
  const hasYtdlp = await ytdlpAvailable();
  let checked = 0, inserted = 0, skipped = 0;
  const unavailable = new Set<string>();

  for (const account of accounts) {
    try {
      const videos = await fetchForAccount(account, hasYtdlp, unavailable);
      if (videos === null) { markAccountChecked(account.id); continue; } // no disponible (sin token / sin yt-dlp)

      markAccountChecked(account.id);
      checked++;

      let added = 0, dropped = 0;
      for (const v of videos) {
        if (evaluateVideo(v, account) === "skip") { dropped++; skipped++; continue; }
        const id = insertVideo(account.id, {
          video_url: videoPageUrl(v),
          video_id: v.id,
          title: v.title ?? undefined,
          description: v.description ?? undefined,
          thumbnail_url: v.thumbnail ?? undefined,
          views: v.view_count ?? undefined,
          likes: v.like_count ?? undefined,
          comments: v.comment_count ?? undefined,
          shares: v.repost_count ?? undefined,
          duration_sec: v.duration ?? undefined,
          published_at: v.published_iso ?? parseYtdlpDate(v.upload_date) ?? undefined,
          media_url: v.media_url ?? undefined,
        });
        if (id !== null) { added++; inserted++; }
      }
      console.log(`[competitor] @${account.handle} (${account.platform}): ${videos.length} vistos → ${added} nuevos, ${dropped} omitidos`);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      console.warn(`[competitor] @${account.handle} (${account.platform}) falló:`, msg.slice(0, 200));
      markAccountChecked(account.id); // evitar hammering en error
    }
  }

  return { checked, inserted, skipped, unavailable: [...unavailable] };
}

// Devuelve los videos de una cuenta, o null si esa plataforma no está disponible
// (Instagram sin token de Apify, o yt-dlp no instalado para youtube/tiktok).
// Registra en `unavailable` qué dependencia faltó, para que el llamador pueda
// mostrar un aviso real en vez de un genérico "0 videos nuevos".
async function fetchForAccount(
  account: DueAccount,
  hasYtdlp: boolean,
  unavailable: Set<string>
): Promise<YtdlpVideoMeta[] | null> {
  if (account.platform === "instagram") {
    const token = readUserSettings(account.user_id).apifyToken;
    if (!token) {
      unavailable.add("apify");
      console.warn(`[competitor] @${account.handle}: Instagram requiere token de Apify (Ajustes → Instagram). Omitida.`);
      return null;
    }
    return fetchRecentReels(account.handle, token, 20);
  }

  // youtube / tiktok
  if (!hasYtdlp) {
    unavailable.add("yt-dlp");
    console.warn(`[competitor] @${account.handle}: yt-dlp no instalado, ${account.platform} omitida.`);
    return null;
  }
  return fetchRecentVideos(account.url, 20);
}

// "skip" = claramente bajo umbral. "insert" = pasa o métrica desconocida (se filtrará en Fase 3).
function evaluateVideo(
  v: YtdlpVideoMeta,
  thresholds: { min_views: number; min_likes: number; min_comments: number }
): "insert" | "skip" {
  if (v.view_count !== null && v.view_count < thresholds.min_views) return "skip";
  if (v.like_count !== null && thresholds.min_likes > 0 && v.like_count < thresholds.min_likes) return "skip";
  if (v.comment_count !== null && thresholds.min_comments > 0 && v.comment_count < thresholds.min_comments) return "skip";
  return "insert";
}
