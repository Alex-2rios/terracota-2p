import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import {
  BarraSuperior,
  CajaBusqueda,
  Contenido,
  Divisor,
  EstadoVacio,
  EtiquetaEstado,
  FilaAcciones,
  ImagenProducto,
  MarcoTelefono,
  MensajeAviso,
  TituloConRegreso,
  colores,
} from '../components/TerracotaUI';
import { avisar } from '../components/Avisos';
import { ESTADOS_ACTIVOS, navegacionPorRol } from '../components/terracotaData';

const CATEGORIAS = ['TODOS', 'BEBIDAS', 'POSTRES', 'ALIMENTOS', 'PROMOS'];
const MAX_POR_PRODUCTO = 20;

export default function PantallaMesero({
  pantalla,
  cambiarPantalla,
  mesaSeleccionada,
  cambiarMesaSeleccionada,
  pedidos,
  mesasDisponibles,
  productosDisponibles,
  alCrearPedido,
  mesasPorRetomar,
  alLiberarMesa,
  alEntregarPedido,
  alCerrarSesion,
  cargando,
  aviso,
  alRefrescar,
}) {
  const [filtroActivo, setFiltroActivo] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaMesa, setBusquedaMesa] = useState('');
  const [busquedaPedido, setBusquedaPedido] = useState('');
  const [carrito, setCarrito] = useState({});
  const [notas, setNotas] = useState({});
  const [idPedidoSeleccionado, setIdPedidoSeleccionado] = useState(null);
  const [pantallaRegresoDetalle, setPantallaRegresoDetalle] = useState('estado');
  const [enviando, setEnviando] = useState(false);

  const mesasFiltradas = useMemo(() => {
    const consulta = busquedaMesa.trim();
    if (!consulta) return mesasDisponibles;
    return mesasDisponibles.filter((mesa) => String(mesa.id).includes(consulta));
  }, [busquedaMesa, mesasDisponibles]);

  const productosFiltrados = useMemo(() => {
    const consulta = busqueda.trim().toLocaleLowerCase('es-MX');
    return productosDisponibles.filter((producto) => {
      const coincideFiltro = filtroActivo === 'TODOS' || producto.categoria === filtroActivo;
      const coincideBusqueda = !consulta || producto.nombre.toLocaleLowerCase('es-MX').includes(consulta);
      return coincideFiltro && coincideBusqueda;
    });
  }, [filtroActivo, busqueda, productosDisponibles]);

  const articulosSeleccionados = useMemo(
    () => productosDisponibles
      .map((producto) => ({
        ...producto,
        cantidad: carrito[producto.id] || 0,
        observacion: notas[producto.id] || '',
      }))
      .filter((producto) => producto.cantidad > 0),
    [carrito, notas, productosDisponibles],
  );

  const cantidadProductos = articulosSeleccionados.reduce((total, item) => total + item.cantidad, 0);
  const subtotal = articulosSeleccionados.reduce((total, item) => total + item.precio * item.cantidad, 0);
  const iva = Number((subtotal * 0.16).toFixed(2));
  const total = Number((subtotal + iva).toFixed(2));

  const pedidosFiltrados = useMemo(() => {
    const consulta = busquedaPedido.trim().toLocaleLowerCase('es-MX');
    const base = pantalla === 'listos'
      ? pedidos.filter((pedido) => pedido.estado === 'LISTO')
      : pedidos;

    if (!consulta) return base;
    return base.filter((pedido) => [pedido.id, pedido.mesa, pedido.estado]
      .some((valor) => String(valor).toLocaleLowerCase('es-MX').includes(consulta)));
  }, [busquedaPedido, pantalla, pedidos]);

  const pedidoSeleccionado = pedidos.find((pedido) => pedido.id === idPedidoSeleccionado) || null;

  const stockDisponible = (producto) => producto.stock ?? 99;

  const cambiarCantidad = (producto, delta) => {
    setCarrito((actual) => {
      const actualCantidad = actual[producto.id] || 0;
      const tope = Math.min(MAX_POR_PRODUCTO, stockDisponible(producto));
      const siguiente = Math.min(Math.max(actualCantidad + delta, 0), tope);

      if (delta > 0 && siguiente === actualCantidad) {
        avisar.info('Sin más existencias', `Sólo quedan ${stockDisponible(producto)} de ${producto.nombre}.`);
      }
      return { ...actual, [producto.id]: siguiente };
    });
  };

  const reiniciarPedido = () => {
    setCarrito({});
    setNotas({});
    setBusqueda('');
    setFiltroActivo('TODOS');
  };

  const esperaRetoma = (idMesa) => mesasPorRetomar?.has(idMesa) ?? false;

  const mesaEstaOcupada = (idMesa) => {
    if (esperaRetoma(idMesa)) return false;

    const mesa = mesasDisponibles.find((item) => item.id === idMesa);
    const tienePedidoActivo = pedidos.some(
      (pedido) => pedido.mesa === idMesa && ESTADOS_ACTIVOS.includes(pedido.estado),
    );
    return mesa?.estado === 'OCUPADA' || tienePedidoActivo;
  };

  const seleccionarMesa = (mesa) => {
    if (mesaEstaOcupada(mesa.id)) {
      avisar.info('Mesa no disponible', `La mesa ${mesa.id} ya tiene un pedido activo.`);
      return;
    }
    cambiarMesaSeleccionada(mesa.id);
  };

  const confirmarMesa = () => {
    if (!mesaSeleccionada) {
      avisar.info('Selecciona una mesa', 'Toca una mesa disponible para continuar.');
      return;
    }
    if (mesaEstaOcupada(mesaSeleccionada)) {
      avisar.info('Selecciona otra mesa', 'La mesa elegida ya no está disponible.');
      return;
    }
    cambiarPantalla('crear');
  };

  const enviarPedido = async () => {
    if (enviando) return;

    if (!mesaSeleccionada) {
      avisar.info('Falta la mesa', 'Selecciona una mesa antes de enviar el pedido.');
      cambiarPantalla('mesa');
      return;
    }
    if (articulosSeleccionados.length === 0) {
      avisar.info('Pedido vacío', 'Agrega al menos un producto.');
      cambiarPantalla('crear');
      return;
    }
    if (mesaEstaOcupada(mesaSeleccionada)) {
      avisar.info('Mesa no disponible', 'Selecciona una mesa disponible antes de enviar.');
      cambiarPantalla('mesa');
      return;
    }

    const solicitud = {
      mesa: mesaSeleccionada,
      items: articulosSeleccionados.map(({ id, cantidad, observacion }) => ({
        producto_clave: id,
        cantidad,
        ...(observacion.trim() ? { observacion: observacion.trim() } : {}),
      })),
    };

    setEnviando(true);
    try {
      const nuevoPedido = await alCrearPedido(solicitud);
      setIdPedidoSeleccionado(nuevoPedido.id);
      reiniciarPedido();
      cambiarMesaSeleccionada(null);
      cambiarPantalla('estado');
      avisar.exito('Pedido enviado', `Pedido #${nuevoPedido.id} registrado para la mesa ${nuevoPedido.mesa}.`);
    } catch (error) {
      avisar.error('No se pudo crear el pedido', error.message);
    } finally {
      setEnviando(false);
    }
  };

  const abrirDetalle = (pedido) => {
    setIdPedidoSeleccionado(pedido.id);
    setPantallaRegresoDetalle(pantalla === 'listos' ? 'listos' : 'estado');
    cambiarPantalla('detalle');
  };

  const marcarComoEntregado = async () => {
    if (!pedidoSeleccionado || pedidoSeleccionado.estado !== 'LISTO' || enviando) return;

    setEnviando(true);
    try {
      await alEntregarPedido(pedidoSeleccionado.id);
      avisar.exito('Pedido entregado', 'Ya está disponible en Caja para su cobro.');
      cambiarPantalla(pantallaRegresoDetalle);
    } catch (error) {
      avisar.error('No se pudo entregar el pedido', error.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MarcoTelefono elementosNavegacion={navegacionPorRol.mesero} activo={pantalla} alNavegar={cambiarPantalla}>
      <BarraSuperior alCerrarSesion={alCerrarSesion} />

      {pantalla === 'mesa' && (
        <Contenido alRefrescar={alRefrescar} refrescando={cargando}>
          <TituloConRegreso titulo="Selecciona tu mesa" alRegresar={() => cambiarPantalla('inicio')} />
          <MensajeAviso texto={aviso} alReintentar={alRefrescar} />
          <CajaBusqueda
            placeholder="Buscar mesa..."
            value={busquedaMesa}
            onChangeText={(valor) => setBusquedaMesa(valor.replace(/\D/g, ''))}
          />
          <View style={styles.tableGrid}>
            {mesasFiltradas.map((mesa) => {
              const ocupada = mesaEstaOcupada(mesa.id);
              const seleccionada = mesaSeleccionada === mesa.id;

              const porRetomar = mesasPorRetomar?.has(mesa.id) ?? false;
              const bloqueada = ocupada && !porRetomar;
              const etiquetaMesa = porRetomar ? 'POR RETOMAR' : ocupada ? 'OCUPADA' : 'DISPONIBLE';
              return (
                <TouchableOpacity
                  key={mesa.id}
                  style={[
                    styles.tableCard,
                    ocupada && styles.tableOccupied,
                    porRetomar && styles.tableRetomar,
                    seleccionada && styles.tableSelected,
                  ]}
                  onPress={() => seleccionarMesa(mesa)}
                  activeOpacity={bloqueada ? 1 : 0.82}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: bloqueada, selected: seleccionada }}
                  accessibilityLabel={`Mesa ${mesa.id}, ${etiquetaMesa.toLowerCase()}`}>
                  <ImagenProducto tipo="bolsa" />
                  <View style={styles.tableInfo}>
                    <Text style={styles.tableTitle}>MESA {mesa.id}</Text>
                    <Text style={[
                      styles.tableStatus,
                      ocupada && styles.tableStatusBusy,
                      porRetomar && styles.tableStatusRetomar,
                    ]}>
                      {etiquetaMesa}
                    </Text>
                    {porRetomar && (
                      <>
                        <Text style={styles.tableHint}>
                          El cliente sigue aquí: toca para tomar de nuevo la orden.
                        </Text>
                        <TouchableOpacity
                          onPress={() => alLiberarMesa?.(mesa.id)}
                          hitSlop={8}
                          accessibilityRole="button">
                          <Text style={styles.tableLiberar}>El cliente se retiró</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          {mesasFiltradas.length === 0 && (
            <EstadoVacio titulo="Sin mesas" detalle="No encontramos esa mesa." />
          )}
          <View style={styles.selectedBox}>
            <Text style={styles.selectedTitle}>MESA SELECCIONADA</Text>
            <Text style={styles.selectedMeta}>
              {mesaSeleccionada ? `Mesa ${mesaSeleccionada}` : 'Ninguna todavía'}
            </Text>
          </View>
          <FilaAcciones
            tituloDerecho="CONFIRMAR"
            alIzquierda={() => cambiarPantalla('inicio')}
            alDerecha={confirmarMesa}
          />
        </Contenido>
      )}

      {pantalla === 'crear' && (
        <Contenido alRefrescar={alRefrescar} refrescando={cargando}>
          <TituloConRegreso titulo="Crear pedido" alRegresar={() => cambiarPantalla('mesa')} />
          <MensajeAviso texto={aviso} alReintentar={alRefrescar} />
          <Text style={styles.mesaTag}>MESA: {mesaSeleccionada || 'sin asignar'}</Text>
          <CajaBusqueda placeholder="Buscar producto..." value={busqueda} onChangeText={setBusqueda} />

          <View style={styles.filters}>
            {CATEGORIAS.map((filtro) => (
              <TouchableOpacity
                key={filtro}
                style={[styles.filter, filtroActivo === filtro && styles.filterActive]}
                onPress={() => setFiltroActivo(filtro)}
                activeOpacity={0.8}>
                <Text style={styles.filterText}>{filtro}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {productosFiltrados.map((item) => {
            const cantidad = carrito[item.id] || 0;
            const stock = stockDisponible(item);

            return (
              <View key={item.id} style={[styles.productRow, cantidad > 0 && styles.productRowSelected]}>
                <ImagenProducto uri={item.imagen} />
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{item.nombre}</Text>
                  <Text style={[styles.available, stock <= 5 && styles.availableLow]}>
                    {item.categoria} · {stock} disponibles
                  </Text>
                  {cantidad > 0 && (
                    <View style={styles.observationWrap}>
                      <Text style={styles.observationLabel}>OBSERVACIÓN PARA COCINA</Text>
                      <TextInput
                        style={styles.observationInput}
                        placeholder="Ej: sin azúcar, para llevar..."
                        placeholderTextColor="#A9927F"
                        value={notas[item.id] || ''}
                        onChangeText={(valor) => setNotas((actual) => ({ ...actual, [item.id]: valor }))}
                        maxLength={120}
                        multiline
                        accessibilityLabel={`Observación para ${item.nombre}`}
                      />
                    </View>
                  )}
                </View>
                <View style={styles.quantity}>
                  <Text style={styles.price}>{formatearDinero(item.precio)}</Text>
                  {cantidad > 0 ? (
                    <View style={styles.stepper}>
                      <TouchableOpacity onPress={() => cambiarCantidad(item, -1)} hitSlop={6}>
                        <Text style={styles.step}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.step}>{cantidad}</Text>
                      <TouchableOpacity onPress={() => cambiarCantidad(item, 1)} hitSlop={6}>
                        <Text style={styles.step}>＋</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addButton} onPress={() => cambiarCantidad(item, 1)}>
                      <Text style={styles.addButtonText}>AGREGAR</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          {productosFiltrados.length === 0 && (
            <EstadoVacio titulo="Sin productos" detalle="No hay productos con ese filtro o búsqueda." />
          )}

          <View style={styles.totalPanel}>
            <View style={styles.totalLine}><Text>PRODUCTOS:</Text><Text>{cantidadProductos}</Text></View>
            <View style={styles.totalLine}><Text>TOTAL:</Text><Text>{formatearDinero(total)}</Text></View>
            <TouchableOpacity
              style={[styles.fullButton, cantidadProductos === 0 && styles.disabledButton]}
              onPress={() => cantidadProductos > 0 && cambiarPantalla('resumen')}
              activeOpacity={cantidadProductos > 0 ? 0.8 : 1}>
              <Text style={styles.fullButtonText}>REVISAR PEDIDO</Text>
            </TouchableOpacity>
          </View>
        </Contenido>
      )}

      {pantalla === 'resumen' && (
        <Contenido>
          <TituloConRegreso titulo="Resumen del pedido" alRegresar={() => cambiarPantalla('crear')} />
          <Text style={styles.mesaTag}>MESA: {mesaSeleccionada || 'sin asignar'}</Text>
          <View style={styles.summaryCard}>
            {articulosSeleccionados.map((item) => (
              <View key={item.id} style={styles.summaryRow}>
                <ImagenProducto uri={item.imagen} />
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{item.nombre}</Text>
                  <Text style={styles.note}>{item.observacion || 'Sin observaciones'}</Text>
                </View>
                <Text style={styles.summaryQty}>{item.cantidad}</Text>
                <Text style={styles.price}>{formatearDinero(item.precio * item.cantidad)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.totalsCard}>
            <View style={styles.totalLine}><Text>SUBTOTAL:</Text><Text>{formatearDinero(subtotal)}</Text></View>
            <View style={styles.totalLine}><Text>IVA (16%):</Text><Text>{formatearDinero(iva)}</Text></View>
            <View style={styles.totalLine}><Text>TOTAL:</Text><Text>{formatearDinero(total)}</Text></View>
          </View>
          <FilaAcciones
            tituloDerecho={enviando ? 'ENVIANDO...' : 'ENVIAR PEDIDO'}
            alIzquierda={() => cambiarPantalla('crear')}
            alDerecha={enviarPedido}
          />
        </Contenido>
      )}

      {(pantalla === 'estado' || pantalla === 'listos') && (
        <Contenido alRefrescar={alRefrescar} refrescando={cargando}>
          <TituloConRegreso
            titulo={pantalla === 'listos' ? 'Pedidos listos' : 'Estado de pedidos'}
            alRegresar={() => cambiarPantalla('inicio')}
          />
          <MensajeAviso texto={aviso} alReintentar={alRefrescar} />
          <CajaBusqueda
            placeholder="Buscar por pedido, mesa o estado..."
            value={busquedaPedido}
            onChangeText={setBusquedaPedido}
          />
          {pedidosFiltrados.map((pedido) => (
            <TarjetaPedido key={pedido.id} pedido={pedido} alVerDetalles={() => abrirDetalle(pedido)} />
          ))}
          {pedidosFiltrados.length === 0 && (
            <EstadoVacio
              titulo={pantalla === 'listos' ? 'Nada listo aún' : 'Sin pedidos'}
              detalle={pantalla === 'listos'
                ? 'Cocina todavía no marca ningún pedido como listo.'
                : 'Todavía no has registrado pedidos.'}
            />
          )}
        </Contenido>
      )}

      {pantalla === 'detalle' && pedidoSeleccionado && (
        <Contenido alRefrescar={alRefrescar} refrescando={cargando}>
          <TituloConRegreso titulo="Detalle del pedido" alRegresar={() => cambiarPantalla(pantallaRegresoDetalle)} />
          <Text style={styles.mesaTag}>MESA: {pedidoSeleccionado.mesa}</Text>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <ImagenProducto tipo="bolsa" />
              <View style={styles.productInfo}>
                <Text style={styles.productName}>PEDIDO #{pedidoSeleccionado.id}</Text>
                <Text style={styles.note}>Mesa {pedidoSeleccionado.mesa}</Text>
                <Text style={styles.note}>Registrado a las {pedidoSeleccionado.hora}</Text>
              </View>
              <EtiquetaEstado
                etiqueta={pedidoSeleccionado.estado}
                tono={tonoPorEstado(pedidoSeleccionado.estado)}
              />
            </View>
            <Divisor />
            <Text style={styles.sectionLabel}>PRODUCTOS</Text>
            {pedidoSeleccionado.items.map((item, indice) => (
              <View key={`${item.id}-${indice}`} style={styles.detailProduct}>
                <View style={styles.productInfo}>
                  <Text style={styles.detailProductName}>{item.nombre}</Text>
                  <Text style={styles.note}>{item.observacion || 'Sin observaciones'}</Text>
                </View>
                <Text>x{item.cantidad}</Text>
              </View>
            ))}
            <Divisor />
            <View style={styles.totalLine}>
              <Text style={styles.sectionLabel}>TOTAL</Text>
              <Text style={styles.productName}>{formatearDinero(pedidoSeleccionado.total)}</Text>
            </View>
          </View>

          {pedidoSeleccionado.estado === 'LISTO' ? (
            <FilaAcciones
              tituloIzquierdo="REGRESAR"
              tituloDerecho={enviando ? 'GUARDANDO...' : 'MARCAR ENTREGADO'}
              alIzquierda={() => cambiarPantalla(pantallaRegresoDetalle)}
              alDerecha={marcarComoEntregado}
            />
          ) : (
            <TouchableOpacity style={styles.fullButton} onPress={() => cambiarPantalla(pantallaRegresoDetalle)}>
              <Text style={styles.fullButtonText}>REGRESAR</Text>
            </TouchableOpacity>
          )}
        </Contenido>
      )}
    </MarcoTelefono>
  );
}

function TarjetaPedido({ pedido, alVerDetalles }) {
  const cantidadProductos = pedido.items.reduce((total, item) => total + item.cantidad, 0);

  return (
    <View style={styles.orderCard}>
      <ImagenProducto tipo="bolsa" />
      <View style={styles.productInfo}>
        <Text style={styles.productName}>PEDIDO #{pedido.id}</Text>
        <Text style={styles.note}>Mesa {pedido.mesa} · {cantidadProductos} productos</Text>
        <Text style={styles.note}>{formatearDinero(pedido.total)}</Text>
      </View>
      <View style={styles.orderRight}>
        <Text style={styles.time}>{pedido.hora}</Text>
        <EtiquetaEstado etiqueta={pedido.estado} tono={tonoPorEstado(pedido.estado)} />
        <TouchableOpacity style={styles.detailButton} onPress={alVerDetalles}>
          <Text style={styles.detailButtonText}>DETALLES</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function tonoPorEstado(estado) {
  if (estado === 'LISTO' || estado === 'ENTREGADO' || estado === 'PAGADO') return 'ready';
  if (estado === 'PREPARANDO') return 'pay';
  if (estado === 'CANCELADO') return 'danger';
  return 'neutral';
}

function formatearDinero(valor) {
  return Number(valor || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
}

const styles = StyleSheet.create({
  tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 26 },
  tableCard: { width: '47%', minHeight: 78, backgroundColor: '#DFB78F', borderRadius: 9, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, shadowColor: colores.shadow, shadowOpacity: 0.08, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 },

  tableRetomar: {
    borderWidth: 2,
    borderColor: colores.terracotta,
    opacity: 1,
  },
  tableInfo: {
    flex: 1,
  },
  tableStatusRetomar: {
    color: colores.terracotta,
    fontWeight: '900',
  },
  tableHint: {
    color: colores.muted,
    fontSize: 10,
    marginTop: 2,
  },
  tableLiberar: {
    color: colores.terracotta,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  tableOccupied: { backgroundColor: '#FFF2E7', borderWidth: 1, borderColor: colores.danger },
  tableSelected: { borderWidth: 2, borderColor: colores.terracottaDark },
  tableTitle: { color: colores.ink, fontWeight: '900', fontSize: 13 },
  tableStatus: { color: '#00A76A', fontSize: 8, fontWeight: '900', marginTop: 4 },
  tableStatusBusy: { color: colores.danger },
  selectedBox: { borderWidth: 1, borderColor: colores.line, backgroundColor: '#FFFDF8', borderRadius: 6, padding: 16, marginBottom: 22 },
  selectedTitle: { color: colores.ink, fontSize: 12, fontWeight: '900' },
  selectedMeta: { color: colores.muted, fontSize: 11, marginTop: 6, fontWeight: '700' },
  filters: { flexDirection: 'row', gap: 6, marginBottom: 20, flexWrap: 'wrap' },
  filter: { backgroundColor: '#8F6651', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  filterActive: { backgroundColor: colores.terracotta },
  filterText: { color: colores.surface, fontSize: 8, fontWeight: '900' },
  productRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#C98663', borderRadius: 6, padding: 10, marginBottom: 12, gap: 10, backgroundColor: 'rgba(255, 253, 248, 0.28)' },
  productRowSelected: { backgroundColor: '#FFFDF8', borderColor: colores.terracottaDark },
  productInfo: { flex: 1 },
  productName: { color: colores.ink, fontSize: 14, fontWeight: '900' },
  available: { color: '#00A76A', fontSize: 8, fontWeight: '900', marginTop: 4 },
  availableLow: { color: colores.warning },
  observationWrap: { marginTop: 10 },
  observationLabel: { color: colores.terracottaDark, fontSize: 9, fontWeight: '900', marginBottom: 4, letterSpacing: 0.3 },

  observationInput: {
    minHeight: 42,
    borderWidth: 1.5,
    borderColor: colores.terracotta,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colores.ink,
    fontSize: 13,
    lineHeight: 17,
    backgroundColor: colores.white,
    textAlignVertical: 'top',
  },
  quantity: { alignItems: 'flex-end', gap: 10 },
  price: { color: colores.danger, fontSize: 10, fontWeight: '900' },
  stepper: { flexDirection: 'row', borderWidth: 1, borderColor: colores.danger, borderRadius: 4, overflow: 'hidden' },
  step: { color: colores.danger, minWidth: 26, textAlign: 'center', paddingVertical: 3, fontWeight: '900' },
  addButton: { borderWidth: 1, borderColor: colores.danger, borderRadius: 4, paddingHorizontal: 9, paddingVertical: 4 },
  addButtonText: { color: colores.danger, fontSize: 8, fontWeight: '900' },
  totalPanel: { backgroundColor: '#FFFDF8', padding: 18, marginHorizontal: -20, marginBottom: 10, borderTopWidth: 1, borderTopColor: colores.line },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  fullButton: { backgroundColor: '#8F6651', height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  disabledButton: { opacity: 0.45 },
  fullButtonText: { color: colores.surface, fontSize: 10, fontWeight: '900' },
  mesaTag: { alignSelf: 'flex-start', backgroundColor: '#D6A783', color: colores.surface, fontWeight: '900', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4, marginBottom: 18, overflow: 'hidden' },
  summaryCard: { backgroundColor: '#FFFDF8', borderRadius: 10, padding: 10, marginBottom: 14, shadowColor: colores.shadow, shadowOpacity: 0.08, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colores.line, paddingVertical: 12 },
  note: { color: colores.muted, fontSize: 11, marginTop: 4, lineHeight: 15 },
  summaryQty: { color: colores.ink, fontWeight: '900', marginRight: 12 },
  totalsCard: { backgroundColor: '#FFFDF8', borderRadius: 10, padding: 18, marginBottom: 22 },
  orderCard: { backgroundColor: '#FFFDF8', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 12, borderRadius: 6, shadowColor: colores.shadow, shadowOpacity: 0.08, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  orderRight: { alignItems: 'flex-end', gap: 6 },
  time: { fontSize: 9, color: colores.ink },
  detailButton: { borderWidth: 1, borderColor: colores.danger, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  detailButtonText: { color: colores.danger, fontSize: 8, fontWeight: '900' },
  detailCard: { backgroundColor: '#FFFDF8', padding: 18, marginBottom: 28, borderRadius: 6 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionLabel: { color: colores.ink, fontSize: 10, fontWeight: '900', marginBottom: 12 },
  detailProduct: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10 },
  detailProductName: { color: colores.ink, fontSize: 11, fontWeight: '900' },
});
