from typing import Annotated

import anthropic
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.core.rate_limit import rate_limit
from app.modules.assistant import service

router = APIRouter(prefix="/assistant", tags=["assistant"])
_ip_limit = rate_limit("assistant", limit=lambda: get_settings().assistant_ip_limit_per_minute, window_seconds=60)
Client = Annotated[anthropic.AsyncAnthropic | None, Depends(service.get_assistant_client)]


class StatusOut(BaseModel):
    enabled: bool


@router.get("/status", response_model=StatusOut, summary="¿Está activado el asistente?")
async def status(client: Client) -> StatusOut:
    return StatusOut(enabled=client is not None)


@router.post(
    "/chat",
    response_model=service.ChatResponse,
    dependencies=[Depends(_ip_limit)],
    summary="Conversar con el asistente (solo lectura: busca cursos reales; no reserva ni paga)",
)
async def chat(
    body: service.ChatRequest, client: Client, session: AsyncSession = Depends(get_session)
) -> service.ChatResponse:
    return await service.chat(session, client, body)
