// Cliente de la API REST de HeyGen (NO el MCP de HeyGen: el MCP está pensado
// para agentes conversacionales con OAuth interactivo, no para un worker
// desatendido que corre en cron). Autenticación por API key fija, igual que
// Anthropic/OpenAI/Apify en esta app.
//
// Formas de petición basadas en la API v2 pública de HeyGen (Create Avatar
// Video V2 / List Avatars / List Voices / Video Status). No se ha podido
// verificar contra la documentación en vivo durante el desarrollo de esta
// integración — antes de dejarlo correr en automático, haz una prueba manual
// con tu clave real (ver queueAvatarVideo) y ajusta los nombres de campo aquí
// si HeyGen responde con un error de validación.

const HEYGEN_BASE = "https://api.heygen.com";

async function heygenFetch<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    ...init,
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json().catch(() => null) as { error?: { message?: string } | string; message?: string } | null;
  if (!res.ok || (json && json.error)) {
    const errMsg = typeof json?.error === "string" ? json.error : json?.error?.message;
    throw new Error((errMsg ?? json?.message ?? `HeyGen HTTP ${res.status}`).slice(0, 300));
  }
  return json as T;
}

export type HeygenAvatarKind = "avatar" | "talking_photo";

export type HeygenAvatarOption = {
  id: string;
  kind: HeygenAvatarKind;
  label: string;
  previewUrl: string | null;
};

type RawAvatar = { avatar_id: string; avatar_name?: string; preview_image_url?: string };
type RawTalkingPhoto = { talking_photo_id: string; talking_photo_name?: string; preview_image_url?: string };

// Lista los avatares (Studio/Instant) Y los "talking photos" (Photo Avatar /
// Avatar IV) de la cuenta conectada — HeyGen los separa en dos listas porque
// se generan con una forma de petición distinta (ver createAvatarVideo), pero
// de cara al usuario son "tus clones" y se muestran juntos en un único selector.
export async function listAvatars(apiKey: string): Promise<HeygenAvatarOption[]> {
  const json = await heygenFetch<{ data: { avatars?: RawAvatar[]; talking_photos?: RawTalkingPhoto[] } }>(
    apiKey,
    "/v2/avatars"
  );
  const avatars = (json.data.avatars ?? []).map((a) => ({
    id: a.avatar_id,
    kind: "avatar" as const,
    label: a.avatar_name || a.avatar_id,
    previewUrl: a.preview_image_url ?? null,
  }));
  const photos = (json.data.talking_photos ?? []).map((p) => ({
    id: p.talking_photo_id,
    kind: "talking_photo" as const,
    label: p.talking_photo_name || p.talking_photo_id,
    previewUrl: p.preview_image_url ?? null,
  }));
  return [...avatars, ...photos];
}

export type HeygenVoiceOption = { id: string; label: string; language: string | null; previewUrl: string | null };
type RawVoice = { voice_id: string; name?: string; language?: string; preview_audio?: string };

export async function listVoices(apiKey: string): Promise<HeygenVoiceOption[]> {
  const json = await heygenFetch<{ data: { voices?: RawVoice[] } }>(apiKey, "/v2/voices");
  return (json.data.voices ?? []).map((v) => ({
    id: v.voice_id,
    label: v.language ? `${v.name || v.voice_id} (${v.language})` : v.name || v.voice_id,
    language: v.language ?? null,
    previewUrl: v.preview_audio ?? null,
  }));
}

// Lanza la generación de un vídeo con tu avatar/voz leyendo `text`. Devuelve
// el video_id de HeyGen para sondear el estado después (es un job async: no
// hay vídeo en la respuesta de esta llamada).
export async function createAvatarVideo(
  apiKey: string,
  opts: { avatarId: string; avatarKind: HeygenAvatarKind; voiceId: string; text: string; widthPx?: number; heightPx?: number }
): Promise<string> {
  const character =
    opts.avatarKind === "talking_photo"
      ? { type: "talking_photo", talking_photo_id: opts.avatarId }
      : { type: "avatar", avatar_id: opts.avatarId, avatar_style: "normal" };

  const json = await heygenFetch<{ data: { video_id: string } }>(apiKey, "/v2/video/generate", {
    method: "POST",
    body: JSON.stringify({
      video_inputs: [
        {
          character,
          voice: { type: "text", input_text: opts.text.slice(0, 1500), voice_id: opts.voiceId },
        },
      ],
      dimension: { width: opts.widthPx ?? 720, height: opts.heightPx ?? 1280 },
    }),
  });
  return json.data.video_id;
}

export type HeygenVideoStatus = {
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl: string | null;
  durationSec: number | null;
  error: string | null;
};

// El check de estado vive en /v1 (no /v2) en la API real de HeyGen — no es un
// error tipográfico, es así de raro.
export async function getVideoStatus(apiKey: string, videoId: string): Promise<HeygenVideoStatus> {
  const json = await heygenFetch<{
    data: { status: string; video_url?: string; duration?: number; error?: { message?: string } | null };
  }>(apiKey, `/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`);
  const d = json.data;
  const status: HeygenVideoStatus["status"] =
    d.status === "completed" || d.status === "failed" || d.status === "pending" ? d.status : "processing";
  return {
    status,
    videoUrl: d.video_url ?? null,
    durationSec: typeof d.duration === "number" ? d.duration : null,
    error: d.error?.message ?? null,
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
