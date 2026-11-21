# Rendimiento: medición, mejoras y resultado (Hito 13)

**Método:** medir → identificar → optimizar → volver a medir. Herramienta: Lighthouse 13.6.0, perfil **móvil** (red y CPU limitadas, el predeterminado), contra la build de producción en Docker (`localhost:3000`). Tras las mejoras: **mediana de 3 ejecuciones**; la medición inicial fue una sola ejecución. Cifras del 21-11-2026.

## Resultado

| Página | Rendimiento | LCP | TBT | Peso | Accesibilidad |
|---|---|---|---|---|---|
| Portada `/es` | 80 → **94** | 0,9 s → 0,9 s | 850 → **288 ms** | 634 → **428 KB** | 100 → 100 |
| Catálogo `/es/cursos` | 88 → **99** | 3,3 s → **0,9 s** | 220 → **112 ms** | 707 → **463 KB** | 98 → **100** |
| Ficha de curso | 97 → 95 (*) | 0,8 → 2,6 s (*) | 190 → 177 ms | 211 → 276 KB (*) | 100 → 100 |

(\*) **No es comparable:** antes se midió «Cerámica» con su foto bloqueada (no se descargaba) y después «Pan de masa madre» con su foto real y la primera optimización en frío.
CLS en todas: 0,016 (objetivo ≤ 0,1). SEO 100 en las páginas públicas; en `/login` es 63 **a propósito** (lleva `noindex`).

## Qué se encontró y qué se cambió

| Hallazgo (medido) | Cambio |
|---|---|
| Cada visitante anónimo lanzaba 2 peticiones inútiles (`/users/me` y `/auth/refresh`) que daban 401 y ensuciaban la consola | Solo se pregunta al servidor si existe la cookie de sesión (`csrf_token`). Menos peticiones y 0 errores propios en consola |
| Bloqueo del hilo principal de 850 ms en la portada | Resuelto en gran parte por lo anterior (menos peticiones y trabajo al arrancar): 288 ms |
| LCP de 3,3 s en el catálogo: fotos enteras (hasta 860 KB) desde webs ajenas y con carga diferida (`lazy`) | Las fotos de servidores de una **lista cerrada** (`lib/imageHosts.ts`) se sirven redimensionadas y en WebP desde nuestro servidor (de 140–860 KB a 22–61 KB); las de la primera fila cargan con prioridad alta |
| Títulos de las tarjetas saltaban de h1 a h3 | Nivel h2 en el catálogo |
| Si el servidor de origen bloquea la descarga, la foto salía rota | Cae a la imagen original y, si tampoco carga, muestra un cuadro de color |

## Lo que sigue pendiente (y por qué)
- **Las fotos siguen enlazadas desde webs de terceros.** Tres de ellas (cerámica, mecánica y macramé) **bloquean a los robots** con una página anti-bots, y dejaron de cargar al hacer las pruebas. Es la causa de los errores de consola que quedan (Buenas prácticas 96) y de que esas tarjetas muestren el cuadro de color. **Solución real:** guardar copias de las fotos en el proyecto (o subirlas a un almacenamiento propio). No se intentó saltarse la protección de esas webs.
- Mejoras menores que Lighthouse todavía sugiere: JavaScript no usado (~28 KB), JavaScript heredado (~14 KB), CSS que bloquea el pintado (~150 ms) y compatibilidad con la caché de ida y vuelta del navegador.
- **No se midió** el rendimiento de la API bajo carga (percentiles de latencia, concurrencia con k6): queda como trabajo futuro.
- La **demo en Render (plan gratuito)** se duerme y tarda de 30 a 60 s en despertar: es una limitación del plan, no de la aplicación.

## Cómo repetir la medición
```bash
docker compose up -d --build
export CHROME_PATH=$HOME/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome   # tras `npx playwright install chromium`
npx lighthouse@13.6.0 http://localhost:3000/es/cursos --chrome-flags="--headless=new --no-sandbox" \
  --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=catalogo.json
```
