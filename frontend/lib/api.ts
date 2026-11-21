/**
 * Cliente de la API.
 *  - Servidor (Server Components): llama al backend directamente (API_INTERNAL_URL).
 *  - Navegador: llama a /api/* (mismo origen) con cookies httpOnly + cabecera CSRF.
 */

import { apiBase } from "./apiBase";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public requestId?: string | null,
  ) {
    super(message);
  }
}

type ErrorBody = { error?: { code?: string; message?: string; details?: unknown; request_id?: string | null } };

async function toError(res: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = (await res.json()) as ErrorBody;
  } catch {
    /* respuesta sin JSON */
  }
  return new ApiError(
    res.status,
    body.error?.code ?? "HTTP_ERROR",
    body.error?.message ?? res.statusText,
    body.error?.details,
    body.error?.request_id,
  );
}

// ---------------------------------------------------------------- servidor

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET desde el servidor de Next. Si la API está "despertando" (hosting gratuito que se duerme) responde 502/503/504 o
 * tarda: reintentamos unos segundos antes de rendirnos, para que el visitante vea la página y no un error.
 */
export async function serverGet<T>(path: string, revalidate = 30): Promise<T> {
  const attempts = 3;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${apiBase()}/api/v1${path}`, { next: { revalidate }, signal: AbortSignal.timeout(25_000) });
      if (res.ok) return (await res.json()) as T;
      if (!RETRYABLE_STATUS.has(res.status)) throw await toError(res); // 404, 422... son respuestas reales: no se reintentan
      last = await toError(res);
    } catch (e) {
      if (e instanceof ApiError && !RETRYABLE_STATUS.has(e.status)) throw e;
      last = e; // red caída / timeout / API despertando
    }
    if (i < attempts - 1) await sleep(3_000 * (i + 1));
  }
  throw last;
}

// ---------------------------------------------------------------- navegador

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

type Opts = { method?: string; body?: unknown; idempotencyKey?: string };

async function rawFetch(path: string, opts: Opts): Promise<Response> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = readCookie("csrf_token");
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  return fetch(`/api/v1${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export async function api<T = void>(path: string, opts: Opts = {}): Promise<T> {
  let res = await rawFetch(path, opts);
  // Access token caducado (15 min): intentamos UNA renovación silenciosa y reintentamos.
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await rawFetch("/auth/refresh", { method: "POST" });
    if (refreshed.ok) res = await rawFetch(path, opts);
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
