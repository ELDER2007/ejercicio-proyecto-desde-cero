/** Convierte el contenido técnico del diario de auditoría en frases legibles ("Precio: COP 90.000"). */
export type ChangeCtx = {
  field: (key: string) => string;
  yes: string;
  no: string;
  changed: string;
  money: (minor: number) => string;
  date: (iso: string) => string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatChangeValue(key: string, value: unknown, ctx: ChangeCtx): string {
  if (value === null || value === undefined) return "—";
  if (value === "changed") return ctx.changed; // las direcciones de fotos/grabaciones no se guardan en el diario
  if (typeof value === "boolean") return value ? ctx.yes : ctx.no;
  if (typeof value === "number") return key.endsWith("_minor") ? ctx.money(value) : String(value);
  if (typeof value === "string") {
    if (ISO_DATE.test(value)) return ctx.date(value);
    if (UUID.test(value)) return value.slice(0, 8);
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => String(v).toUpperCase()).join(", ");
  return JSON.stringify(value);
}

export function describeChanges(changes: Record<string, unknown> | null | undefined, ctx: ChangeCtx): string[] {
  if (!changes) return [];
  return Object.entries(changes).map(([k, v]) => `${ctx.field(k)}: ${formatChangeValue(k, v, ctx)}`);
}
