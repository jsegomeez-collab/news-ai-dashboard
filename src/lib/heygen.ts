// Cliente de la API REST de HeyGen (NO el MCP de HeyGen: el MCP está pensado
// para agentes conversacionales con OAuth interactivo, no para un worker
// desatendido que corre en cron). Autenticación por API key fija, igual que
// Anthropic/OpenAI/Apify en esta app.
//
// v3, verificado en vivo contra https://developers.heygen.com/llms.txt
// (HeyGen publica esa guía explícitamente para agentes/LLMs) el 17/09/2026,
// después de que una primera versión contra /v2 funcionara pero resultara ser
// legacy (HeyGen la retira el 2026-10-31 y avisa de ello en la propia
// respuesta de error). v3 unifica "avatar" y "talking photo" en un único
// concepto de "look" con un solo avatar_id, así que ya no hace falta
// distinguir tipos de avatar como en la v2.
const HEYGEN_BASE = "https://api.heygen.com";

async function heygenFetch<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    ...init,
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await res.json().catch(() => null)) as {
    error?: { message?: string } | string;
    message?: string;
  } | null;
  if (!res.ok || (json && json.error)) {
    const errMsg = typeof json?.error === "string" ? json.error : json?.error?.message;
    throw new Error((errMsg ?? json?.message ?? `HeyGen HTTP ${res.status}`).slice(0, 300));
  }
  // v3 no envuelve siempre en {data: ...} igual que v2 — se acepta cualquiera
  // de las dos formas en vez de asumir una sola.
  return ((json as { data?: T })?.data ?? json) as T;
}

export type HeygenAvatarOption = { id: string; label: string; previewUrl: string | null };
type RawAvatarGroup = { id: string; name?: string; group_type?: string };
type RawLook = { id: string; name?: string; group_id?: string; preview_image_url?: string; thumbnail_url?: string };

// GET /v3/avatars/looks a secas (usado en la versión anterior) es un catálogo
// GENERAL que mezcla los públicos de HeyGen con los tuyos, sin parámetro real
// para filtrar. El equivalente v2 confirmado para "solo mis avatares"
// (avatar_group.list?include_public=false, sacado del código fuente del MCP
// oficial de HeyGen) resultó ser TAMBIÉN legacy — la propia API, al llamarlo,
// avisa "migrate to /v3/avatars". Así que la vía correcta es:
//   1) GET /v3/avatars?ownership=private -> tus GRUPOS (identidades entrenadas)
//   2) GET /v3/avatars/looks?group_id=X  -> los looks (variantes) de cada uno;
//      el look.id, no el group.id, es el avatar_id real para createAvatarVideo.
// El nombre exacto del parámetro de (1) no se ha podido confirmar con una
// clave real todavía (hay fuentes que dicen "ownership=private", otras
// "owned_by=me") — si sigue trayendo avatares públicos, es el primer sitio a
// revisar. Como red de seguridad adicional, si el grupo trae `group_type` se
// descartan los que no parezcan tuyos.
export async function listAvatars(apiKey: string): Promise<HeygenAvatarOption[]> {
  const groups = await heygenFetch<RawAvatarGroup[]>(apiKey, "/v3/avatars?ownership=private");
  const options: HeygenAvatarOption[] = [];
  for (const g of groups ?? []) {
    const looks = await heygenFetch<RawLook[]>(apiKey, `/v3/avatars/looks?group_id=${encodeURIComponent(g.id)}`).catch(
      () => [] as RawLook[]
    );
    if (looks.length === 0) {
      options.push({ id: g.id, label: g.name || g.id, previewUrl: null });
      continue;
    }
    for (const l of looks) {
      options.push({
        id: l.id,
        label: looks.length > 1 ? `${g.name || g.id} — ${l.name || l.id}` : g.name || l.name || l.id,
        previewUrl: l.preview_image_url ?? l.thumbnail_url ?? null,
      });
    }
  }
  return options;
}

export type HeygenVoiceOption = { id: string; label: string; language: string | null; previewUrl: string | null };
// El MCP oficial de HeyGen lista TODAS las voces sin ningún filtro "solo las
// mías" (get_voices() en su propio código no lo ofrece) — a diferencia de
// avatares, no hay un endpoint confirmado equivalente a
// avatar_group.list?include_public=false para voces clonadas. `type` es un
// campo visto en alguna respuesta de ejemplo con valor "public"; se usa aquí
// como filtro best-effort (todo lo que NO sea "public"), y si eso deja la
// lista vacía se enseña la lista completa entera — mejor que no enseñar nada,
// y tu propia voz clonada la reconocerás por el nombre que le pusiste.
type RawVoice = { voice_id: string; name?: string; language?: string; preview_audio_url?: string; type?: string };

export async function listVoices(apiKey: string): Promise<HeygenVoiceOption[]> {
  const voices = (await heygenFetch<RawVoice[]>(apiKey, "/v3/voices")) ?? [];
  const mine = voices.filter((v) => v.type && v.type !== "public");
  return (mine.length > 0 ? mine : voices).map((v) => ({
    id: v.voice_id,
    label: v.language ? `${v.name || v.voice_id} (${v.language})` : v.name || v.voice_id,
    language: v.language ?? null,
    previewUrl: v.preview_audio_url ?? null,
  }));
}

// Lanza la generación de un vídeo con tu avatar/voz leyendo `text`. Devuelve
// el video_id de HeyGen para sondear el estado después (es un job async: no
// hay vídeo en la respuesta de esta llamada).
export async function createAvatarVideo(
  apiKey: string,
  opts: { avatarId: string; voiceId: string; text: string }
): Promise<string> {
  const json = await heygenFetch<{ video_id: string }>(apiKey, "/v3/videos", {
    method: "POST",
    body: JSON.stringify({
      type: "avatar",
      avatar_id: opts.avatarId,
      voice_id: opts.voiceId,
      script: opts.text.slice(0, 1500),
      aspect_ratio: "auto",
      resolution: "1080p",
    }),
  });
  return json.video_id;
}

export type HeygenVideoStatus = {
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl: string | null;
  durationSec: number | null;
  error: string | null;
};

export async function getVideoStatus(apiKey: string, videoId: string): Promise<HeygenVideoStatus> {
  const json = await heygenFetch<{
    status: string;
    video_url?: string;
    duration?: number;
    error?: { message?: string } | string | null;
  }>(apiKey, `/v3/videos/${encodeURIComponent(videoId)}`);
  const status: HeygenVideoStatus["status"] =
    json.status === "completed" || json.status === "failed" || json.status === "pending" ? json.status : "processing";
  return {
    status,
    videoUrl: json.video_url ?? null,
    durationSec: typeof json.duration === "number" ? json.duration : null,
    error: typeof json.error === "string" ? json.error : json.error?.message ?? null,
  };
}

// Precio aproximado por segundo de un avatar clonado ("digital twin") vía API
// a fecha de esta integración (~$4/min) — verifica contra tu factura real de
// HeyGen y ajusta si tu plan/tipo de avatar tiene otro precio.
export const HEYGEN_PRICE_PER_SEC = 0.0667;
const WORDS_PER_SEC_ESTIMATE = 2.5; // ritmo hablado natural en español, mismo criterio que competitor-generate.ts

// Estimación PREVIA a generar (para el chequeo de presupuesto): la duración
// real y el coste real solo se saben cuando HeyGen termina el vídeo.
export function estimateCostFromText(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const seconds = words / WORDS_PER_SEC_ESTIMATE;
  return seconds * HEYGEN_PRICE_PER_SEC;
}
