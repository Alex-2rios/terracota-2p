import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PantallaAutenticacion from './PantallaAutenticacion';
import PantallaCaja from './PantallaCaja';
import PantallaCocina from './PantallaCocina';
import PantallaInicioRol from './PantallaInicioRol';
import PantallaMesero from './PantallaMesero';
import { avisar } from '../components/Avisos';
import {
  ApiError,
  clearSession as limpiarSesionApi,
  login as apiLogin,
  terracotaApi,
} from '../services/api';

/** Cada cuántos ms se refrescan los datos del rol activo. */
const INTERVALO_SONDEO = 12000;

/**
 * Contenedor de la aplicación: mantiene la sesión, los datos del rol activo y
 * la pantalla visible. Los componentes de pantalla son de presentación y
 * reciben todo por props.
 */
export default function PantallaMenu() {
  const [sesion, setSesion] = useState(null);
  const [rol, setRol] = useState('mesero');
  const [pantalla, setPantalla] = useState('inicio');
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null);

  const [mesas, setMesas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [pedidosCaja, setPedidosCaja] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [ventasHoy, setVentasHoy] = useState(null);
  const [inventario, setInventario] = useState([]);

  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState(null);

  // Evita que una respuesta lenta de un rol anterior pise los datos del actual.
  const peticionActual = useRef(0);

  const cerrarSesion = useCallback((mensaje) => {
    limpiarSesionApi();
    setSesion(null);
    setPantalla('inicio');
    setPedidos([]);
    setPedidosCaja([]);
    setTickets([]);
    setInventario([]);
    setVentasHoy(null);
    setAviso(null);
    if (mensaje) avisar.info('Sesión finalizada', mensaje);
  }, []);

  const manejarError = useCallback((error, silencioso) => {
    if (error instanceof ApiError && error.sesionVencida) {
      cerrarSesion(error.message);
      return;
    }
    if (silencioso) {
      setAviso(error.message);
    } else {
      avisar.error('No se pudo completar', error.message);
    }
  }, [cerrarSesion]);

  const cargarDatos = useCallback(async ({ silencioso = false } = {}) => {
    if (!sesion) return;
    const idPeticion = peticionActual.current + 1;
    peticionActual.current = idPeticion;

    if (!silencioso) setCargando(true);
    try {
      if (rol === 'mesero') {
        const [mesasApi, productosApi, pedidosApi] = await Promise.all([
          terracotaApi.mesas(),
          terracotaApi.productos(),
          terracotaApi.pedidosMesero(),
        ]);
        if (peticionActual.current !== idPeticion) return;
        setMesas(mesasApi.map((m) => ({ id: m.numero, estado: m.estado, capacidad: m.capacidad })));
        setProductos(productosApi.map(mapearProducto));
        setPedidos(pedidosApi.map(mapearPedido));
      } else if (rol === 'cocina') {
        const [pedidosApi, inventarioApi] = await Promise.all([
          terracotaApi.pedidosCocina(),
          terracotaApi.inventario(),
        ]);
        if (peticionActual.current !== idPeticion) return;
        setPedidos(pedidosApi.map(mapearPedido));
        setInventario(inventarioApi);
      } else if (rol === 'caja') {
        const [pendientesApi, ticketsApi, ventasApi] = await Promise.all([
          terracotaApi.pedidosCaja(),
          terracotaApi.tickets(),
          terracotaApi.ventasHoy(),
        ]);
        if (peticionActual.current !== idPeticion) return;
        setPedidosCaja(pendientesApi.map(mapearPedido));
        setTickets(ticketsApi.map(mapearTicket));
        setVentasHoy(ventasApi);
      }
      setAviso(null);
    } catch (error) {
      if (peticionActual.current === idPeticion) manejarError(error, silencioso);
    } finally {
      if (peticionActual.current === idPeticion) setCargando(false);
    }
  }, [manejarError, rol, sesion]);

  // Carga inicial + sondeo periódico. No depende de `pantalla`: navegar entre
  // secciones ya no vuelve a descargar todo el catálogo.
  useEffect(() => {
    if (!sesion) return undefined;
    cargarDatos();
    const temporizador = setInterval(() => cargarDatos({ silencioso: true }), INTERVALO_SONDEO);
    return () => clearInterval(temporizador);
  }, [cargarDatos, sesion]);

  const iniciarSesion = useCallback(async (usuario, contrasena, rolSolicitado) => {
    const datos = await apiLogin(usuario, contrasena);
    const rolesUsuario = datos.usuario.roles || [];
    const esAdmin = rolesUsuario.includes('administrador');

    if (!rolesUsuario.includes(rolSolicitado) && !esAdmin) {
      limpiarSesionApi();
      const legibles = rolesUsuario.length ? rolesUsuario.join(', ') : 'ninguno';
      throw new Error(`Tu usuario no tiene el rol ${rolSolicitado}. Roles asignados: ${legibles}.`);
    }

    setRol(rolSolicitado);
    setPantalla('inicio');
    setMesaSeleccionada(null);
    setSesion(datos);
  }, []);

  // ------------------------------------------------------------- acciones
  const crearPedido = useCallback(async (pedido) => {
    const creado = await terracotaApi.crearPedido(pedido);
    const mapeado = mapearPedido(creado);
    setPedidos((actuales) => [mapeado, ...actuales]);
    cargarDatos({ silencioso: true });
    return mapeado;
  }, [cargarDatos]);

  const cambiarEstadoPedido = useCallback(async (id, estado) => {
    const actualizado = mapearPedido(await terracotaApi.cambiarEstado(id, estado));
    setPedidos((actuales) => actuales.map((p) => (p.id === id ? actualizado : p)));
    cargarDatos({ silencioso: true });
    return actualizado;
  }, [cargarDatos]);

  const entregarPedido = useCallback(async (id) => {
    const actualizado = mapearPedido(await terracotaApi.entregarPedido(id));
    setPedidos((actuales) => actuales.map((p) => (p.id === id ? actualizado : p)));
    cargarDatos({ silencioso: true });
    return actualizado;
  }, [cargarDatos]);

  const registrarPago = useCallback(async (pago) => {
    const ticket = mapearTicket(await terracotaApi.registrarPago(pago));
    setTickets((actuales) => [ticket, ...actuales]);
    setPedidosCaja((actuales) => actuales.filter((p) => p.id !== pago.pedido_id));
    cargarDatos({ silencioso: true });
    return ticket;
  }, [cargarDatos]);

  const ajustarSuministro = useCallback(async (productoId, datos) => {
    const actualizado = await terracotaApi.ajustarSuministro(productoId, datos);
    setInventario((actuales) => actuales.map((p) => (p.id === productoId ? actualizado : p)));
    return actualizado;
  }, []);

  // ------------------------------------------------------------ derivados
  const estadisticas = useMemo(() => calcularEstadisticas(rol, {
    pedidos, pedidosCaja, ventasHoy, inventario,
  }), [inventario, pedidos, pedidosCaja, rol, ventasHoy]);

  const propsComunes = {
    pantalla,
    cambiarPantalla: setPantalla,
    alCerrarSesion: () => cerrarSesion(),
    cargando,
    aviso,
    alRefrescar: () => cargarDatos(),
  };

  if (!sesion) {
    return (
      <PantallaAutenticacion
        rol={rol}
        alCambiarRol={setRol}
        alEntrar={iniciarSesion}
      />
    );
  }

  if (pantalla === 'inicio') {
    return (
      <PantallaInicioRol
        rol={rol}
        nombre={sesion.usuario.nombre}
        estadisticas={estadisticas}
        alNavegar={setPantalla}
        alCerrarSesion={() => cerrarSesion()}
        cargando={cargando}
        aviso={aviso}
        alRefrescar={() => cargarDatos()}
      />
    );
  }

  if (rol === 'caja') {
    return (
      <PantallaCaja
        {...propsComunes}
        pedidosPendientes={pedidosCaja}
        tickets={tickets}
        ventasHoy={ventasHoy}
        alRegistrarPago={registrarPago}
      />
    );
  }

  if (rol === 'cocina') {
    return (
      <PantallaCocina
        {...propsComunes}
        pedidos={pedidos}
        inventario={inventario}
        alCambiarEstado={cambiarEstadoPedido}
        alAjustarSuministro={ajustarSuministro}
      />
    );
  }

  return (
    <PantallaMesero
      {...propsComunes}
      mesaSeleccionada={mesaSeleccionada}
      cambiarMesaSeleccionada={setMesaSeleccionada}
      pedidos={pedidos}
      mesasDisponibles={mesas}
      productosDisponibles={productos}
      alCrearPedido={crearPedido}
      alEntregarPedido={entregarPedido}
    />
  );
}

