import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import {
  BarraSuperior,
  CajaBusqueda,
  Contenido,
  Divisor,
  EstadoVacio,
  EtiquetaEstado,
  Icono,
  MarcoTelefono,
  MensajeAviso,
  TituloConRegreso,
  colores,
} from '../components/TerracotaUI';
import { avisar } from '../components/Avisos';
import { navegacionPorRol } from '../components/terracotaData';

const LISTAS = {
  pendientes: { titulo: 'Pedidos Pendientes', estados: ['PENDIENTE'] },
  preparacion: { titulo: 'En Preparación', estados: ['PREPARANDO'] },
  listos: { titulo: 'Listos Para Entregar', estados: ['LISTO'] },
};

export default function PantallaCocina({
  pantalla,
  cambiarPantalla,
  alCerrarSesion,
  pedidos,
  inventario,
  alCambiarEstado,
  alAjustarSuministro,
  cargando,
  aviso,
  alRefrescar,
}) {
  const [idPedidoSeleccionado, setIdPedidoSeleccionado] = useState(null);
  const [pantallaRegreso, setPantallaRegreso] = useState('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaStock, setBusquedaStock] = useState('');
  const [enviando, setEnviando] = useState(false);

  const pedidoSeleccionado = pedidos.find((pedido) => pedido.id === idPedidoSeleccionado) || null;
  const etapa = pedidoSeleccionado?.estado || 'PENDIENTE';
  const listaActiva = LISTAS[pantalla];
  const consulta = busqueda.trim().toLocaleLowerCase('es-MX');

  const pedidosVisibles = listaActiva
    ? pedidos
      .filter((pedido) => listaActiva.estados.includes(pedido.estado))
      .filter((pedido) => !consulta || [pedido.id, pedido.mesa, pedido.mesero]
        .some((valor) => String(valor).toLocaleLowerCase('es-MX').includes(consulta)))
    : [];

  const abrirPedido = (pedido) => {
    setIdPedidoSeleccionado(pedido.id);
    setPantallaRegreso(pantalla);
    cambiarPantalla('detalle');
  };

  const avanzarPedido = async () => {
    if (!pedidoSeleccionado || enviando) return;

    const siguiente = pedidoSeleccionado.estado === 'PENDIENTE' ? 'PREPARANDO' : 'LISTO';
    setEnviando(true);
    try {
      await alCambiarEstado(pedidoSeleccionado.id, siguiente);
      setPantallaRegreso(siguiente === 'PREPARANDO' ? 'preparacion' : 'listos');
    } catch (error) {
      avisar.error('No se pudo actualizar el pedido', error.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MarcoTelefono elementosNavegacion={navegacionPorRol.cocina} activo={pantalla} alNavegar={cambiarPantalla}>
      <BarraSuperior alCerrarSesion={alCerrarSesion} />

      {listaActiva && (
        <Contenido alRefrescar={alRefrescar} refrescando={cargando}>
          <TituloConRegreso titulo={listaActiva.titulo} alRegresar={() => cambiarPantalla('inicio')} />
          <MensajeAviso texto={aviso} alReintentar={alRefrescar} />
          <CajaBusqueda
            placeholder="Buscar por pedido, mesa o mesero..."
            value={busqueda}
            onChangeText={setBusqueda}
          />
          {pedidosVisibles.map((pedido) => (
            <TouchableOpacity
              key={pedido.id}
              style={styles.kitchenRow}
              onPress={() => abrirPedido(pedido)}
              activeOpacity={0.85}>
              <View style={styles.flex}>
                <Text style={styles.orderTitle}>
                  Pedido #{pedido.id} <Text style={styles.statusText}>{pedido.estado}</Text>
                </Text>
                <Text style={styles.meta}>Mesa {pedido.mesa} · {cantidadArticulos(pedido)} productos</Text>
                <Text style={styles.meta}>Mesero: {pedido.mesero}</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.meta}>{pedido.hora}</Text>
                <Icono icono="›" tamaño={26} />
              </View>
            </TouchableOpacity>
          ))}
          {pedidosVisibles.length === 0 && (
            <EstadoVacio
              titulo="Sin pedidos"
              detalle={consulta ? 'Ningún pedido coincide con la búsqueda.' : 'No hay pedidos en esta sección.'}
            />
          )}
        </Contenido>
      )}

      {pantalla === 'detalle' && pedidoSeleccionado && (
        <Contenido alRefrescar={alRefrescar} refrescando={cargando}>
          <View style={styles.detailTop}>
            <Text style={styles.bigTitle}>Pedido #{pedidoSeleccionado.id}</Text>
            <EtiquetaEstado etiqueta={etapa} tono={tonoPorEstado(etapa)} />
          </View>
          <View style={styles.orderMetaRow}>
            <Text>Mesa {pedidoSeleccionado.mesa}{'\n'}{pedidoSeleccionado.hora}</Text>
            <Text>{cantidadArticulos(pedidoSeleccionado)} productos</Text>
          </View>

          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Progreso del pedido</Text>
            <View style={styles.steps}>
              <PasoProgreso etiqueta="Recibido" activo />
              <PasoProgreso etiqueta="Preparando" activo={etapa === 'PREPARANDO' || etapa === 'LISTO'} />
              <PasoProgreso etiqueta="Listo" activo={etapa === 'LISTO'} />
            </View>
          </View>

          <View style={styles.productsCard}>
            <View style={styles.tableHeader}>
              <Text style={styles.sectionLabel}>Productos</Text>
              <Text style={styles.sectionLabel}>Cantidad</Text>
            </View>
            <Divisor />
            {pedidoSeleccionado.items.map((producto, indice) => (
              <View key={`${producto.id}-${indice}`} style={styles.productLine}>
                <View style={styles.flex}>
                  <Text style={styles.productName}>{producto.nombre}</Text>
                  {/* La observación es la instrucción del cliente: tiene que leerse bien. */}
                  {producto.observacion ? (
                    <View style={styles.observacionCaja}>
                      <Text style={styles.observacionTexto}>{producto.observacion}</Text>
                    </View>
                  ) : (
                    <Text style={styles.meta}>Sin observaciones</Text>
                  )}
                </View>
                <Text style={styles.productQty}>x{producto.cantidad}</Text>
              </View>
            ))}
          </View>

          {etapa !== 'LISTO' ? (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.backButton} onPress={() => cambiarPantalla(pantallaRegreso)}>
                <Text style={styles.backButtonText}>REGRESAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.prepButton, enviando && styles.disabled]}
                onPress={avanzarPedido}
                activeOpacity={enviando ? 1 : 0.8}>
                <Text style={styles.prepButtonText}>
                  {enviando ? 'GUARDANDO...' : etapa === 'PENDIENTE' ? 'INICIAR PREP.' : 'MARCAR LISTO'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.notice}>Pedido listo: el mesero ya puede entregarlo</Text>
              <TouchableOpacity style={styles.backButtonCenter} onPress={() => cambiarPantalla('listos')}>
                <Text style={styles.backButtonText}>REGRESAR</Text>
              </TouchableOpacity>
            </>
          )}
        </Contenido>
      )}

      {pantalla === 'inventario' && (
        <PanelInventario
          inventario={inventario}
          busqueda={busquedaStock}
          setBusqueda={setBusquedaStock}
          alRegresar={() => cambiarPantalla('inicio')}
          alAjustarSuministro={alAjustarSuministro}
          alRefrescar={alRefrescar}
          cargando={cargando}
          aviso={aviso}
        />
      )}
    </MarcoTelefono>
  );
}

