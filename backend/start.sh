#!/bin/sh
# Arranque de la API en Render: migraciones -> datos iniciales (idempotente) -> servidor.
# Se ejecuta con `sh /app/start.sh` (sin comillas en render.yaml: Render las interpretaba mal).
set -e
alembic upgrade head
python -m app.bootstrap
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
