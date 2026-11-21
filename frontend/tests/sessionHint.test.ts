import { afterEach, describe, expect, it } from "vitest";
import { hasSessionHint } from "@/lib/api";

describe("hasSessionHint", () => {
  afterEach(() => {
    document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  it("un visitante anónimo no tiene sesión: no hace falta preguntar al servidor", () => {
    expect(hasSessionHint()).toBe(false);
  });

  it("con la cookie csrf_token (solo existe con sesión iniciada) puede haber sesión", () => {
    document.cookie = "csrf_token=abc123; path=/";
    expect(hasSessionHint()).toBe(true);
  });
});
