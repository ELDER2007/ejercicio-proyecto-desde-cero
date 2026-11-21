"""Rate limiting en memoria (ventana deslizante).

Suficiente para UNA instancia. Con varias instancias hará falta un almacén compartido (Redis): ADR futuro.
"""

import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import AppError


class RateLimitedError(AppError):
    status_code = 429
    code = "RATE_LIMITED"
    message = "Demasiados intentos. Inténtalo de nuevo más tarde."


def client_ip(request: Request) -> str:
    """IP del cliente. Detrás de N proxies de confianza se usa la entrada N-ésima por la derecha de X-Forwarded-For
    (la que añadió NUESTRO proxy); lo que el cliente escriba a la izquierda no se puede falsificar para saltarse el límite."""
    hops = get_settings().trusted_proxy_hops
    if hops > 0:
        parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    return request.client.host if request.client else "unknown"


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int, clock: Callable[[], float] = time.monotonic) -> None:
        self.limit, self.window, self.clock = limit, window_seconds, clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = self.clock()
        q = self._hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            raise RateLimitedError()
        q.append(now)

    def reset(self) -> None:
        self._hits.clear()


def rate_limit(name: str, limit: int | Callable[[], int], window_seconds: int) -> Callable[[Request], None]:
    limiter = SlidingWindowLimiter(0, window_seconds)
    _registry.append(limiter)

    def dependency(request: Request) -> None:
        limiter.limit = limit() if callable(limit) else limit  # configurable en caliente (tests)
        ip = client_ip(request)
        limiter.check(f"{name}:{ip}")

    return dependency


_registry: list[SlidingWindowLimiter] = []


def register_limiter(limiter: SlidingWindowLimiter) -> SlidingWindowLimiter:
    _registry.append(limiter)
    return limiter


def reset_all_limiters() -> None:
    for lim in _registry:
        lim.reset()
