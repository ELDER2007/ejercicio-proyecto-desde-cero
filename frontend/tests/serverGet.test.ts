import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, serverGet } from "@/lib/api";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const err = (status: number) => new Response(JSON.stringify({ error: { code: "X", message: "x" } }), { status });

describe("serverGet (API que se despierta)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reintenta ante 503 y acaba devolviendo los datos", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(err(503)).mockResolvedValueOnce(err(502)).mockResolvedValueOnce(ok({ total: 8 }));
    const p = serverGet<{ total: number }>("/courses");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await p).toEqual({ total: 8 });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("reintenta ante un fallo de red", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(ok({ ok: true }));
    const p = serverGet("/courses");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("NO reintenta una respuesta real como 404", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(err(404));
    await expect(serverGet("/courses/nada")).rejects.toBeInstanceOf(ApiError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("se rinde tras varios intentos si la API no vuelve", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(err(503));
    const p = serverGet("/courses").catch((e) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await p).toBeInstanceOf(ApiError);
    expect(f).toHaveBeenCalledTimes(3);
  });
});