function PanelInventario({
  inventario, busqueda, setBusqueda, alRegresar, alAjustarSuministro, alRefrescar, cargando, aviso,
}) {
  const [editando, setEditando] = useState(null);
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);

  const consulta = busqueda.trim().toLocaleLowerCase('es-MX');
  const visibles = inventario.filter((producto) => !consulta
    || producto.nombre.toLocaleLowerCase('es-MX').includes(consulta)
    || String(producto.categoria).toLocaleLowerCase('es-MX').includes(consulta));

  const abrirEdicion = (producto) => {
    setEditando(producto.id);
    setValor(String(producto.stock_actual));
  };

  const guardar = async (producto) => {
    const nuevo = Number(valor);
    if (!Number.isInteger(nuevo) || nuevo < 0) {
      avisar.info('Cantidad inválida', 'Escribe un número entero de cero o más.');
      return;
    }

    setGuardando(true);
    try {
      await alAjustarSuministro(producto.id, { stock_actual: nuevo });
      setEditando(null);
    } catch (error) {
      avisar.error('No se pudo actualizar', error.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Contenido alRefrescar={alRefrescar} refrescando={cargando}>
      <TituloConRegreso titulo="Inventario" alRegresar={alRegresar} />
      <MensajeAviso texto={aviso} alReintentar={alRefrescar} />
      <CajaBusqueda placeholder="Buscar producto..." value={busqueda} onChangeText={setBusqueda} />

      {visibles.map((producto) => (
        <View key={producto.id} style={styles.stockRow}>
          <View style={styles.flex}>
            <Text style={styles.productName}>{producto.nombre}</Text>
            <Text style={styles.meta}>{producto.categoria} · mínimo {producto.stock_minimo}</Text>
            {producto.en_pedidos_activos > 0 && (
              <Text style={styles.enUso}>
                En {producto.en_pedidos_activos} pedido(s) sin cerrar
              </Text>
            )}
          </View>

          {editando === producto.id ? (
            <View style={styles.stockEdit}>
              <TextInput
                style={styles.stockInput}
                value={valor}
                onChangeText={(texto) => setValor(texto.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                autoFocus
                maxLength={5}
                accessibilityLabel={`Nuevo stock de ${producto.nombre}`}
              />
              <TouchableOpacity
                style={[styles.stockSave, guardando && styles.disabled]}
                onPress={() => guardar(producto)}>
                <Text style={styles.stockSaveText}>{guardando ? '...' : 'OK'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stockCancel} onPress={() => setEditando(null)}>
                <Text style={styles.stockCancelText}>X</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.stockValue} onPress={() => abrirEdicion(producto)} activeOpacity={0.8}>
              <Text style={styles.stockNumber}>{producto.stock_actual}</Text>
              <EtiquetaEstado etiqueta={etiquetaStock(producto.estado)} tono={tonoStock(producto.estado)} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {visibles.length === 0 && (
        <EstadoVacio titulo="Sin productos" detalle="No hay productos que coincidan con la búsqueda." />
      )}

      <Text style={styles.stockHint}>Toca una cantidad para ajustar las existencias.</Text>
    </Contenido>
  );
}

function PasoProgreso({ etiqueta, activo }) {
  return (
    <View style={styles.stepWrap}>
      <View style={[styles.stepCircle, activo && styles.stepActive]}>
        <Icono
          icono={etiqueta === 'Recibido' ? 'recibido' : etiqueta === 'Preparando' ? 'preparando' : 'listo'}
          tono="light"
          tamaño={etiqueta === 'Preparando' ? 18 : 20}
        />
      </View>
      <Text style={styles.stepLabel}>{etiqueta}</Text>
    </View>
  );
}

function cantidadArticulos(pedido) {
  return pedido.items.reduce((total, item) => total + item.cantidad, 0);
}

function tonoPorEstado(estado) {
  if (estado === 'LISTO') return 'ready';
  if (estado === 'PREPARANDO') return 'pay';
  return 'neutral';
}

function etiquetaStock(estado) {
  return { DISPONIBLE: 'OK', BAJO: 'BAJO', AGOTADO: 'AGOTADO', NO_DISPONIBLE: 'FUERA' }[estado] || estado;
}

function tonoStock(estado) {
  if (estado === 'AGOTADO' || estado === 'NO_DISPONIBLE') return 'danger';
  if (estado === 'BAJO') return 'pay';
  return 'ready';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  kitchenRow: {
    backgroundColor: '#FFFDF8',
    padding: 16,
    marginBottom: 12,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    shadowColor: colores.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  rowRight: { alignItems: 'flex-end' },
  orderTitle: { color: colores.terracotta, fontSize: 16, fontWeight: '900' },
  statusText: { color: colores.ink, fontSize: 10 },
  meta: { color: colores.muted, fontSize: 10, marginTop: 4 },
  detailTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  bigTitle: { color: colores.terracottaDark, fontSize: 28, fontWeight: '900' },
  orderMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 22 },
  progressCard: {
    backgroundColor: '#FFFDF8',
    borderRadius: 8,
    padding: 18,
    marginBottom: 20,
    shadowColor: colores.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  progressTitle: { textAlign: 'center', color: colores.ink, fontWeight: '900', marginBottom: 18 },
  steps: { flexDirection: 'row', justifyContent: 'space-around' },
  stepWrap: { alignItems: 'center' },
  stepCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#DDB892',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#DDB892',
  },
  stepActive: { borderColor: '#21D44C' },
  stepLabel: { color: colores.ink, fontSize: 10, marginTop: 8, fontWeight: '900' },
  productsCard: { backgroundColor: '#FFFDF8', borderRadius: 8, padding: 20, marginBottom: 24 },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  sectionLabel: { color: colores.ink, fontSize: 11, fontWeight: '900' },
  productLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    gap: 10,
  },
  productName: { color: colores.ink, fontSize: 13, fontWeight: '900' },
  productQty: { color: colores.terracottaDark, fontWeight: '900', fontSize: 15 },
  observacionCaja: {
    backgroundColor: '#FDF3EC',
    borderLeftWidth: 3,
    borderLeftColor: colores.terracotta,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 9,
    marginTop: 6,
  },
  observacionTexto: {
    color: colores.terracottaDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  actionRow: { flexDirection: 'row', gap: 20, alignItems: 'center', marginBottom: 40 },
  backButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colores.ink,
    borderRadius: 16,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prepButton: {
    flex: 1,
    backgroundColor: '#8F6651',
    borderRadius: 16,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  backButtonText: { color: colores.ink, fontSize: 10, fontWeight: '900' },
  prepButtonText: { color: colores.surface, fontSize: 10, fontWeight: '900' },
  notice: {
    color: colores.terracottaDark,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 26,
  },
  backButtonCenter: {
    alignSelf: 'center',
    width: 150,
    borderWidth: 1,
    borderColor: colores.ink,
    borderRadius: 16,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  stockRow: {
    backgroundColor: '#FFFDF8',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  enUso: {
    color: colores.warning,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 4,
  },
  stockValue: { alignItems: 'flex-end', gap: 6 },
  stockNumber: { color: colores.terracottaDark, fontSize: 22, fontWeight: '900' },
  stockEdit: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockInput: {
    width: 62,
    height: 34,
    borderWidth: 1,
    borderColor: colores.terracotta,
    borderRadius: 6,
    textAlign: 'center',
    color: colores.ink,
    fontWeight: '900',
    backgroundColor: colores.surface,
  },
  stockSave: {
    width: 38,
    height: 34,
    borderRadius: 6,
    backgroundColor: colores.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockSaveText: { color: colores.surface, fontSize: 11, fontWeight: '900' },
  stockCancel: {
    width: 30,
    height: 34,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colores.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockCancelText: { color: colores.muted, fontSize: 11, fontWeight: '900' },
  stockHint: {
    color: colores.muted,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 30,
  },
});
