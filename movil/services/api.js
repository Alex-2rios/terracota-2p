import { Platform } from 'react-native';

/*
 * Cliente HTTP de la app móvil contra la API de Terracota.
 *
 * La app NUNCA habla con PostgreSQL: todo pasa por esta capa. La URL base se
 * toma de EXPO_PUBLIC_API_URL, pero puede cambiarse desde la pantalla de login
 * (útil en la revisión, cuando la IP de la laptop cambia de red).
 */

// En el emulador de Android `localhost` es el propio emulador: 10.0.2.2 apunta
// a la máquina anfitriona. En un teléfono físico hay que poner la IP LAN.
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
  if (!/^https?:\/\//i.test(limpia)) throw new Error('La dirección debe empezar con http:// o https://');
  API_URL = limpia.endsWith('/api/v1') ? limpia : `${limpia}/api/v1`;
  return API_URL;
}

export function getSession() {
  return sesion;
}

export function clearSession() {
  sesion = null;
}

/** Error con el código HTTP para que la UI distinga sesión vencida de un 400. */
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

/**
 * Codifica un objeto como `application/x-www-form-urlencoded`.
 *
 * A propósito NO se usa `URLSearchParams`: en React Native es un polyfill y su
 * serialización depende de que `whatwg-fetch` lo reconozca. Si no lo reconoce,
 * el cuerpo se envía como "[object Object]" y la API responde 422 diciendo que
 * faltan `username` y `password`. Construirlo a mano quita esa dependencia y
 * además codifica correctamente contraseñas con `&`, `+`, `=` o espacios.
 */
function codificarFormulario(datos) {
  return Object.entries(datos)
    .map(([clave, valor]) => `${encodeURIComponent(clave)}=${encodeURIComponent(valor)}`)
    .join('&');
}

/** Convierte el cuerpo de error de FastAPI en algo que se le puede enseñar al usuario. */
function extraerDetalle(cuerpo, status) {
  const detalle = cuerpo?.detail;

  if (typeof detalle === 'string') return detalle;

  // 422: Pydantic devuelve una lista de errores de validación, no un texto.
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
  // Sólo se asume JSON cuando quien llama no fijó su propio tipo de contenido.
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
    // Queda en los registros de Expo: si algo vuelve a fallar, se ve el porqué.
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

/**
 * Comprueba que el servidor responde, sin necesidad de estar autenticado.
 *
 * Lleva su propio corte de tiempo: con una IP equivocada pero enrutable (una
 * cifra mal tecleada), `fetch` se queda esperando hasta un minuto y el botón
 * "PROBAR" parecería colgado.
 */
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
  // Catálogos
  mesas: () => request('/catalogos/mesas'),
  productos: () => request('/catalogos/productos'),

  // Mesero
  pedidosMesero: () => request('/mesero/pedidos'),
  crearPedido: (pedido) => request('/mesero/pedidos', { method: 'POST', body: JSON.stringify(pedido) }),
  entregarPedido: (id) => request(`/mesero/pedidos/${id}/entregar`, {
    method: 'PATCH',
    body: JSON.stringify({ estado: 'ENTREGADO' }),
  }),

  // Cocina
  pedidosCocina: () => request('/cocina/pedidos'),
  resumenCocina: () => request('/cocina/resumen'),
  cambiarEstado: (id, estado) => request(`/cocina/pedidos/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  }),

  // Inventario (cocina y administrador)
  inventario: () => request('/inventario/productos'),
  ajustarSuministro: (id, datos) => request(`/inventario/productos/${id}/suministro`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  }),

  // Caja
  pedidosCaja: () => request('/caja/pedidos-pendientes'),
  tickets: () => request('/caja/tickets?limite=100'),
  ventasHoy: () => request('/caja/ventas/hoy'),
  registrarPago: (pago) => request('/caja/pagos', { method: 'POST', body: JSON.stringify(pago) }),
};
