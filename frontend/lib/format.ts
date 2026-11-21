/** Dinero: el backend envía enteros en la unidad mínima (centavos). Nunca se usa float para calcular. */
export function formatMoney(minor: number, currency: string, locale: string): string {
  const major = minor / 100; // solo para MOSTRAR
  return new Intl.NumberFormat(locale === "es" ? "es-CO" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "COP" ? 0 : 2,
  }).format(major);
}

/** Fecha/hora en la zona horaria DEL CURSO (Bogotá), no la del navegador. */
export function formatDateTime(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-CO" : "en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

export function formatTimeRange(startIso: string, endIso: string, locale: string, timeZone: string): string {
  const f = new Intl.DateTimeFormat(locale === "es" ? "es-CO" : "en-US", { timeStyle: "short", timeZone });
  return `${f.format(new Date(startIso))} – ${f.format(new Date(endIso))}`;
}

export function formatDateShort(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-CO" : "en-US", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(iso));
}

/** Tiempo restante legible a partir de un ISO futuro. */
export function remaining(iso: string, now: number = Date.now()): { hours: number; minutes: number; expired: boolean } {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { hours: 0, minutes: 0, expired: true };
  return { hours: Math.floor(ms / 3_600_000), minutes: Math.floor((ms % 3_600_000) / 60_000), expired: false };
}

/** ISO (UTC) -> "YYYY-MM-DDTHH:mm" en hora de Bogotá, el formato que usa <input type="datetime-local">. */
export function toBogotaLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(iso));
  return parts.replace(" ", "T");
}

/** "YYYY-MM-DDTHH:mm" (hora de Bogotá, UTC-5 sin cambio horario) -> ISO con zona. */
export function bogotaInputToIso(local: string): string {
  return `${local}:00-05:00`;
}
