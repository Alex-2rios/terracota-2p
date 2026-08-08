-- ============================================================================
--  Prueba de humo del flujo completo: Mesero -> Cocina -> Mesero -> Caja.
--  Termina en ROLLBACK, así que NO deja datos basura en la base.
--  Usa exactamente los usuarios de CREDENCIALES.md.
-- ============================================================================

BEGIN;
SET search_path TO terracota, public;

DO $$
DECLARE
  mesero_id bigint;
  cocina_id bigint;
  cajero_id bigint;
  mesa_libre smallint;
  pedido_id bigint;
BEGIN
  SELECT id INTO STRICT mesero_id FROM usuarios WHERE lower(usuario) = 'mesero';
  SELECT id INTO STRICT cocina_id FROM usuarios WHERE lower(usuario) = 'cocina';
  SELECT id INTO STRICT cajero_id FROM usuarios WHERE lower(usuario) = 'caja';

  -- Toma la primera mesa realmente disponible para no chocar con datos previos.
  SELECT numero INTO STRICT mesa_libre
  FROM mesas WHERE activa AND estado = 'DISPONIBLE'
  ORDER BY numero LIMIT 1;

  SELECT id INTO pedido_id
  FROM crear_pedido(
    mesa_libre,
    mesero_id,
    '[
      {"producto_clave":"moka-frappe","cantidad":2,"observacion":"Leche deslactosada"},
      {"producto_clave":"brownie-cacao","cantidad":1,"observacion":"Caliente"}
    ]'::jsonb,
    'Pedido de prueba automática'
  );

  PERFORM cambiar_estado_pedido(pedido_id, 'PREPARANDO', cocina_id, 'Cocina inició el pedido');
  PERFORM cambiar_estado_pedido(pedido_id, 'LISTO',      cocina_id, 'Pedido terminado');
  PERFORM cambiar_estado_pedido(pedido_id, 'ENTREGADO',  mesero_id, 'Entregado en mesa');
  PERFORM registrar_pago(pedido_id, cajero_id, 'EFECTIVO', 300.00, NULL);

  RAISE NOTICE 'OK: flujo completo ejecutado sobre la mesa % (pedido %)', mesa_libre, pedido_id;
END;
$$;

SELECT 'pedido'  AS prueba, id, mesa, estado, total FROM vista_pedidos_operativos ORDER BY id DESC LIMIT 1;
SELECT 'ticket'  AS prueba, id, folio, mesa, metodo, total, cambio FROM vista_tickets ORDER BY id DESC LIMIT 1;
SELECT 'ventas'  AS prueba, fecha, pagos, total FROM vista_ventas_diarias ORDER BY fecha DESC LIMIT 1;

ROLLBACK;
