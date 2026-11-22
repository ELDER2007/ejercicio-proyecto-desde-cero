import { describe, expect, it } from "vitest";
import { formatDateTime, formatMoney, remaining } from "@/lib/format";

describe("formatMoney", () => {
  it("muestra pesos colombianos a partir de centavos enteros", () => {
    expect(formatMoney(18_000_000, "COP", "es")).toMatch(/180\.000/);
    expect(formatMoney(18_000_000, "COP", "es")).toMatch(/^COP\s180\.000$/); // moneda explícita, no solo "$"
    expect(formatMoney(18_000_000, "COP", "en")).toMatch(/180,000/);
  });
  it("no pierde precisión en importes grandes", () => {
    expect(formatMoney(123_456_700, "COP", "es")).toMatch(/1\.234\.567/);
  });
});

describe("formatDateTime", () => {
  it("usa la zona horaria del curso, no la del navegador", () => {
    // 14:00 UTC = 09:00 en Bogotá (UTC-5)
    expect(formatDateTime("2026-12-05T14:00:00Z", "es", "America/Bogota")).toMatch(/9:00/);
  });
});

describe("remaining", () => {
  const now = new Date("2026-12-05T10:00:00Z").getTime();
  it("calcula horas y minutos", () => {
    expect(remaining("2026-12-06T09:30:00Z", now)).toEqual({ hours: 23, minutes: 30, expired: false });
  });
  it("marca como vencido", () => {
    expect(remaining("2026-12-05T09:59:00Z", now).expired).toBe(true);
  });
});
