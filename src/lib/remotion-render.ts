import path from "node:path";
import { createServer, type Server } from "node:http";
import { createReadStream, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { TikTokPage } from "@remotion/captions";
import type { CaptionedVideoProps } from "../remotion/CaptionedVideo";

// El bundling (webpack) de la composición tarda varios segundos — se hace
// UNA vez por proceso y se reutiliza en todos los renders siguientes, mismo
// criterio que la conexión perezosa de la BD en db.ts.
let bundleLocationPromise: Promise<string> | null = null;
function getBundleLocation(): Promise<string> {
  if (!bundleLocationPromise) {
    bundleLocationPromise = bundle({
      entryPoint: path.join(process.cwd(), "src/remotion/index.ts"),
    }).catch((e) => {
      bundleLocationPromise = null; // si falla, reintentar en la próxima llamada en vez de quedar roto para siempre
      throw e;
    });
  }
  return bundleLocationPromise;
}

// El compositor de Remotion (OffthreadVideo) SOLO acepta descargar el vídeo
// de fondo por http(s) — un file:// falla con "Can only download URLs
// starting with http:// or https://" (confirmado en pruebas). Como el mp4 de
// HeyGen vive en el disco de uploads, no en el `public/` de la composición,
// se sirve por un servidor HTTP efímero (puerto libre, solo local) durante
// el render y se cierra al terminar.
function serveLocalFile(filePath: string): Promise<{ url: string; close: () => void }> {
  const size = statSync(filePath).size;
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": size });
    createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/video.mp4`, close: () => server.close() });
    });
  });
}

export type RenderCaptionedVideoOptions = {
  videoPath: string;
  pages: TikTokPage[];
  durationInSeconds: number;
  widthPx: number;
  heightPx: number;
  outPath: string;
  title: string | null;
  subtitle: string | null;
};

export async function renderCaptionedVideo(opts: RenderCaptionedVideoOptions): Promise<void> {
  const [serveUrl, local] = await Promise.all([getBundleLocation(), serveLocalFile(opts.videoPath)]);
  try {
    const inputProps: CaptionedVideoProps = {
      videoSrc: local.url,
      pages: opts.pages,
      durationInSeconds: opts.durationInSeconds,
      widthPx: opts.widthPx,
      heightPx: opts.heightPx,
      title: opts.title,
      subtitle: opts.subtitle,
    };

    const composition = await selectComposition({ serveUrl, id: "CaptionedVideo", inputProps });

    // Sin concurrency, Remotion abre tantas pestañas de Chromium en paralelo
    // como CPUs detecte — en la misma instancia pequeña de Render donde
    // corren también el servidor web y el worker, eso se come la RAM
    // disponible y el propio Render mata el proceso (memory limit -> 502
    // para todo el mundo, no solo para quien pidió el vídeo). Renderiza más
    // despacio, un frame de Chromium a la vez, pero no revienta la memoria.
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: opts.outPath,
      inputProps,
      concurrency: 1,
    });
  } finally {
    local.close();
  }
}
