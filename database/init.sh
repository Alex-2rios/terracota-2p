#!/bin/sh
# Inicializa la base de datos de Terracota dentro del contenedor `database-init`.
# Los scripts son idempotentes: correr esto varias veces no borra datos.
set -e

HOST="${PGHOST:-database}"
USER="${PGUSER:-postgres}"
BASE="${PGDATABASE:-terracota}"
CLAVE_API="${API_DB_PASSWORD:-TerracotaLocal123!}"

echo "==> Aplicando el esquema en $BASE..."
psql -h "$HOST" -U "$USER" -d "$BASE" -v ON_ERROR_STOP=1 -f /scripts/terracota_postgresql.sql

echo "==> Creando el rol de la API..."
psql -h "$HOST" -U "$USER" -d "$BASE" -v ON_ERROR_STOP=1 \
     -v api_password="$CLAVE_API" -f /scripts/02_PERMISOS_API.sql

echo "==> Base de datos lista."
