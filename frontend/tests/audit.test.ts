import { describe, expect, it } from "vitest";
import { describeChanges, formatChangeValue, type ChangeCtx } from "@/lib/audit";

const ctx: ChangeCtx = {
  field: (k) => ({ price_minor: "Precio", capacity: "Capacidad", cover_image_url: "Foto", starts_at: "Inicio", is_recorded: "Se grabará", translations: "Traducciones" })[k] ?? k,
  yes: "Sí", no: "No", changed: "modificada",
  money: (m) => `COP ${m / 100}`,
  date: () => "FECHA",
};

describe("describeChanges", () => {
  it("muestra frases legibles en lugar de JSON", () => {
    expect(describeChanges({ price_minor: 9_000_000, capacity: 12, cover_image_url: "changed" }, ctx)).toEqual([
      "Precio: COP 90000", "Capacidad: 12", "Foto: modificada",
    ]);
  });
  it("formatea fechas, booleanos, listas e identificadores", () => {
    expect(formatChangeValue("starts_at", "2026-12-12T15:00:00-05:00", ctx)).toBe("FECHA");
    expect(formatChangeValue("is_recorded", true, ctx)).toBe("Sí");
    expect(formatChangeValue("translations", ["en", "es"], ctx)).toBe("EN, ES");
    expect(formatChangeValue("venue_id", "64a53f5a-cf63-429c-94ba-af0ffa72273c", ctx)).toBe("64a53f5a");
  });
  it("tolera datos vacíos o desconocidos", () => {
    expect(describeChanges(null, ctx)).toEqual([]);
    expect(describeChanges({ algo_nuevo: null }, ctx)).toEqual(["algo_nuevo: —"]);
  });
});