// ================================================================= mapeos
function mapearProducto(producto) {
  return {
    id: producto.clave,
    nombre: producto.nombre,
    categoria: String(producto.categoria || '').toUpperCase(),
    categoriaNombre: producto.categoria_nombre,
    precio: Number(producto.precio),
    stock: Number(producto.stock_actual ?? 0),
    nota: producto.nota || '',
  };
}

function mapearPedido(pedido) {
  return {
    ...pedido,
    total: Number(pedido.total),
    subtotal: Number(pedido.subtotal),
    impuesto: Number(pedido.impuesto),
    hora: formatearHora(pedido.creado_en),
    items: (pedido.items || []).map((item) => ({
      id: item.producto_id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio: Number(item.precio),
      observacion: item.observacion || '',
    })),
  };
}

function mapearTicket(ticket) {
  return {
    id: ticket.id,
    folio: ticket.folio,
    pedidoId: ticket.pedido_id,
    mesa: ticket.mesa,
    metodo: ticket.metodo,
    total: Number(ticket.total),
    cambio: Number(ticket.cambio),
    emitidoEn: ticket.emitido_en,
    fecha: formatearFecha(ticket.emitido_en),
    hora: formatearHora(ticket.emitido_en),
    items: (ticket.items || []).map((item) => ({
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio: Number(item.precio),
    })),
  };
}

