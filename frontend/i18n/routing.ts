import { defineRouting } from "next-intl/routing";

/**
 * Estrategia i18n: prefijo de idioma + rutas traducidas (una sola app, sin duplicar páginas).
 *   /es/cursos/ceramica-para-principiantes   ·   /en/courses/beginner-ceramics
 */
export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
  pathnames: {
    "/": "/",
    "/courses": { es: "/cursos", en: "/courses" },
    "/courses/[slug]": { es: "/cursos/[slug]", en: "/courses/[slug]" },
    "/login": { es: "/iniciar-sesion", en: "/login" },
    "/register": { es: "/registro", en: "/register" },
    "/forgot-password": { es: "/recuperar-contrasena", en: "/forgot-password" },
    "/reset-password": { es: "/restablecer-contrasena", en: "/reset-password" },
    "/account": { es: "/mi-cuenta", en: "/account" },
    "/account/bookings/[id]": { es: "/mi-cuenta/reservas/[id]", en: "/account/bookings/[id]" },
    "/account/notifications": { es: "/mi-cuenta/notificaciones", en: "/account/notifications" },
    "/account/profile": { es: "/mi-cuenta/perfil", en: "/account/profile" },
    "/faq": { es: "/preguntas-frecuentes", en: "/faq" },
    "/contact": { es: "/contacto", en: "/contact" },
    "/privacy": { es: "/privacidad", en: "/privacy" },
    "/terms": { es: "/terminos", en: "/terms" },
    "/pay/fake/[reference]": "/pay/fake/[reference]",
    "/admin": "/admin",
    "/admin/courses": "/admin/courses",
    "/admin/courses/new": "/admin/courses/new",
    "/admin/courses/[id]": "/admin/courses/[id]",
    "/admin/bookings": "/admin/bookings",
    "/admin/payments": "/admin/payments",
    "/admin/users": "/admin/users",
    "/admin/commissions": "/admin/commissions",
    "/admin/audit": "/admin/audit",
  },
});

export type Locale = (typeof routing.locales)[number];
