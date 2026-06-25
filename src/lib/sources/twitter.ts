import type { RawArticle } from "./types";
import { env } from "../env";

// STUB: Twitter/X está desactivado por ahora (la API oficial es de pago y el
// scraping es frágil). La interfaz ya está lista: cuando consigas acceso,
// pon TWITTER_ENABLED=true y TWITTER_BEARER_TOKEN=... en .env e implementa
// la llamada aquí (p.ej. GET /2/tweets/search/recent o un proveedor externo).
export async function fetchTwitter(): Promise<RawArticle[]> {
  if (!env.twitterEnabled) return [];
  if (!env.twitterBearer) {
    console.warn("[twitter] habilitado pero falta TWITTER_BEARER_TOKEN");
    return [];
  }
  // TODO: implementar cuando haya acceso a la API de X.
  console.warn("[twitter] integración pendiente de implementar");
  return [];
}
