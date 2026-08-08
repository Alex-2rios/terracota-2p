-- ============================================================================
--  Usuario de base de datos que utiliza la API. Nunca uses `postgres` desde
--  la aplicación: este rol sólo puede leer y escribir en el esquema terracota.
--
--  La contraseña se recibe como variable de psql para no dejarla en el código:
--      psql -v api_password='MiClaveSegura' -f 02_PERMISOS_API.sql
--  Si no se envía, se usa la clave de desarrollo local.
-- ============================================================================

\if :{?api_password}
\else
  \set api_password 'TerracotaLocal123!'
\endif

-- `SET` se evalúa fuera de comillas dolarizadas, así que psql sí interpola aquí.
SET terracota.api_password = :'api_password';

DO $$
DECLARE
  clave text := current_setting('terracota.api_password');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'terracota_app') THEN
    EXECUTE format('CREATE ROLE terracota_app LOGIN PASSWORD %L', clave);
  ELSE
    EXECUTE format('ALTER ROLE terracota_app PASSWORD %L', clave);
  END IF;
END
$$;

GRANT CONNECT ON DATABASE terracota TO terracota_app;
GRANT USAGE ON SCHEMA terracota TO terracota_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA terracota TO terracota_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA terracota TO terracota_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA terracota TO terracota_app;

-- pgcrypto vive en `public` (crypt/gen_salt los usa la API al crear usuarios).
GRANT USAGE ON SCHEMA public TO terracota_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA terracota
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO terracota_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA terracota
  GRANT USAGE, SELECT ON SEQUENCES TO terracota_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA terracota
  GRANT EXECUTE ON FUNCTIONS TO terracota_app;

RESET terracota.api_password;
