# AI Actualidad — Dashboard de noticias IA + motor de guiones

Dashboard local para una marca personal de **IA aplicada a negocios digitales**.
Hace dos cosas, sin que tengas que tocar nada:

1. **Noticias en vivo**: agrega noticias de IA (Reddit, RSS oficiales, Hacker News),
   las **puntúa 0–100** por su utilidad para "IA + negocio" y les detecta un
   **ángulo de negocio** y una **conexión con la actualidad**.
2. **Guiones automáticos**: cuando entra una noticia relevante, genera guiones
   (Reel/Short y/o YouTube) usando **tus bases de negocio + tu tonalidad**, los
   **autopuntúa 0–10 de forma crítica** y te dice cómo mejorarlos. Tú solo grabas.

---

## Requisitos

- **Node.js 24+** (usa el SQLite nativo `node:sqlite`, sin compilación).
- Una **clave de API de Anthropic** (`sk-ant-...`).

## Puesta en marcha (3 pasos)

1. **Configura la clave**
   ```bash
   copy .env.example .env      # (Windows) o: cp .env.example .env
   ```
   Edita `.env` y pon tu `ANTHROPIC_API_KEY`.

2. **Rellena tu marca** desde la pestaña **🧠 Marca** del dashboard (no desde
   archivos locales): problema, cliente ideal, oferta, análisis de
   competencia, tonalidad e historia. Se guarda en la base de datos y se usa
   al instante en el siguiente guion, sin reiniciar nada.

   (La carpeta `knowledge/` del repo es un mecanismo antiguo, ya retirado del
   código — no la uses, lo que ahí pongas no se lee.)

3. **Instala y arranca**
   ```bash
   npm install
   npm run dev
   ```
   Abre **http://localhost:3000**. `npm run dev` levanta a la vez:
   - la **web** (dashboard), y
   - el **worker** de fondo que trae noticias, las clasifica y genera guiones según `POLL_CRON` (cada 2h por defecto).

---

## Cómo funciona el coste (y cómo se minimiza)

Usa la **API de Anthropic** (pago por uso) con varias optimizaciones:

- **Clasificar noticias → Haiku 4.5** (modelo barato) vía **Batch API** = **−50%**.
- **Generar/puntuar guiones → Sonnet 4.6** (equilibrio calidad/precio).
- **Prompt caching**: tus bases de negocio + tonalidad se cachean y se reutilizan
  baratas en cada guion (lecturas de caché ~0.1× del precio).
- **Topes diarios** en `.env`: `MAX_SCRIPTS_PER_DAY` y `MAX_DAILY_USD`. Cuando se
  alcanzan, el motor pausa la generación (lo ves en la pestaña **Ajustes**).

Modelos por defecto (editables en `.env`):
`claude-haiku-4-5` (clasificar) · `claude-sonnet-4-6` (generar) · `claude-opus-4-8` (premium).

---

## Pestañas

- **📰 Noticias en vivo** — feed ordenado por relevancia, con autorefresco cada 30 s
  y botón “Actualizar ahora”.
- **🎬 Guiones** — guiones generados con su nota 0–10, coincidencia de tono, crítica
  y mejoras. Marca los que ya revisaste.
- **⚙️ Ajustes** — estado del sistema, gasto del día, datos acumulados y configuración.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Web + worker (desarrollo) |
| `npm run build` && `npm start` | Producción |
| `npm run worker` | Solo el worker |
| `npm run worker:once` | Un único ciclo (traer→clasificar→generar) y salir |
| `npm run db:reset` | Borra la base de datos (se recrea al arrancar) |

---

## Configuración (`.env`)

| Variable | Por defecto | Descripción |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | **Obligatoria** |
| `POLL_CRON` | `*/10 * * * *` | Frecuencia del worker |
| `RELEVANCE_THRESHOLD` | `70` | Score mínimo (0–100) para generar guion |
| `GENERATE_FORMATS` | `reel,youtube` | Formatos a generar |
| `USE_BATCH_CLASSIFY` | `true` | Clasificación por lotes (−50%, async) |
| `MAX_SCRIPTS_PER_DAY` | `15` | Tope diario de guiones |
| `MAX_DAILY_USD` | `5` | Tope diario de gasto estimado |
| `REDDIT_SUBS` | varios | Subreddits a seguir |
| `TWITTER_ENABLED` | `false` | Twitter/X (desactivado; ver abajo) |

Las fuentes RSS y de Hacker News se editan en `src/lib/sources/feeds.ts`.

---

## Notas

- **Twitter/X** está desactivado por ahora (su API oficial es de pago y el scraping
  es frágil). El código ya tiene el hueco preparado (`src/lib/sources/twitter.ts`):
  pon `TWITTER_ENABLED=true` + `TWITTER_BEARER_TOKEN` e impleméntalo cuando tengas acceso.
- **Reddit** sin OAuth puede dar error 403 desde algunas redes; desde tu equipo
  personal suele funcionar. Si no, el sistema sigue con RSS + Hacker News.
- `node:sqlite` es experimental en Node 24: verás un aviso `ExperimentalWarning`
  al arrancar el worker. Es normal y no afecta.
- Sin `ANTHROPIC_API_KEY` válida, el dashboard sigue trayendo noticias pero no
  clasifica ni genera guiones (lo indica en Ajustes).

## Desplegar en la red

Para publicarlo (Railway o Render — Vercel no encaja por ser serverless), sigue
**[DEPLOY.md](DEPLOY.md)**. Resumen: necesitas un host con servidor persistente y
disco montado, defines `ANTHROPIC_API_KEY`, `DASHBOARD_PASSWORD` y `DB_PATH` como
variables de entorno, y `npm start` levanta web + worker. El acceso queda
protegido por usuario/contraseña (HTTP Basic Auth) cuando `DASHBOARD_PASSWORD`
está definida.

## Estructura del proyecto

```
src/
  app/            Dashboard Next.js (páginas + rutas /api)
  components/     Nav, hook de polling
  lib/
    sources/      reddit, rss, hackernews, twitter (stub)
    db.ts         SQLite (node:sqlite, conexión perezosa)
    knowledge.ts  Carga /knowledge (md/txt/pdf/docx)
    classify.ts   Clasificación (Batch Haiku)
    generate.ts   Generación de guiones (caching)
    critique.ts   Autopuntuación 0–10
    pipeline.ts   Orquestación de un ciclo
    budget.ts     Topes de gasto
  worker/         Worker de fondo (node-cron)
knowledge/        TUS documentos (bases, tonalidad, historia)
data/             Base de datos SQLite (autocreada)
```
