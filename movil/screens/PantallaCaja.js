import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import {
  BarraSuperior,
  CajaBusqueda,
  Contenido,
  Divisor,
  EstadoVacio,
  FilaAcciones,
  Icono,
  DialogoCancelar,
  ImagenProducto,
  Logo,
  MarcoTelefono,
  MensajeAviso,
  TituloConRegreso,
  colores,
} from '../components/TerracotaUI';
import { avisar } from '../components/Avisos';
import { metodosPago, navegacionPorRol } from '../components/terracotaData';
import { compartirTicketPdf } from '../utils/ticketPdf';

export default function PantallaCaja({
  pantalla,
  cambiarPantalla,
  alCerrarSesion,
  pedidosPendientes,
  tickets,
  ventasHoy,
  alRegistrarPago,
  alCancelarPedido,
  cargando,
  aviso,
  alRefrescar,
}) {
  const [metodo, setMetodo] = useState('Efectivo');
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [montoRecibido, setMontoRecibido] = useState('');
  const [ultimoTicket, setUltimoTicket] = useState(null);
  const [ticketSeleccionado, setTicketSeleccionado] = useState(null);
  const [busquedaTicket, setBusquedaTicket] = useState('');
  const [busquedaPedido, setBusquedaPedido] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [pedidoACancelar, setPedidoACancelar] = useState(null);
  const [cancelando, setCancelando] = useState(false);

  const pedidosFiltrados = useMemo(() => {
    const termino = busquedaPedido.trim().toLocaleLowerCase('es-MX');
    if (!termino) return pedidosPendientes;
    return pedidosPendientes.filter((pedido) => [pedido.id, pedido.mesa, pedido.mesero]
      .some((valor) => String(valor).toLocaleLowerCase('es-MX').includes(termino)));
  }, [busquedaPedido, pedidosPendientes]);

  const ticketsFiltrados = useMemo(() => {
    const termino = busquedaTicket.trim().toLocaleLowerCase('es-MX');
    if (!termino) return tickets;
    return tickets.filter((ticket) => [
      ticket.folio, ticket.mesa, ticket.fecha, ticket.hora, ticket.metodo,
      ...ticket.items.map((item) => item.nombre),
    ].some((valor) => String(valor).toLocaleLowerCase('es-MX').includes(termino)));
  }, [busquedaTicket, tickets]);

  const cambio = useMemo(() => {
    if (!pedidoSeleccionado || metodo !== 'Efectivo') return 0;
    const recibido = Number(montoRecibido.replace(',', '.'));
    return Number.isFinite(recibido) ? Math.max(0, recibido - pedidoSeleccionado.total) : 0;
  }, [metodo, montoRecibido, pedidoSeleccionado]);

  const iniciarPago = (pedido) => {
    setPedidoSeleccionado(pedido);
    setMetodo('Efectivo');
    setMontoRecibido('');
    cambiarPantalla('pago');
  };

  const confirmarCancelacion = async (motivo, clienteEnMesa) => {
    setCancelando(true);
    try {
      await alCancelarPedido(pedidoACancelar.id, motivo, clienteEnMesa);
      setPedidoACancelar(null);
      avisar.exito('Pedido cancelado', 'Los productos regresaron al inventario.');
      cambiarPantalla('pedidos');
    } catch (error) {
      avisar.error('No se pudo cancelar', error.message);
    } finally {
      setCancelando(false);
    }
  };

  const confirmarPago = async () => {
    if (cobrando) return;
    if (!pedidoSeleccionado) {
      avisar.info('Selecciona un pedido', 'Primero elige un pedido pendiente de pago.');
      return;
    }

    const recibido = metodo === 'Efectivo'
      ? Number(montoRecibido.replace(',', '.'))
      : pedidoSeleccionado.total;

    if (!Number.isFinite(recibido) || recibido <= 0) {
      avisar.info('Monto inválido', 'Escribe el monto recibido.');
      return;
    }
    if (recibido < pedidoSeleccionado.total) {
      avisar.info(
        'Monto insuficiente',
        `Faltan ${formatearDinero(pedidoSeleccionado.total - recibido)} para completar el pago.`,
      );
      return;
    }

    setCobrando(true);
    try {
      const ticket = await alRegistrarPago({
        pedido_id: pedidoSeleccionado.id,
        metodo: metodo.toLocaleUpperCase('es-MX'),
        ...(metodo === 'Efectivo' ? { monto_recibido: recibido } : {}),
      });
      setUltimoTicket(ticket);
      setPedidoSeleccionado(null);
      setMontoRecibido('');
      cambiarPantalla('success');
    } catch (error) {
      avisar.error('No se pudo registrar el pago', error.message);
    } finally {
      setCobrando(false);
    }
  };

  const compartirTicket = async () => {
    if (!ticketSeleccionado) return;
    try {
      await compartirTicketPdf(ticketSeleccionado);
    } catch (error) {
      avisar.error('No se pudo generar el PDF', error.message);
    }
  };

  const abrirTicket = (ticket) => {
    setTicketSeleccionado(ticket);
    cambiarPantalla('ticketDetalle');
  };

  return (
    <MarcoTelefono elementosNavegacion={navegacionPorRol.caja} activo={pantalla} alNavegar={cambiarPantalla}>
      <BarraSuperior alCerrarSesion={alCerrarSesion} />

      {pantalla === 'pedidos' && (
        <Contenido alRefrescar={alRefrescar} refrescando={cargando}>
          <TituloConRegreso titulo="Pedidos por cobrar" alRegresar={() => cambiarPantalla('inicio')} />
          <MensajeAviso texto={aviso} alReintentar={alRefrescar} />
          <CajaBusqueda
            placeholder="Buscar por pedido, mesa o mesero..."
            value={busquedaPedido}
            onChangeText={setBusquedaPedido}
          />
          {pedidosFiltrados.map((pedido) => (
            <View key={pedido.id} style={styles.orderCard}>
              <ImagenProducto tipo="bolsa" />
              <View style={styles.flex}>
                <Text style={styles.orderTitle}>PEDIDO #{pedido.id}</Text>
                <Text style={styles.meta}>Mesa {pedido.mesa} · {pedido.mesero}</Text>
                <Text style={styles.meta}>{pedido.items.length} producto(s) · {pedido.hora}</Text>
              </View>
              <View style={styles.orderRight}>
                <Text style={styles.total}>{formatearDinero(pedido.total)}</Text>
                <TouchableOpacity style={styles.payButton} onPress={() => iniciarPago(pedido)}>
                  <Text style={styles.payButtonText}>COBRAR</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {pedidosFiltrados.length === 0 && (
            <EstadoVacio
              titulo={pedidosPendientes.length === 0 ? 'No hay pagos pendientes' : 'Sin coincidencias'}
              detalle={pedidosPendientes.length === 0
                ? 'Los pedidos aparecen aquí cuando el mesero los marca como entregados.'
                : 'Prueba con otro número de pedido o mesa.'}
            />
          )}
        </Contenido>
      )}

      {pantalla === 'pago' && (
        <Contenido>
          <TituloConRegreso titulo="Registrar pago" alRegresar={() => cambiarPantalla('pedidos')} />
          {!pedidoSeleccionado ? (
            <>
              <EstadoVacio
                titulo="Selecciona un pedido"
                detalle="Elige desde la lista de pedidos por cobrar."
              />
              <TouchableOpacity style={styles.fullButton} onPress={() => cambiarPantalla('pedidos')}>
                <Text style={styles.fullButtonText}>VER PEDIDOS</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.paySummary}>
                <ImagenProducto tipo="bolsa" />
                <View style={styles.flex}>
                  <Text style={styles.orderTitle}>PEDIDO #{pedidoSeleccionado.id}</Text>
                  <Text style={styles.meta}>Mesa {pedidoSeleccionado.mesa}</Text>
                  <Text style={styles.meta}>{pedidoSeleccionado.items.length} producto(s)</Text>
                </View>
                <View>
                  <Text style={styles.meta}>TOTAL</Text>
                  <Text style={styles.total}>{formatearDinero(pedidoSeleccionado.total)}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.cancelarPedido}
                onPress={() => setPedidoACancelar(pedidoSeleccionado)}
                activeOpacity={0.8}>
                <Text style={styles.cancelarPedidoTexto}>CANCELAR ESTE PEDIDO</Text>
              </TouchableOpacity>
              <Text style={styles.sectionTitle}>Método de pago</Text>
              {metodosPago.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.method, metodo === item && styles.methodActive]}
                  onPress={() => setMetodo(item)}
                  activeOpacity={0.85}>
                  <Icono
                    icono={item === 'Efectivo' ? 'efectivo' : item === 'Tarjeta' ? 'tarjeta' : 'transferencia'}
                    tono="brand"
                    tamaño={18}
                  />
                  <Text style={styles.methodText}>{item}</Text>
                </TouchableOpacity>
              ))}

              <View style={styles.payLine}>
                <Text style={styles.metaLarge}>MONTO RECIBIDO</Text>
                {metodo === 'Efectivo' ? (
                  <View style={styles.amountInputWrap}>
                    <Text style={styles.currencyPrefix}>$</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={montoRecibido}
                      onChangeText={(valor) => setMontoRecibido(valor.replace(/[^0-9.,]/g, ''))}
                      placeholder="0.00"
                      placeholderTextColor={colores.muted}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      accessibilityLabel="Monto recibido"
                    />
                  </View>
                ) : (
                  <Text style={styles.amount}>{formatearDinero(pedidoSeleccionado.total)}</Text>
                )}
              </View>
              <View style={styles.payLine}>
                <Text style={styles.metaLarge}>CAMBIO</Text>
                <Text style={styles.amount}>
                  {metodo === 'Efectivo' ? formatearDinero(cambio) : 'No aplica'}
                </Text>
              </View>

              <FilaAcciones
                tituloDerecho={cobrando ? 'COBRANDO...' : 'CONFIRMAR PAGO'}
                alIzquierda={() => cambiarPantalla('pedidos')}
                alDerecha={confirmarPago}
              />
            </>
          )}
        </Contenido>
      )}

      {pantalla === 'success' && ultimoTicket && (
        <Contenido>
          <View style={styles.successIcon}><Text style={styles.successCheck}>✓</Text></View>
          <Text style={styles.successTitle}>¡Pago registrado!</Text>
          <Text style={styles.successMeta}>Ticket #{ultimoTicket.folio} generado correctamente.</Text>
          <View style={styles.ticketCard}>
            <Text style={styles.orderTitle}>PEDIDO #{ultimoTicket.pedidoId}</Text>
            <Text style={styles.meta}>Mesa {ultimoTicket.mesa}</Text>
            <Divisor />
            <View style={styles.payLine}>
              <Text>TOTAL PAGADO</Text><Text style={styles.green}>{formatearDinero(ultimoTicket.total)}</Text>
            </View>
            <View style={styles.payLine}><Text>MÉTODO</Text><Text>{ultimoTicket.metodo}</Text></View>
            <View style={styles.payLine}>
              <Text>CAMBIO</Text><Text>{formatearDinero(ultimoTicket.cambio)}</Text>
            </View>
          </View>
          <FilaAcciones
            tituloIzquierdo="PEDIDOS"
            tituloDerecho="VER TICKET"
            alIzquierda={() => cambiarPantalla('pedidos')}
            alDerecha={() => abrirTicket(ultimoTicket)}
          />
        </Contenido>
      )}

      {pantalla === 'ventas' && (
        <Contenido alRefrescar={alRefrescar} refrescando={cargando}>
          <TituloConRegreso titulo="Ventas del día" alRegresar={() => cambiarPantalla('inicio')} />
          <MensajeAviso texto={aviso} alReintentar={alRefrescar} />
          <Text style={styles.datePill}>FECHA: {ventasHoy?.fecha || '—'}</Text>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>VENTAS TOTALES</Text>
            <Text style={styles.metricValue}>{formatearDinero(ventasHoy?.total)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>COBROS REALIZADOS</Text>
            <Text style={styles.metricValue}>{ventasHoy?.pagos ?? 0}</Text>
          </View>

          <Text style={styles.sectionTitle}>Desglose por método</Text>
          {[
            ['Efectivo', ventasHoy?.efectivo],
            ['Tarjeta', ventasHoy?.tarjeta],
            ['Transferencia', ventasHoy?.transferencia],
          ].map(([etiqueta, monto]) => {
            const totalDia = Number(ventasHoy?.total || 0);
            const porcentaje = totalDia > 0 ? Math.round((Number(monto || 0) / totalDia) * 100) : 0;
            return (
              <View key={etiqueta} style={styles.paymentStat}>
                <Text style={styles.methodText}>{etiqueta}</Text>
                <Text style={styles.metaLarge}>{formatearDinero(monto)}</Text>
                <Text style={styles.percent}>{porcentaje}%</Text>
              </View>
            );
          })}
        </Contenido>
      )}

      {pantalla === 'tickets' && (
        <Contenido alRefrescar={alRefrescar} refrescando={cargando}>
          <TituloConRegreso titulo="Historial de tickets" alRegresar={() => cambiarPantalla('inicio')} />
          <MensajeAviso texto={aviso} alReintentar={alRefrescar} />
          <CajaBusqueda
            placeholder="Buscar por folio, mesa o método..."
            value={busquedaTicket}
            onChangeText={setBusquedaTicket}
          />
          <View style={styles.ticketsSummaryRow}>
            <View style={styles.ticketsSummaryBox}>
              <Text style={styles.ticketsSummaryNum}>{tickets.length}</Text>
              <Text style={styles.ticketsSummaryLabel}>Tickets emitidos</Text>
            </View>
            <View style={styles.ticketsSummaryBox}>
              <Text style={styles.ticketsSummaryNum}>
                {formatearDinero(tickets.reduce((acumulado, t) => acumulado + t.total, 0))}
              </Text>
              <Text style={styles.ticketsSummaryLabel}>Total acumulado</Text>
            </View>
          </View>

          {ticketsFiltrados.map((ticket) => (
            <TouchableOpacity
              key={ticket.folio}
              style={styles.ticketRow}
              onPress={() => abrirTicket(ticket)}
              activeOpacity={0.82}>
              <View style={[styles.ticketFolioBox, { borderColor: colorMetodo(ticket.metodo) }]}>
                <Text style={[styles.ticketFolioText, { color: colorMetodo(ticket.metodo) }]}>#{ticket.folio}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.orderTitle}>Mesa {ticket.mesa}</Text>
                <Text style={styles.meta}>{ticket.fecha} · {ticket.hora} · {ticket.metodo}</Text>
              </View>
              <Text style={styles.total}>{formatearDinero(ticket.total)}</Text>
            </TouchableOpacity>
          ))}
          {ticketsFiltrados.length === 0 && (
            <EstadoVacio titulo="Sin tickets" detalle="Todavía no hay cobros registrados." />
          )}
        </Contenido>
      )}

      {pantalla === 'ticketDetalle' && ticketSeleccionado && (
        <Contenido>
          <TituloConRegreso
            titulo={`Ticket #${ticketSeleccionado.folio}`}
            alRegresar={() => cambiarPantalla('tickets')}
          />
          <View style={styles.printTicket}>
            <Logo />
            <Divisor />
            <View style={styles.ticketMetaRow}>
              <View style={styles.flex}>
                <Text style={styles.ticketMetaLabel}>FOLIO</Text>
                <Text style={styles.ticketMetaValue}>#{ticketSeleccionado.folio}</Text>
              </View>
              <View style={styles.ticketMetaCenter}>
                <Text style={styles.ticketMetaLabel}>MESA</Text>
                <Text style={styles.ticketMetaValue}>{ticketSeleccionado.mesa}</Text>
              </View>
              <View style={styles.ticketMetaRight}>
                <Text style={styles.ticketMetaLabel}>MÉTODO</Text>
                <Text style={styles.ticketMetaValue}>{ticketSeleccionado.metodo}</Text>
              </View>
            </View>
            <Text style={styles.ticketFecha}>
              {ticketSeleccionado.fecha}  ·  {ticketSeleccionado.hora}
            </Text>
            <Divisor />

            <View style={styles.ticketTableHeader}>
              <Text style={styles.ticketColProduct}>PRODUCTO</Text>
              <Text style={styles.ticketColQty}>CANT.</Text>
              <Text style={styles.ticketColPrice}>IMPORTE</Text>
            </View>
            <Divisor />

            {ticketSeleccionado.items.map((item, indice) => (
              <View key={`${item.nombre}-${indice}`} style={styles.ticketItemRow}>
                <Text style={styles.ticketItemName}>{item.nombre}</Text>
                <Text style={styles.ticketItemQty}>x{item.cantidad}</Text>
                <Text style={styles.ticketItemPrice}>{formatearDinero(item.precio * item.cantidad)}</Text>
              </View>
            ))}

            <Divisor />
            <View style={styles.payLine}>
              <Text style={styles.ticketTotalLabel}>TOTAL</Text>
              <Text style={styles.ticketTotalValue}>{formatearDinero(ticketSeleccionado.total)}</Text>
            </View>
            {ticketSeleccionado.cambio > 0 && (
              <View style={styles.payLine}>
                <Text style={styles.meta}>CAMBIO ENTREGADO</Text>
                <Text style={styles.meta}>{formatearDinero(ticketSeleccionado.cambio)}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.shareButton}
            onPress={compartirTicket}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Compartir ticket en PDF">
            <Icono icono="compartir" tono="light" tamaño={16} />
            <Text style={styles.shareText}>COMPARTIR TICKET (PDF)</Text>
          </TouchableOpacity>
        </Contenido>
      )}
      <DialogoCancelar
        visible={Boolean(pedidoACancelar)}
        pedido={pedidoACancelar}
        enviando={cancelando}
        alCerrar={() => setPedidoACancelar(null)}
        alConfirmar={confirmarCancelacion}
      />
    </MarcoTelefono>
  );
}

