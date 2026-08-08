# Base de datos de Terracota

PostgreSQL 14 o superior. El esquema completo vive en
`terracota_postgresql.sql`: tablas, restricciones, índices, triggers,
funciones de negocio, vistas y datos de arranque.

Los tres scripts son **idempotentes**: se pueden volver a ejecutar sin borrar
información existente.

| Archivo | Cuándo se ejecuta |
|---|---|
| `00_CREAR_BASE.sql` | Una sola vez, conectado a la base `postgres` |
| `terracota_postgresql.sql` | Cada vez que quieras aplicar el esquema, sobre `terracota` |
| `02_PERMISOS_API.sql` | Crea el rol `terracota_app` que usa la API |
| `PRUEBA_FLUJO.sql` | Prueba de humo del flujo completo; termina en `ROLLBACK` |

## Instalación

Con Docker (recomendado) no hay que hacer nada: `docker compose up -d` desde la
raíz aplica todo. Manualmente:

```bash
psql -U postgres -f 00_CREAR_BASE.sql
psql -U postgres -d terracota -f terracota_postgresql.sql
psql -U postgres -d terracota -v api_password='TerracotaLocal123!' -f 02_PERMISOS_API.sql
psql -U postgres -d terracota -f PRUEBA_FLUJO.sql
```

`PRUEBA_FLUJO.sql` debe imprimir un pedido, un ticket y el corte del día, y
termina con `ROLLBACK`, así que no deja basura.

> Se necesita permiso para crear esquemas y la extensión `pgcrypto`. Si
> `CREATE EXTENSION` falla, ejecútalo con un usuario administrador.

## Puerto

Con Docker, PostgreSQL se publica en **5433** para no chocar con una
instalación local que ya use el 5432.

| Parámetro | Valor |
|---|---|
| Host | `127.0.0.1` |
| Puerto | `5433` |
| Base | `terracota` |
| Usuario de la API | `terracota_app` |

Las contraseñas están en [`../CREDENCIALES.md`](../CREDENCIALES.md).

## Qué protege el esquema

Estas reglas viven en la base, no en la interfaz: da igual si el intento viene
de la app, de la web o de `psql`.

- Una mesa **no puede tener dos pedidos activos** a la vez (índice único parcial).
- Sólo se permiten **transiciones válidas** de estado; un trigger rechaza el
  resto (`PENDIENTE → PREPARANDO → LISTO → ENTREGADO → PAGADO`).
- Los **precios quedan congelados** en el detalle del pedido: cambiar el menú
  después no altera pedidos ya cobrados.
- Los **totales se recalculan solos** desde el detalle (subtotal, IVA, total).
- Un pedido **sólo se paga una vez** y únicamente si está `ENTREGADO`.
- El **stock se descuenta al crear** el pedido y **regresa al cancelarlo**.
- Los productos se bloquean (`FOR UPDATE`) antes de validar el stock, así dos
  meseros simultáneos no consumen las mismas existencias.
- El **folio del ticket** es único y consecutivo.
- Cada cambio de estado deja rastro en `pedido_estados_historial`.
- Productos, pagos y usuarios se registran en la tabla `auditoria`.
- Los importes usan `numeric(12,2)`: nada de errores de punto flotante.
- Usuarios y productos se dan de baja de forma **lógica** (`eliminado`), para
  que los reportes históricos sigan cuadrando.

## Funciones de negocio

```sql
-- Autenticación (devuelve id, nombre, usuario y roles; actualiza último acceso)
SELECT * FROM terracota.autenticar_usuario('mesero', 'Mesero123!');

-- Alta de pedido: valida mesa, permisos, formato, existencia y stock
SELECT * FROM terracota.crear_pedido(
  1,
  (SELECT id FROM terracota.usuarios WHERE lower(usuario) = 'mesero'),
  '[{"producto_clave":"moka-frappe","cantidad":2,"observacion":"Sin azúcar"}]'::jsonb
);

-- Avance de estado (y devolución de stock si se cancela)
SELECT * FROM terracota.cambiar_estado_pedido(1, 'PREPARANDO',
  (SELECT id FROM terracota.usuarios WHERE lower(usuario) = 'cocina'));

-- Cobro: genera el pago y el ticket con folio
SELECT * FROM terracota.registrar_pago(1,
  (SELECT id FROM terracota.usuarios WHERE lower(usuario) = 'caja'),
  'EFECTIVO', 200.00);
```

## Vistas

| Vista | Para qué |
|---|---|
| `vista_pedidos_operativos` | Pedido con su mesa, mesero y productos en JSON |
| `vista_tickets` | Ticket completo listo para imprimir |
| `vista_ventas_diarias` | Corte por día y por método de pago |
| `vista_inventario` | Producto con su estado calculado (BAJO, AGOTADO...) |
| `vista_usuarios` | Usuario con sus roles agregados |

Consultas útiles:

```sql
SELECT * FROM terracota.vista_pedidos_operativos ORDER BY creado_en DESC;
SELECT * FROM terracota.vista_tickets ORDER BY emitido_en DESC;
SELECT * FROM terracota.vista_ventas_diarias ORDER BY fecha DESC;
SELECT * FROM terracota.auditoria ORDER BY creado_en DESC LIMIT 20;
```

## Arquitectura

Ni la app móvil ni el panel web se conectan a PostgreSQL:

```
App Expo ─┐
          ├─► API (valida sesión y rol) ─► PostgreSQL
Panel web ┘
```

La API entra con el rol `terracota_app`, que sólo puede leer y escribir dentro
del esquema `terracota`; nunca con `postgres`.
