import { accountsDue, markAccountChecked, insertVideo } from "./competitor";
import { ytdlpAvailable, fetchRecentVideos, videoPageUrl, parseYtdlpDate, type YtdlpVideoMeta } from "./ytdlp";

export type CompetitorPollResult = {
  available: boolean;
  checked: number;
  inserted: number;
  skipped: number;
};

// Revisa las cuentas de competencia que toca comprobar y descubre videos nuevos.
// Se llama desde el worker (global, todas las cuentas activas de todos los usuarios).
export async function pollCompetitorAccounts(): Promise<CompetitorPollResult> {
  if (!(await ytdlpAvailable())) {
    return { available: false, checked: 0, inserted: 0, skipped: 0 };
  }

  const accounts = accountsDue();
  let checked = 0, inserted = 0, skipped = 0;

  for (const account of accounts) {
    try {
      const videos = await fetchRecentVideos(account.url, 20);
      markAccountChecked(account.id);
      checked++;

      for (const v of videos) {
        const result = evaluateVideo(v, account);
        if (result === "skip") { skipped++; continue; }

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
          published_at: parseYtdlpDate(v.upload_date) ?? undefined,
        });
        if (id !== null) inserted++;
      }

      console.log(`[competitor] @${account.handle}: ${videos.length} vistos → ${inserted} nuevos, ${skipped} omitidos`);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      // Instagram bloquea scrapers desde IPs de datacenter sin cookies de sesión.
      if (account.platform === "instagram" || msg.toLowerCase().includes("instagram")) {
        console.warn(
          `[competitor] @${account.handle} (Instagram): bloqueado desde servidor. ` +
          `Instagram requiere cookies de sesión; solo YouTube funciona sin autenticación desde la nube. ` +
          `Elimina esta cuenta y usa su canal de YouTube si tiene uno.`
        );
      } else {
        console.warn(`[competitor] @${account.handle} falló:`, msg.slice(0, 200));
      }
      markAccountChecked(account.id); // evitar hammering en error
    }
  }

  return { available: true, checked, inserted, skipped };
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