function formatearFecha(valor) {
  if (!valor) return '';
  return new Date(valor).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatearHora(valor) {
  if (!valor) return '';
  return new Date(valor).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

// =========================================================== estadísticas
function calcularEstadisticas(rol, datos) {
  const { pedidos, pedidosCaja, ventasHoy, inventario } = datos;

  if (rol === 'cocina') {
    return [
      {
        etiqueta: 'Pendientes',
        valor: pedidos.filter((p) => p.estado === 'PENDIENTE').length,
        icono: 'pedidosPendientes',
      },
      {
        etiqueta: 'En preparación',
        valor: pedidos.filter((p) => p.estado === 'PREPARANDO').length,
        icono: 'estadoOscuro',
      },
      {
        etiqueta: 'Stock bajo',
        valor: inventario.filter((p) => p.estado === 'BAJO' || p.estado === 'AGOTADO').length,
        icono: 'producto',
      },
    ];
  }

  if (rol === 'caja') {
    return [
      { etiqueta: 'Por cobrar', valor: pedidosCaja.length, icono: 'pedidosPendientes' },
      { etiqueta: 'Cobros de hoy', valor: ventasHoy?.pagos ?? 0, icono: 'tickets' },
      { etiqueta: 'Total del día', valor: formatearDineroCorto(ventasHoy?.total), icono: 'ventas' },
    ];
  }

  return [
    {
      etiqueta: 'Activos',
      valor: pedidos.filter((p) => ['PENDIENTE', 'PREPARANDO', 'LISTO'].includes(p.estado)).length,
      icono: 'pedidosPendientes',
    },
    {
      etiqueta: 'Listos',
      valor: pedidos.filter((p) => p.estado === 'LISTO').length,
      icono: 'pedidosListos',
    },
  ];
}

function formatearDineroCorto(valor) {
  const numero = Number(valor || 0);
  return `$${numero.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
}
