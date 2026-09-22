import type { YtdlpVideoMeta } from "../ytdlp";

// ─── Instagram vía Apify ──────────────────────────────────────────────────────
//
// Instagram bloquea scraping desde IPs de datacenter (Render, AWS…). En vez de
// yt-dlp usamos Apify: un servicio gestionado con proxies residenciales que hace
// el scraping de forma segura (no expone nuestra IP ni arriesga ninguna cuenta).
// Devuelve JSON con métricas + la URL directa del mp4, que mandamos a Whisper.
//
// Actor usado: apify/instagram-reel-scraper
// Doc: https://apify.com/apify/instagram-reel-scraper
//
// Endpoint run-sync-get-dataset-items: ejecuta el actor y devuelve los items
// del dataset en la misma respuesta (sin tener que pollinear el run).

const REEL_ACTOR = "apify~instagram-reel-scraper";
const APIFY_BASE = "https://api.apify.com/v2";

// Forma (parcial) de un item del dataset de instagram-reel-scraper.
type ApifyReelItem = {
  id?: string;
  shortCode?: string;
  type?: string;
  url?: string;
  caption?: string;
  commentsCount?: number;
  likesCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  timestamp?: string; // ISO
  videoUrl?: string;  // mp4 directo (caduca a las pocas horas)
  videoDuration?: number;
  displayUrl?: string; // thumbnail
  ownerUsername?: string;
};

function firstLine(s: string | undefined, max = 120): string | null {
  if (!s) return null;
  const line = s.split("\n").map((x) => x.trim()).find(Boolean);
  return line ? line.slice(0, max) : null;
}

function mapReel(it: ApifyReelItem): YtdlpVideoMeta {
  const pageUrl =
    it.url ?? (it.shortCode ? `https://www.instagram.com/reel/${it.shortCode}/` : null);
  return {
    id: it.id ?? it.shortCode ?? pageUrl ?? "",
    title: firstLine(it.caption),
    url: pageUrl,
    webpage_url: pageUrl,
    description: it.caption ?? null,
    duration: it.videoDuration != null ? Math.round(it.videoDuration) : null,
    view_count: it.videoViewCount ?? it.videoPlayCount ?? null,
    like_count: it.likesCount ?? null,
    comment_count: it.commentsCount ?? null,
    repost_count: null,
    thumbnail: it.displayUrl ?? null,
    upload_date: null,
    extractor_key: "Instagram",
    media_url: it.videoUrl ?? null,
    published_iso: it.timestamp ?? null,
  };
}

async function apifyPost(path: string, token: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const res = await fetch(`${APIFY_BASE}${path}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Descubre los últimos reels de un perfil de Instagram por @usuario.
export async function fetchRecentReels(
  handle: string,
  token: string,
  limit = 20
): Promise<YtdlpVideoMeta[]> {
  const username = handle.replace(/^@/, "").trim();
  const items = (await apifyPost(
    `/acts/${REEL_ACTOR}/run-sync-get-dataset-items`,
    token,
    { username: [username], resultsLimit: limit },
    290_000
  )) as ApifyReelItem[];

  if (!Array.isArray(items)) return [];
  return items.filter((it) => it.videoUrl || it.url).map(mapReel);
}

// Re-obtiene la URL mp4 fresca de un reel concreto (las URLs de Apify caducan,
// y los enlaces sueltos añadidos a mano nunca tuvieron una guardada — ver
// addManualVideos en competitor.ts). Se usa como fallback al transcribir.
//
// El actor solo tiene UN campo de entrada, "username" (array): acepta
// usernames, URLs de perfil O enlaces directos de reel — no existe ningún
// "directUrls" aparte (confirmado contra el input schema real del actor;
// mandarle ese campo lo ignora en silencio y el actor devuelve 0 resultados,
// que es justo lo que producía el "sin URL de video de Instagram" en enlaces
// pegados a mano, ya que esta es la ÚNICA vía que tienen para conseguir su
// media_url — no vienen de un scrapeo de perfil que ya lo trajera).
export async function refreshReelMediaUrl(
  reelUrl: string,
  token: string
): Promise<string | null> {
  try {
    const items = (await apifyPost(
      `/acts/${REEL_ACTOR}/run-sync-get-dataset-items`,
      token,
      { username: [reelUrl], resultsLimit: 1 },
      120_000
    )) as ApifyReelItem[];
    const it = Array.isArray(items) ? items[0] : null;
    return it?.videoUrl ?? null;
  } catch (e) {
    console.warn(`[competitor] refreshReelMediaUrl(${reelUrl}) falló:`, (e as Error).message);
    return null;
  }
}
