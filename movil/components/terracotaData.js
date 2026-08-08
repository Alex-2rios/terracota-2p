export const roles = [
  { clave: 'mesero', etiqueta: 'Mesero' },
  { clave: 'caja', etiqueta: 'Caja' },
  { clave: 'cocina', etiqueta: 'Cocina' },
];

export const inicioPorRol = {
  mesero: {
    etiqueta: 'ROL: MESERO',
    acciones: [
      { clave: 'mesa', titulo: 'SELECCIONAR MESA', icono: 'mesa' },
      { clave: 'crear', titulo: 'CREAR PEDIDO', icono: 'crearPedido', contorno: true },
      { clave: 'estado', titulo: 'VER ESTADO PEDIDO', icono: 'estado' },
      { clave: 'listos', titulo: 'PEDIDOS LISTOS', icono: 'pedidosListos', contorno: true },
    ],
  },
  caja: {
    etiqueta: 'ROL: CAJA',
    acciones: [
      { clave: 'pedidos', titulo: 'PEDIDOS PENDIENTES', icono: 'pedidosPendientes' },
      { clave: 'pago', titulo: 'REGISTRAR PAGO', icono: 'ventas', contorno: true },
      { clave: 'ventas', titulo: 'VENTAS DEL DÍA', icono: 'ventas' },
      { clave: 'tickets', titulo: 'TICKETS GENERADOS', icono: 'tickets', contorno: true },
    ],
  },
  cocina: {
    etiqueta: 'ROL: COCINA',
    acciones: [
      { clave: 'pendientes', titulo: 'PEDIDOS PENDIENTES', icono: 'pedidosPendientes' },
      { clave: 'preparacion', titulo: 'EN PREPARACIÓN', icono: 'estadoOscuro', contorno: true },
      { clave: 'listos', titulo: 'LISTOS PARA ENTREGAR', icono: 'pedidosListos' },
      { clave: 'inventario', titulo: 'INVENTARIO', icono: 'producto', contorno: true },
    ],
  },
};

export const navegacionPorRol = {
  mesero: [
    { clave: 'inicio', etiqueta: 'Inicio', icono: 'home' },
    { clave: 'mesa', etiqueta: 'Mesa', icono: 'mesa' },
    { clave: 'crear', etiqueta: 'Pedido', icono: 'pedidos' },
    { clave: 'estado', etiqueta: 'Estado', icono: 'estado' },
  ],
  caja: [
    { clave: 'inicio', etiqueta: 'Inicio', icono: 'home' },
    { clave: 'pedidos', etiqueta: 'Pedidos', icono: 'pedidos' },
    { clave: 'ventas', etiqueta: 'Ventas', icono: 'ventas' },
    { clave: 'tickets', etiqueta: 'Tickets', icono: 'tickets' },
  ],
  cocina: [
    { clave: 'inicio', etiqueta: 'Inicio', icono: 'home' },
    { clave: 'pendientes', etiqueta: 'Pedidos', icono: 'pedidos' },
    { clave: 'listos', etiqueta: 'Listos', icono: 'pedidosListos' },
    { clave: 'inventario', etiqueta: 'Stock', icono: 'producto' },
  ],
};

export const metodosPago = ['Efectivo', 'Tarjeta', 'Transferencia'];

/** Estados en los que un pedido sigue ocupando la mesa. */
export const ESTADOS_ACTIVOS = ['PENDIENTE', 'PREPARANDO', 'LISTO', 'ENTREGADO'];
