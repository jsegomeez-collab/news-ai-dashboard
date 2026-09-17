import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";
import type { TikTokPage } from "@remotion/captions";

export type CaptionedVideoProps = {
  videoSrc: string;
  pages: TikTokPage[];
  durationInSeconds: number;
  widthPx: number;
  heightPx: number;
  // Cabecera fija arriba durante TODO el vídeo (titular + línea de apoyo),
  // detectada automáticamente a partir de la transcripción — ver
  // src/lib/videoTitle.ts. null si no se pudo generar (el vídeo se renderiza
  // igual, solo que sin cabecera).
  title: string | null;
  subtitle: string | null;
};

// Subtítulos incrustados sobre el vídeo de HeyGen, estilo "TikTok" (grupos
// cortos de palabras, la que se está diciendo resaltada) + una cabecera fija
// arriba con el titular/subtítulo detectados por IA. `pages` viene ya
// agrupado por @remotion/captions a partir de los timestamps por palabra de
// Whisper — este componente solo decide qué página tocaba mostrar en cada
// frame y la pinta, no hace ningún agrupado.
export function CaptionedVideo({ videoSrc, pages, title, subtitle }: CaptionedVideoProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeMs = (frame / fps) * 1000;

  const page = pages.find((p) => timeMs >= p.startMs && timeMs < p.startMs + p.durationMs);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <OffthreadVideo src={videoSrc} />
      {title && (
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: "6%" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.25em",
              maxWidth: "88%",
              padding: "0.5em 0.9em",
              borderRadius: 16,
              backgroundColor: "rgba(0,0,0,0.55)",
              textAlign: "center",
            }}
          >
            <span
              style={{
                fontFamily: "Arial, Helvetica, sans-serif",
                fontWeight: 900,
                fontSize: 52,
                lineHeight: 1.15,
                color: "white",
                textShadow: "0 2px 10px rgba(0,0,0,0.85)",
              }}
            >
              {title}
            </span>
            {subtitle && (
              <span
                style={{
                  fontFamily: "Arial, Helvetica, sans-serif",
                  fontWeight: 600,
                  fontSize: 32,
                  lineHeight: 1.2,
                  color: "#d4d4d8",
                  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                }}
              >
                {subtitle}
              </span>
            )}
          </div>
        </AbsoluteFill>
      )}
      {page && (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: "14%" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "0.35em",
              maxWidth: "85%",
              padding: "0.35em 0.7em",
              borderRadius: 14,
              backgroundColor: "rgba(0,0,0,0.55)",
            }}
          >
            {page.tokens.map((t, i) => {
              const active = timeMs >= t.fromMs && timeMs < t.toMs;
              return (
                <span
                  key={i}
                  style={{
                    fontFamily: "Arial, Helvetica, sans-serif",
                    fontWeight: 800,
                    fontSize: 58,
                    lineHeight: 1.2,
                    color: active ? "#3b82f6" : "white", // #3b82f6 = brand (tailwind.config.ts)
                    textShadow: "0 2px 10px rgba(0,0,0,0.85)",
                  }}
                >
                  {t.text}
                </span>
              );
            })}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