function colorMetodo(metodo) {
  if (metodo === 'EFECTIVO') return '#4CAF50';
  if (metodo === 'TARJETA') return '#2196F3';
  return '#FF9800';
}

function formatearDinero(valor) {
  return Number(valor || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
}

const tarjeta = {
  backgroundColor: '#FFFDF8',
  borderRadius: 10,
  shadowColor: colores.shadow,
  shadowOpacity: 0.08,
  shadowRadius: 7,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  orderCard: { ...tarjeta, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 12 },
  orderRight: { alignItems: 'flex-end', gap: 8 },
  orderTitle: { color: colores.ink, fontSize: 14, fontWeight: '900' },
  meta: { color: colores.muted, fontSize: 10, marginTop: 3 },
  metaLarge: { color: colores.ink, fontSize: 12, fontWeight: '900' },
  total: { color: colores.terracottaDark, fontSize: 15, fontWeight: '900' },
  payButton: { backgroundColor: colores.terracotta, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 6 },
  cancelarPedido: {
    alignItems: 'center',
    borderColor: '#B3261E',
    borderRadius: 21,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    marginTop: 14,
  },
  cancelarPedidoTexto: { color: '#B3261E', fontSize: 11, fontWeight: '900' },
  payButtonText: { color: colores.surface, fontSize: 9, fontWeight: '900' },
  paySummary: { ...tarjeta, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 20 },
  sectionTitle: { color: colores.ink, fontSize: 12, fontWeight: '900', marginBottom: 12, marginTop: 6 },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colores.line,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FFFDF8',
  },
  methodActive: { borderColor: colores.terracotta, borderWidth: 2, backgroundColor: '#FDF3EC' },
  methodText: { color: colores.ink, fontSize: 12, fontWeight: '900', flex: 1 },
  payLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  amount: { color: colores.terracottaDark, fontSize: 15, fontWeight: '900' },
  amountInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: 1, borderBottomColor: colores.terracotta, minWidth: 120 },
  currencyPrefix: { color: colores.terracottaDark, fontSize: 15, fontWeight: '900' },
  amountInput: { flex: 1, height: 36, color: colores.ink, fontSize: 15, fontWeight: '900', textAlign: 'right' },
  fullButton: { backgroundColor: '#8F6651', height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  fullButtonText: { color: colores.surface, fontSize: 10, fontWeight: '900' },
  successIcon: {
    width: 74, height: 74, borderRadius: 37, backgroundColor: '#DFF3E3',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 20, marginBottom: 16,
  },
  successCheck: { color: '#1E8B3A', fontSize: 40, fontWeight: '900' },
  successTitle: { color: colores.terracottaDark, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  successMeta: { color: colores.muted, fontSize: 11, textAlign: 'center', marginTop: 8, marginBottom: 22 },
  ticketCard: { ...tarjeta, padding: 18, marginBottom: 22 },
  green: { color: '#1E8B3A', fontWeight: '900' },
  datePill: {
    alignSelf: 'flex-start', backgroundColor: '#D6A783', color: colores.surface, fontWeight: '900',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4, marginBottom: 18, overflow: 'hidden',
  },
  metricCard: { ...tarjeta, padding: 18, marginBottom: 12 },
  metricLabel: { color: colores.muted, fontSize: 10, fontWeight: '900' },
  metricValue: { color: colores.terracottaDark, fontSize: 26, fontWeight: '900', marginTop: 6 },
  paymentStat: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFDF8', borderRadius: 8, padding: 14, marginBottom: 8,
  },
  percent: { color: colores.muted, fontSize: 11, fontWeight: '900', width: 42, textAlign: 'right' },
  ticketsSummaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  ticketsSummaryBox: { ...tarjeta, flex: 1, padding: 14, alignItems: 'center' },
  ticketsSummaryNum: { color: colores.terracottaDark, fontSize: 18, fontWeight: '900' },
  ticketsSummaryLabel: { color: colores.muted, fontSize: 10, marginTop: 4, textAlign: 'center' },
  ticketRow: { ...tarjeta, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 10 },
  ticketFolioBox: { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6 },
  ticketFolioText: { fontSize: 10, fontWeight: '900' },
  printTicket: { backgroundColor: '#FFFDF8', borderRadius: 10, padding: 20, marginBottom: 20 },
  ticketMetaRow: { flexDirection: 'row', marginTop: 6 },
  ticketMetaCenter: { flex: 1, alignItems: 'center' },
  ticketMetaRight: { flex: 1, alignItems: 'flex-end' },
  ticketMetaLabel: { color: colores.muted, fontSize: 8, fontWeight: '900' },
  ticketMetaValue: { color: colores.ink, fontSize: 12, fontWeight: '900', marginTop: 3 },
  ticketFecha: { color: colores.muted, fontSize: 10, textAlign: 'center', marginTop: 12 },
  ticketTableHeader: { flexDirection: 'row', marginTop: 6 },
  ticketColProduct: { flex: 1, color: colores.muted, fontSize: 9, fontWeight: '900' },
  ticketColQty: { width: 44, color: colores.muted, fontSize: 9, fontWeight: '900', textAlign: 'center' },
  ticketColPrice: { width: 88, color: colores.muted, fontSize: 9, fontWeight: '900', textAlign: 'right' },
  ticketItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colores.line },
  ticketItemName: { flex: 1, color: colores.ink, fontSize: 11 },
  ticketItemQty: { width: 44, textAlign: 'center', color: colores.ink, fontSize: 11 },
  ticketItemPrice: { width: 88, textAlign: 'right', color: colores.ink, fontSize: 11, fontWeight: '700' },
  ticketTotalLabel: { color: colores.terracottaDark, fontSize: 13, fontWeight: '900' },
  ticketTotalValue: { color: colores.terracottaDark, fontSize: 17, fontWeight: '900' },
  shareButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colores.terracotta, height: 42, borderRadius: 21, marginBottom: 40,
  },
  shareText: { color: colores.surface, fontSize: 11, fontWeight: '900' },
});
