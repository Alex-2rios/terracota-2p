-- Ejecutar UNA sola vez, conectado a la base `postgres` (no a `terracota`).
-- Si la base ya existe, PostgreSQL avisará y puedes continuar con el paso 01.
CREATE DATABASE terracota
  WITH ENCODING = 'UTF8'
       TEMPLATE = template0;
