# Despliegue en Render (y opción con Vercel)

El proyecto está preparado para **Render** con un solo archivo, [`render.yaml`](../render.yaml): crea la base de datos PostgreSQL, la API (FastAPI) y la web (Next.js). El despliegue está **probado en local** simulando Render (base vacía, `PORT` dinámico, mismas variables y comando): arranque, migraciones, datos de demostración, worker y los 11 tests E2E pasan.

> Es una **DEMO**: los pagos son simulados (no se cobra nada) y no se envían correos. Las notificaciones sí aparecen dentro de la web.

## Opción A (recomendada): todo en Render

1. **Sube el código a GitHub.** El repositorio ya tiene `origin` configurado; los commits están solo en local:
   ```bash
   git push origin main
   ```
   (`.env` no se sube: está en `.gitignore`.) Render necesita acceso de lectura a ese repositorio; si pertenece a una organización, puede que necesites permiso o hacer un *fork* a tu cuenta.
2. En Render: **New → Blueprint** → elige el repositorio. Render lee `render.yaml` y crea `tallerya-db`, `tallerya-api` y `tallerya-web`.
3. Cuando lo pida, rellena **`BOOTSTRAP_OWNER_EMAIL`** y **`BOOTSTRAP_OWNER_PASSWORD`** (mínimo 10 caracteres): será tu usuario Propietario (administrador). No se guardan en Git.
4. Espera a que los tres servicios estén en verde (el primer build tarda varios minutos).
5. **Comprueba los nombres de las URLs.** El YAML da por hecho que quedan así:
   - API: `https://tallerya-api.onrender.com`
   - Web: `https://tallerya-web.onrender.com`

   Si Render añadió un sufijo (porque el nombre estaba ocupado), corrige estas variables con las URLs reales:
   | Servicio | Variable | Valor |
   |---|---|---|
   | `tallerya-web` | `API_INTERNAL_URL` | URL pública de la API |
   | `tallerya-web` | `NEXT_PUBLIC_SITE_URL` | URL pública de la web |
   | `tallerya-api` | `FRONTEND_URL` | URL pública de la web |

   y en `tallerya-web` usa **Manual Deploy → Clear build cache & deploy** (la URL de la API se fija al construir).
6. **Prueba:** abre `https://<tu-web>/es`, inicia sesión con el propietario, reserva con otra cuenta y paga con el botón "Simular pago exitoso".

### Comprobación rápida después de desplegar
| URL | Debe mostrar |
|---|---|
| `https://<api>/ready` | `{"status":"ready",...}` |
| `https://<web>/es` | la portada con 8 cursos con foto |
| `https://<web>/llms.txt` | los cursos con su URL real |
| `https://<web>/sitemap.xml` | URLs con tu dominio (no `localhost`) |

### Limitaciones del plan gratuito (importante para una demo)
- **Se "duerme" tras ~15 min sin visitas** y la primera petición tarda de 30 a 60 s. Abre la web un minuto antes de enseñarla.
- **La base de datos gratuita caduca a los 30 días.** Hay que recrearla o pasar a un plan de pago.
- El **worker va dentro de la API** (`EMBEDDED_WORKER=true`) para no pagar un worker aparte. Si la API duerme, las tareas (caducar reservas, avisos) esperan, pero **las plazas siguen siendo correctas**: la disponibilidad ignora las reservas vencidas aunque el worker no haya corrido.
- Sin `SMTP_HOST` no se envían correos; los avisos se ven en "Notificaciones" dentro de la cuenta.

## Activar el asistente de IA (opcional)
El asistente (botón ✨ "Pregúntale al asistente") usa Claude con herramientas de **solo lectura**: busca cursos reales y da su URL; **no reserva ni paga**. Sin clave, **no aparece** y el resto de la web funciona igual.

1. Crea una clave en **console.anthropic.com → API Keys** (empieza por `sk-ant-`). Cuesta dinero por uso: pon un límite de gasto en tu cuenta.
2. En Render, en **`tallerya-api` → Environment**, rellena `ANTHROPIC_API_KEY` con la clave y guarda (la API se reinicia sola).
3. Abre la web: debe aparecer el botón. Prueba: *"Quiero algo creativo este fin de semana"*.

**Coste y control.** Cada mensaje consulta el catálogo y responde con unos pocos miles de tokens. Hay dos topes: **8 mensajes por minuto por visitante** y **300 mensajes al día en total** (`ASSISTANT_DAILY_LIMIT`). Con el modelo por defecto (`claude-opus-5-5`, $4/$20 por millón de tokens) el peor caso diario son unos pocos dólares. Para gastar bastante menos, cambia `ASSISTANT_MODEL` a `claude-haiku-5-5`.
La clave **nunca** va en el repositorio: solo en las variables de entorno del servicio.

## Opción B: web en Vercel + API y base de datos en Render
Vercel no puede alojar PostgreSQL ni el worker; por eso el backend va a Render igualmente.
1. En Render despliega el Blueprint y **borra el servicio `tallerya-web`** del `render.yaml` (o suspéndelo).
2. En Vercel: **Add New → Project** → mismo repositorio → **Root Directory: `frontend`**.
3. Variables de entorno en Vercel:
   - `API_INTERNAL_URL` = URL pública de la API en Render (`https://tallerya-api.onrender.com`)
   - `NEXT_PUBLIC_SITE_URL` = tu dominio de Vercel (si no la pones, se usa `VERCEL_PROJECT_PRODUCTION_URL`).
4. En Render, en `tallerya-api`: `FRONTEND_URL` = tu dominio de Vercel.
5. Despliega. El navegador sigue hablando solo con el dominio de Vercel (`/api/*` se reenvía a Render), así que las cookies funcionan sin configurar CORS.

> `API_INTERNAL_URL` y `NEXT_PUBLIC_SITE_URL` se fijan al construir: cámbialas y vuelve a desplegar.

## Cambiar datos y fotos sin tocar el código
Con sesión de administrador: **Administración → Cursos → Editar**. Se pueden cambiar textos (ES/EN), fecha, capacidad, precio y la **foto** (se pega su dirección `https://…` y se ve una vista previa; vacía = quitar la foto). Los cambios se ven al instante en la web.
- Solo se aceptan fotos por `https` y hay que describirlas (accesibilidad).
- La foto se optimiza solo si su servidor está en `frontend/lib/imageHosts.ts` o en la variable `IMAGE_HOSTS`; si no, se muestra sin optimizar. Algunos sitios bloquean mostrar sus imágenes en otras webs: entonces se ve el recuadro de color (lo ideal es alojar la imagen en un sitio propio).
- No se puede bajar la capacidad por debajo de las plazas ya ocupadas ni editar un curso cancelado. Cada cambio queda en auditoría (sin guardar las direcciones).

## Pasar de demo a producción real
- Elegir proveedor de pagos y quitar `ALLOW_FAKE_PAYMENTS` / `PAYMENT_PROVIDER=fake` (la app **se niega a arrancar** en staging/producción con pagos simulados si no es una demo explícita).
- Configurar `SMTP_*` (correo transaccional) y `APP_ENV=production`.
- Plan de pago de la base de datos con copias de seguridad; usar `scripts/backup.sh` y `scripts/restore-check.sh` como referencia.
- Dominio propio con HTTPS y registrarlo en Google Search Console ([seo-y-agentes.md](seo-y-agentes.md)).
- Proxy inverso con `TRUSTED_PROXY_HOPS=1` si se quiere límite de intentos por cliente (ver README).
