import { Composition } from "remotion";
import { CaptionedVideo, type CaptionedVideoProps } from "./CaptionedVideo";

const FPS = 30;

const DEFAULT_PROPS: CaptionedVideoProps = {
  videoSrc: "",
  pages: [],
  durationInSeconds: 1,
  widthPx: 1080,
  heightPx: 1920,
  title: null,
  subtitle: null,
};

// La duración/dimensiones reales no se saben hasta el render (dependen del
// vídeo de HeyGen de turno) — calculateMetadata las deriva de los props que
// se le pasan en cada llamada a selectComposition/renderMedia, en vez de
// fijarlas aquí como constantes.
export function RemotionRoot() {
  return (
    <Composition
      id="CaptionedVideo"
      component={CaptionedVideo}
      fps={FPS}
      width={DEFAULT_PROPS.widthPx}
      height={DEFAULT_PROPS.heightPx}
      durationInFrames={FPS}
      defaultProps={DEFAULT_PROPS}
      calculateMetadata={async ({ props }) => ({
        durationInFrames: Math.max(1, Math.round(props.durationInSeconds * FPS)),
        width: props.widthPx,
        height: props.heightPx,
      })}
    />
  );
}
