# Guía para quien revisa Tallerya

Esta página resume qué probar, cómo, y qué limitaciones de la demo conviene conocer. No contiene contraseñas: el acceso al panel de administración lo facilita la autora.

## 1. Ver la demo (sin instalar nada)

**https://tallerya-web.onrender.com**

> **La primera visita puede tardar 1–2 minutos.** La demo está en el plan gratuito de Render, que «duerme» los servicios tras 15 minutos sin visitas. Verás una pantalla negra de Render («Service waking up») y después la web. Es normal y solo ocurre al despertar; las visitas siguientes son rápidas. Conviene abrir la dirección unos minutos antes de empezar la revisión.

## 2. Qué probar (5–10 minutos)

| Quiero ver… | Cómo |
|---|---|
| Catálogo, búsqueda y filtros | `/es/cursos` → buscar «masa madre», filtrar por categoría |
| Español / inglés | Selector **ES / EN** de la cabecera (las direcciones cambian: `/es/cursos` ↔ `/en/courses`) |
| Flujo de un cliente | Entrar en un curso → «Inicia sesión para reservar» → **Crear cuenta** → «Reservar mi plaza» → «Pagar ahora» → «Simular pago exitoso» |
| Control de cupos | La reserva ocupa una plaza durante 24 h (se ve la cuenta atrás); al caducar o cancelarse se libera |
| Móvil | Reducir la ventana del navegador o abrirla en el teléfono: no hay desbordes de 320 px en adelante |
| Buscadores y asistentes | `/robots.txt`, `/sitemap.xml`, `/llms.txt` y el JSON-LD (`Event`) en el código fuente de cada curso |
| Panel de administración | `/es/admin` (requiere cuenta de propietario): crear y **editar cursos**, aprobar o rechazar reservas, pagos, comisiones, métricas y auditoría |

Puedes registrar tu propia cuenta de cliente con cualquier correo; **no se envían correos reales** en la demo (no hay servidor de correo configurado) y los pagos son simulados.

## 3. Limitaciones conocidas de la demo (honestidad técnica)

- **Plan gratuito:** además de dormirse, la **base de datos gratuita de Render caduca a los 30 días** de crearse (creada el 21/11/2026, por tanto hacia el **21/12/2026**). Para uso real hay que pasar a un plan de pago ([despliegue](despliegue.md)).
- **Fechas de los cursos de demostración:** del 1 al 19 de diciembre de 2026. Los cursos pasados no se pueden reservar y no se reserva con menos de 24 h de antelación (regla del cliente). Desde el panel se pueden cambiar fechas, precios y fotos sin tocar código.
- **Pagos:** proveedor **simulado** (la pasarela real está pendiente de decisión del cliente: [ADR-0006](adr/0006-pagos-desacoplados.md)). La aplicación se niega a arrancar en producción con pagos simulados salvo que se active expresamente el modo demo.
- **Fotos de los cursos:** se enlazan desde webs externas (es un ejercicio interno). Si alguna web las retira o las bloquea, la tarjeta muestra un recuadro de color en lugar de romperse. Lo recomendable en producción es alojarlas en el propio proyecto.
- **Asistente de IA:** implementado y probado, pero **desactivado** por decisión del cliente (se activa con `ANTHROPIC_API_KEY`; [ADR-0007](adr/0007-asistente-ia.md)).
- **WhatsApp y función exacta del QR:** pendientes de definir con el cliente.

## 4. Ejecutarlo en local

Requisitos: Docker con Compose v2.

```bash
python3 scripts/init_env.py            # crea .env con secretos aleatorios (no se sube a Git)
docker compose up -d --build           # base de datos, migraciones, API, worker, web y correo de pruebas
docker compose exec backend python -m app.cli seed-demo
```

Web: http://localhost:3000 · API (OpenAPI): http://localhost:8000/docs · correos de prueba (Mailpit): http://localhost:8025

Para crear un administrador local: ver «Puesta en marcha» en el [README](../README.md).

## 5. Dónde está la evidencia de calidad

| Qué | Dónde |
|---|---|
| Análisis y reglas de negocio (45 puntos) | [`00-discovery/analisis.md`](00-discovery/analisis.md) |
| Decisiones de arquitectura | [`adr/`](adr/) (monolito modular, FastAPI, PostgreSQL, concurrencia de cupos, worker/outbox, pagos desacoplados, asistente IA) |
| Tests | Backend: **205** con PostgreSQL real y **94 %** de cobertura (incluye concurrencia sobre la última plaza y propiedades con Hypothesis). Frontend: **26** unitarios y **15** E2E de navegador con comprobación de accesibilidad (axe) |
| CI | GitHub Actions: lint, tipos, tests, build, escaneo de dependencias, secretos e imágenes Docker |
| Rendimiento medido | [`rendimiento.md`](rendimiento.md) (Lighthouse móvil: portada 94, catálogo 99, accesibilidad 100) |
| SEO y agentes | [`seo-y-agentes.md`](seo-y-agentes.md) |
| Despliegue | [`despliegue.md`](despliegue.md) y `render.yaml` |
