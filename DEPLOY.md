# 🚀 Desplegar AI Actualidad en la red

Esta app necesita un host con **servidor Node persistente** (no serverless),
porque usa **SQLite en disco** y un **worker 24/7**. Los que mejor encajan:
**Railway** o **Render**. (Vercel NO sirve tal cual: ver nota al final.)

> ⚠️ **Antes de subir nada:**
> - Tu API key estuvo en `.env.example` en versiones anteriores. **Genera una
>   nueva** en https://console.anthropic.com y usa esa solo como variable de
>   entorno (no la escribas en ningún archivo del repo).
> - El archivo `.env` está en `.gitignore`: **no se sube** (bien). Las claves se
>   ponen en el panel del host como *Environment Variables*.

---

## Paso 0 — Crear el repositorio (necesitas Git)

No tienes Git instalado. Opción más fácil: instala **GitHub Desktop**
(https://desktop.github.com) o **Git** (https://git-scm.com/download/win).

Con Git instalado, desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "AI Actualidad"
```

Crea un repo vacío en GitHub y súbelo:

```bash
git remote add origin https://github.com/TU_USUARIO/ai-actualidad.git
git branch -M main
git push -u origin main
```

(Verifica que `.env` NO aparece en el commit — debe estar ignorado.)

---

## Opción A — Railway (recomendada)

1. Entra en https://railway.app → **New Project → Deploy from GitHub repo** y
   elige tu repo.
2. Railway detecta Node. Configura:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
3. **Variables** (pestaña Variables) — añade como mínimo:
   - `ANTHROPIC_API_KEY` = tu clave nueva
   - `DASHBOARD_PASSWORD` = una contraseña fuerte
   - `DB_PATH` = `/data/app.db`
   - (opcionales) `MODEL_GENERATE`, `MAX_DAILY_USD`, etc.
4. **Disco persistente** (clave para no perder datos): añade un **Volume**
   montado en `/data`. Así la BD (`/data/app.db`) sobrevive a los redeploys.
5. Deploy. Railway te da una URL pública. Al entrar te pedirá usuario
   (`admin`) y la contraseña que pusiste.

---

## Opción B — Render (este repo ya trae `render.yaml`)

**Camino rápido (Blueprint):**
1. https://render.com → **New + → Blueprint** → conecta el repo `news-ai-dashboard`.
2. Render lee `render.yaml` y crea el servicio web **+ el disco persistente en
   `/data`** y las variables (`DB_PATH`, `ADMIN_EMAILS`, `NODE_VERSION=24`).
3. Pulsa **Apply**. En unos minutos tendrás la URL pública.
4. Entra → **Crear cuenta** con `jsegomeez@gmail.com` → serás **admin**
   automáticamente (verás la pestaña 🛡️ Admin con el uso de todos).

> ⚠️ El `render.yaml` usa `plan: starter` (de pago) porque **el disco
> persistente lo requiere**. Si lo dejas en free, perderás los datos en cada
> redeploy. Cada usuario pone su propia clave de Anthropic en Ajustes.

**Camino manual (sin Blueprint):**
1. https://render.com → **New → Web Service** → conecta tu repo.
2. Configura:
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
3. **Environment** → añade las mismas variables que en Railway
   (`ANTHROPIC_API_KEY`, `DASHBOARD_PASSWORD`, `DB_PATH=/data/app.db`).
4. **Disks** → añade un disco persistente montado en `/data` (mínimo 1 GB).
5. Crea el servicio. Render te da la URL pública con la contraseña activa.

> Nota Render: el plan gratuito **no incluye disco persistente** y el servicio
> se duerme por inactividad (el worker se pausa). Para uso real, plan de pago.

---

## Variables de entorno (resumen)

| Variable | Obligatoria | Valor |
|---|---|---|
| `DB_PATH` | ✅ (con disco) | `/data/app.db` |
| `POLL_CRON` | — | Frecuencia del worker (def. `*/10 * * * *`) |
| Resto | — | Ver `.env.example` |

> **La app es multiusuario:** no hay clave global ni contraseña global. Cada
> persona crea su cuenta (registro/login nativo sobre SQLite) y mete **su propia
> clave de Anthropic** en Ajustes; su consumo se carga a su cuenta. Por eso ya
> no se configuran `ANTHROPIC_API_KEY` ni `DASHBOARD_PASSWORD` como variables.

---

## Cosas que saber tras desplegar

- **Reddit dará 403** desde las IPs del host (datacenter). RSS + Hacker News
  funcionan con normalidad. Si quieres Reddit, habría que añadir OAuth.
- El **worker** corre dentro del mismo contenedor (lo lanza `npm start`), así
  que sigue clasificando y generando solo, según `POLL_CRON`.
- La **contraseña** protege también las APIs (incluida la que gasta tu saldo).
- Sube tus **bases de negocio** desde la pestaña 🧠 Marca (se guardan en la BD;
  no dependen de archivos locales).

---

## ¿Y Vercel?

Vercel es *serverless*: sin disco persistente ni procesos 24/7. Para usar Vercel
habría que (1) migrar SQLite a una BD serverless tipo **Turso/libSQL** —refactor
async de toda la capa de datos— y (2) convertir el worker en **Vercel Cron**
llamando a `/api/run`. Es bastante más trabajo; si lo quieres, se puede hacer en
una segunda fase.
