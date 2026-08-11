import { Platform } from 'react-native';

const IP_POR_DEFECTO = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';

const normalizar = (url) => String(url || '').trim().replace(/\/+$/, '');

let API_URL = normalizar(process.env.EXPO_PUBLIC_API_URL) || `http://${IP_POR_DEFECTO}:8080/api/v1`;

let sesion = null;

export function getApiUrl() {
  return API_URL;
}

export function setApiUrl(url) {
  const limpia = normalizar(url);
  if (!limpia) throw new Error('Escribe una dirección válida.');
  if (!/^https?:\/\
  API_URL = limpia.endsWith('/api/v1') ? limpia : `${limpia}/api/v1`;
  return API_URL;
}

export function getSession() {
  return sesion;
}

export function clearSession() {
  sesion = null;
}

export class ApiError extends Error {
  constructor(mensaje, status) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
  }

  get sesionVencida() {
    return this.status === 401;
  }
}

const MENSAJES = {
  400: 'El servidor rechazó los datos enviados.',
  401: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  403: 'Tu usuario no tiene permisos para esta operación.',
  404: 'No encontramos el recurso solicitado.',
  409: 'La operación no es válida en el estado actual del pedido.',
  422: 'Los datos enviados no son válidos.',
  429: 'Demasiados intentos. Espera unos segundos.',
  500: 'Error interno del servidor.',
  503: 'La base de datos no responde. Avisa al administrador.',
};

function codificarFormulario(datos) {
  return Object.entries(datos)
    .map(([clave, valor]) => `${encodeURIComponent(clave)}=${encodeURIComponent(valor)}`)
    .join('&');
}

function extraerDetalle(cuerpo, status) {
  const detalle = cuerpo?.detail;

  if (typeof detalle === 'string') return detalle;

  if (Array.isArray(detalle)) {
    const partes = detalle.map((error) => {
      const campo = (error.loc || []).filter((x) => x !== 'body').join(' → ');
      return campo ? `${campo}: ${error.msg}` : error.msg;
    });
    if (partes.length) return partes.join('; ');
  }

  return `${MENSAJES[status] || 'No fue posible completar la operación.'} (HTTP ${status})`;
}

async function request(path, options = {}) {
  const { timeout = 15000, ...resto } = options;
  const headers = { Accept: 'application/json', ...resto.headers };

  if (sesion?.access_token) headers.Authorization = `Bearer ${sesion.access_token}`;

  if (resto.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const url = `${API_URL}${path}`;
  const controlador = new AbortController();
  const alarma = setTimeout(() => controlador.abort(), timeout);

  let respuesta;
  try {
    respuesta = await fetch(url, { ...resto, headers, signal: controlador.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError(`El servidor tardó más de ${timeout / 1000} s en responder.`, 0);
    }
    console.warn(`[Terracota] Falló la conexión con ${url}:`, error.message);
    throw new ApiError(`No hay conexión con el servidor (${API_URL}).`, 0);
  } finally {
    clearTimeout(alarma);
  }

  const cuerpo = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    if (respuesta.status === 401) clearSession();

    console.warn(`[Terracota] ${resto.method || 'GET'} ${url} -> HTTP ${respuesta.status}`, cuerpo);
    throw new ApiError(extraerDetalle(cuerpo, respuesta.status), respuesta.status);
  }

  return cuerpo;
}

export async function login(usuario, password) {
  const datos = await request('/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: codificarFormulario({
      grant_type: 'password',
      username: String(usuario).trim(),
      password,
    }),
  });
  sesion = datos;
  return datos;
}

export async function comprobarServidor(timeout = 8000) {
  const raiz = API_URL.replace(/\/api\/v1$/, '');
  const controlador = new AbortController();
  const alarma = setTimeout(() => controlador.abort(), timeout);

  try {
    const respuesta = await fetch(`${raiz}/health`, { signal: controlador.signal });
    if (!respuesta.ok) {
      throw new ApiError(`El servidor contestó ${respuesta.status} en ${raiz}.`, respuesta.status);
    }
    return await respuesta.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      throw new ApiError(
        `Sin respuesta de ${raiz} en ${timeout / 1000} s. Revisa la IP y que el teléfono esté en la misma red Wi-Fi.`,
        0,
      );
    }
    throw new ApiError(`No se pudo conectar con ${raiz}.`, 0);
  } finally {
    clearTimeout(alarma);
  }
}

export const terracotaApi = {

  mesas: () => request('/catalogos/mesas'),
  productos: () => request('/catalogos/productos'),

  pedidosMesero: () => request('/mesero/pedidos'),
  crearPedido: (pedido) => request('/mesero/pedidos', { method: 'POST', body: JSON.stringify(pedido) }),
  entregarPedido: (id) => request(`/mesero/pedidos/${id}/entregar`, {
    method: 'PATCH',
    body: JSON.stringify({ estado: 'ENTREGADO' }),
  }),

  pedidosCocina: () => request('/cocina/pedidos'),
  resumenCocina: () => request('/cocina/resumen'),
  cambiarEstado: (id, estado) => request(`/cocina/pedidos/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  }),

  inventario: () => request('/inventario/productos'),
  ajustarSuministro: (id, datos) => request(`/inventario/productos/${id}/suministro`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  }),

  pedidosCaja: () => request('/caja/pedidos-pendientes'),
  tickets: () => request('/caja/tickets?limite=100'),
  ventasHoy: () => request('/caja/ventas/hoy'),
  registrarPago: (pago) => request('/caja/pagos', { method: 'POST', body: JSON.stringify(pago) }),
};
