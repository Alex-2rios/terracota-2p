import React from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  StatusBar,
} from 'react-native';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const propsTeclado = {
  keyboardShouldPersistTaps: 'handled',
  keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
};

const comportamientoTeclado = Platform.OS === 'ios' ? 'padding' : undefined;

const RELLENO_BARRA = 10;

const recursosIconos = {
  home: require('../assets/Menu.png'),
  mesa: require('../assets/Mesa.png'),
  pedidos: require('../assets/Pedidos.png'),
  tickets: require('../assets/Tickets.png'),
  ventas: require('../assets/Ventas.png'),
  estado: require('../assets/estado.png'),
  estadoOscuro: require('../assets/EstadoOscuro.png'),
  producto: require('../assets/Producto.png'),
  recibido: require('../assets/Recibido.png'),
  preparando: require('../assets/Preparando.png'),
  listo: require('../assets/card-checklist.png'),
  usuario: require('../assets/Usuario.png'),
  candado: require('../assets/Candado.png'),
  ingresar: require('../assets/Ingresar.png'),
  bolsa: require('../assets/Bolsa.png'),
  pedidosListos: require('../assets/PedidosListos.png'),
  pedidosPendientes: require('../assets/PedidosPendientes.png'),
  crearPedido: require('../assets/CrearPedido.png'),
  efectivo: require('../assets/Efectivo.png'),
  tarjeta: require('../assets/Tarjeta.png'),
  transferencia: require('../assets/bank2.png'),
  cerrarSesion: require('../assets/CerrarSesion.png'),
  compartir: require('../assets/Compartir.png'),
  ojo: require('../assets/ojo.png'),
};

export const colores = {
  background: '#F4EBDD',
  surface: '#FFF9EF',
  surfaceAlt: '#EFE0CF',
  terracotta: '#A64E37',
  terracottaDark: '#6E321F',
  clay: '#C98663',
  olive: '#6F7C52',
  ink: '#2E211C',
  muted: '#8A7567',
  line: '#DEC9B5',
  success: '#4E7A52',
  warning: '#C47B3D',
  danger: '#FF3B30',
  ready: '#28E836',
  white: '#FFFDF8',
  shadow: '#2B1710',
};

export function Icono({ icono, tono = 'default', tamaño = 16, style }) {
  const source = recursosIconos[icono];

  if (source) {
    return (
      <Image
        source={source}
        style={[styles.iconImage, { width: tamaño, height: tamaño }, style]}
        resizeMode="contain"
      />
    );
  }

  const iconStyle = [
    styles.iconSlot,
    tono === 'light' && styles.iconLight,
    tono === 'brand' && styles.iconBrand,
    { fontSize: tamaño },
    style,
  ];

  return <Text style={iconStyle}>{icono}</Text>;
}

export function Logo({ compacto = false }) {
  return (
    <View style={styles.logoWrap}>
      <Image
        source={compacto ? require('../assets/logoClaro.png') : require('../assets/logoOscuro.png')}
        style={compacto ? styles.logoImageCompact : styles.logoImage}
        resizeMode="contain"
      />
      {!compacto && <Text style={styles.logoSub}>cocina artesanal</Text>}
    </View>
  );
}

export function BotonPrincipal({ titulo, onPress, style, icono }) {
  return (
    <TouchableOpacity style={[styles.primaryButton, style]} onPress={onPress} activeOpacity={0.82}>
      {icono && <Icono icono={icono} tono="light" tamaño={16} />}
      <Text style={styles.primaryButtonText}>{titulo}</Text>
    </TouchableOpacity>
  );
}

export function BotonFantasma({ titulo, onPress, activo }) {
  return (
    <TouchableOpacity
      style={[styles.ghostButton, activo && styles.ghostButtonActive]}
      onPress={onPress}
      activeOpacity={0.78}>
      <Text style={[styles.ghostButtonText, activo && styles.ghostButtonTextActive]}>{titulo}</Text>
    </TouchableOpacity>
  );
}

export function CampoTexto({
  etiqueta,
  placeholder,
  secureTextEntry,
  keyboardType,
  value,
  onChangeText,
  icono,
  iconoDerecho,
  alPresionarDerecha,
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{etiqueta}</Text>
      <View style={styles.inputShell}>
        {icono && <Icono icono={icono} tamaño={16} style={styles.inputIcon} />}
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#B89D8C"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          value={value}
          onChangeText={onChangeText}
        />
        {iconoDerecho && (
          <TouchableOpacity onPress={alPresionarDerecha} hitSlop={8} activeOpacity={0.75}>
            <Icono icono={iconoDerecho} tamaño={22} style={styles.inputRightIcon} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function ContenedorPantalla({ children, scroll = true }) {
  const ComponenteContenido = scroll ? ScrollView : View;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.content} behavior={comportamientoTeclado}>
        <ComponenteContenido
          style={styles.content}
          contentContainerStyle={scroll ? styles.scrollContent : undefined}
          showsVerticalScrollIndicator={false}
          {...(scroll ? propsTeclado : null)}>
          {children}
        </ComponenteContenido>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function MarcoTelefono({ children, elementosNavegacion = [], activo, alNavegar, mostrarNavegacion = true }) {
  const margenes = useSafeAreaInsets();

  return (

    <SafeAreaView style={styles.phoneSafe} edges={['top', 'left', 'right']}>
      <View style={styles.phone}>
        {children}
        {mostrarNavegacion && (
          <View style={[styles.roleNav, { paddingBottom: RELLENO_BARRA + margenes.bottom }]}>
            {elementosNavegacion.map((elemento) => (
              <TouchableOpacity
                key={elemento.clave}
                style={[styles.roleNavItem, activo === elemento.clave && styles.roleNavActive]}
                onPress={() => alNavegar(elemento.clave)}
                activeOpacity={0.8}>
                <Icono icono={elemento.icono} tono="light" tamaño={16} />
                <Text style={styles.roleNavLabel}>{elemento.etiqueta}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

export function BarraSuperior({ alCerrarSesion }) {
  return (
    <View style={styles.headerBar}>
      <Logo compacto />
      <TouchableOpacity onPress={alCerrarSesion} hitSlop={10}>
        <Icono icono="cerrarSesion" tono="light" tamaño={18} />
      </TouchableOpacity>
    </View>
  );
}

export function Contenido({ children, scroll = true, alRefrescar, refrescando = false }) {
  if (!scroll) {
    return <View style={styles.roleContent}>{children}</View>;
  }

  return (
    <KeyboardAvoidingView style={styles.roleContent} behavior={comportamientoTeclado}>
      <ScrollView
        style={styles.roleContent}
        contentContainerStyle={styles.roleScroll}
        showsVerticalScrollIndicator={false}
        {...propsTeclado}
        refreshControl={alRefrescar ? (
          <RefreshControl
            refreshing={refrescando}
            onRefresh={alRefrescar}
            colors={[colores.terracotta]}
            tintColor={colores.terracotta}
          />
        ) : undefined}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function MensajeAviso({ texto, tono = 'error', alReintentar }) {
  if (!texto) return null;

  return (
    <View style={[styles.notice, tono === 'info' && styles.noticeInfo]}>
      <Text style={styles.noticeText}>{texto}</Text>
      {alReintentar && (
        <TouchableOpacity onPress={alReintentar} hitSlop={8}>
          <Text style={styles.noticeAction}>REINTENTAR</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function EstadoVacio({ titulo, detalle }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>{titulo}</Text>
      {detalle ? <Text style={styles.emptyStateText}>{detalle}</Text> : null}
    </View>
  );
}

export function Cargador({ visible, texto = 'Cargando...' }) {
  if (!visible) return null;

  return (
    <View style={styles.loaderRow}>
      <ActivityIndicator size="small" color={colores.terracotta} />
      <Text style={styles.loaderText}>{texto}</Text>
    </View>
  );
}

export function TituloConRegreso({ titulo, alRegresar, derecha }) {
  return (
    <View style={styles.backTitle}>
      <TouchableOpacity style={styles.backCircle} onPress={alRegresar} activeOpacity={0.8}>
        <Icono icono="←" tamaño={14} />
      </TouchableOpacity>
      <Text style={styles.roleTitle}>{titulo}</Text>
      {derecha}
    </View>
  );
}

export function BotonRol({ icono, titulo, onPress, variante = 'filled' }) {
  const conContorno = variante === 'outline';

  return (
    <TouchableOpacity
      style={[styles.roleButton, conContorno && styles.roleButtonOutline]}
      onPress={onPress}
      activeOpacity={0.82}>
      <Icono icono={icono} tono={conContorno ? 'default' : 'light'} tamaño={16} />
      <Text style={[styles.roleButtonText, conContorno && styles.roleButtonTextOutline]}>{titulo}</Text>
    </TouchableOpacity>
  );
}

export function CajaBusqueda({ placeholder = 'Buscar mesa o pedido...', value, onChangeText }) {
  return (
    <View style={styles.searchBox}>
      <TextInput
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor="#9B8475"
        value={value}
        onChangeText={onChangeText}
      />
      <Icono icono="⌕" tamaño={18} />
    </View>
  );
}

export function EtiquetaEstado({ etiqueta, tono = 'neutral' }) {
  const pillStyle = [
    styles.statusPill,
    tono === 'danger' && styles.statusDanger,
    tono === 'ready' && styles.statusReady,
    tono === 'pay' && styles.statusPay,
  ];

  return (
    <View style={pillStyle}>
      <Text style={styles.statusPillText}>{etiqueta}</Text>
    </View>
  );
}

export function Divisor() {
  return <View style={styles.miniDivider} />;
}

export function FilaAcciones({ tituloIzquierdo = 'CANCELAR', tituloDerecho, alIzquierda, alDerecha }) {
  return (
    <View style={styles.actionRow}>
      <TouchableOpacity style={styles.cancelButton} onPress={alIzquierda} activeOpacity={0.8}>
      <Text style={styles.cancelButtonText}>{tituloIzquierdo}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.confirmButton} onPress={alDerecha} activeOpacity={0.8}>
      <Text style={styles.confirmButtonText}>{tituloDerecho}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ImagenProducto({ tipo = 'bebida', uri }) {

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.productImage, styles.productPhoto]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={[styles.productImage, tipo === 'bolsa' && styles.productBag]}>
      <Icono icono={tipo === 'bolsa' ? 'bolsa' : 'producto'} tono="light" tamaño={tipo === 'bolsa' ? 39 : 35} />
    </View>
  );
}

export function DialogoCancelar({ visible, pedido, alCerrar, alConfirmar, enviando }) {
  const [motivo, setMotivo] = React.useState('');
  const [clienteEnMesa, setClienteEnMesa] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (visible) {
      setMotivo('');
      setClienteEnMesa(true);
      setError(null);
    }
  }, [visible]);

  if (!visible || !pedido) return null;

  const confirmar = () => {
    const limpio = motivo.trim();
    if (limpio.length < 4) {
      setError('Explica brevemente por qué se cancela.');
      return;
    }
    alConfirmar(limpio, clienteEnMesa);
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={alCerrar} statusBarTranslucent>
      <View style={styles.dlgFondo}>
        <View style={styles.dlgCaja}>
          <Text style={styles.dlgTitulo}>Cancelar pedido #{pedido.id}</Text>
          <Text style={styles.dlgTexto}>
            Mesa {pedido.mesa} · se devolverán los productos al inventario.
          </Text>

          <Text style={styles.dlgEtiqueta}>Motivo</Text>
          <TextInput
            style={styles.dlgCampo}
            value={motivo}
            onChangeText={(valor) => { setMotivo(valor); setError(null); }}
            placeholder="Por ejemplo: se acabó un ingrediente"
            placeholderTextColor="#B89D8C"
            multiline
            maxLength={250}
          />
          {error ? <Text style={styles.dlgError}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.dlgCasilla}
            onPress={() => setClienteEnMesa(!clienteEnMesa)}
            activeOpacity={0.8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: clienteEnMesa }}>
            <View style={[styles.dlgMarca, clienteEnMesa && styles.dlgMarcaActiva]}>
              {clienteEnMesa ? <Text style={styles.dlgMarcaTexto}>✓</Text> : null}
            </View>
            <Text style={styles.dlgCasillaTexto}>
              El cliente sigue en la mesa{'\n'}
              <Text style={styles.dlgCasillaNota}>
                {clienteEnMesa
                  ? 'La mesa seguirá ocupada para volver a tomarle la orden.'
                  : 'La mesa quedará libre.'}
              </Text>
            </Text>
          </TouchableOpacity>

          <View style={styles.dlgAcciones}>
            <TouchableOpacity style={styles.dlgVolver} onPress={alCerrar} activeOpacity={0.8}>
              <Text style={styles.dlgVolverTexto}>VOLVER</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dlgConfirmar, enviando && styles.dlgConfirmarInactivo]}
              onPress={enviando ? undefined : confirmar}
              activeOpacity={0.8}>
              <Text style={styles.dlgConfirmarTexto}>
                {enviando ? 'CANCELANDO...' : 'CANCELAR PEDIDO'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function BarraTitulo({ titulo, subtitulo, accion }) {
  return (
    <View style={styles.topBar}>
      <View>
        <Text style={styles.overline}>{subtitulo}</Text>
        <Text style={styles.topTitle}>{titulo}</Text>
      </View>
      {accion && <View>{accion}</View>}
    </View>
  );
}

export function Panel({ titulo, children, accion, style }) {
  return (
    <View style={[styles.panel, style]}>
      {(titulo || accion) && (
        <View style={styles.panelHeader}>
          {titulo && <Text style={styles.panelTitle}>{titulo}</Text>}
          {accion}
        </View>
      )}
      {children}
    </View>
  );
}

export function TarjetaEstadistica({ etiqueta, valor, descripcion }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{etiqueta}</Text>
      <Text style={styles.statValue}>{valor}</Text>
      <Text style={styles.statCaption}>{descripcion}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colores.background,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 18,

    paddingBottom: 48,
  },
  logoWrap: {
    alignItems: 'center',
  },
  logoImage: {
    width: 200,
    height: 46,
  },
  logoImageCompact: {
    width: 123,
    height: 30,
  },
  logoSub: {
    marginTop: 2,
    color: colores.muted,
    fontSize: 12,
    letterSpacing: 0,
  },
  primaryButton: {
    backgroundColor: colores.terracottaDark,
    borderRadius: 7,
    minHeight: 42,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    shadowColor: colores.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  primaryButtonText: {
    color: '#FFF9EF',
    fontWeight: '700',
    fontSize: 14,
  },
  ghostButton: {
    borderRadius: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  ghostButtonActive: {
    backgroundColor: colores.terracottaDark,
  },
  ghostButtonText: {
    color: colores.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  ghostButtonTextActive: {
    color: colores.surface,
  },
  fieldWrap: {
    gap: 6,
    marginBottom: 16,
  },
  fieldLabel: {
    color: colores.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    flex: 1,
    height: 41,
    color: colores.ink,
    fontSize: 14,
    padding: 0,

    minWidth: 0,
  },
  inputShell: {
    backgroundColor: colores.white,
    borderWidth: 1,
    borderColor: '#D8C7BB',
    borderRadius: 5,
    height: 41,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  inputIcon: {
    opacity: 0.78,
  },
  inputRightIcon: {
    opacity: 0.82,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  overline: {
    color: colores.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  topTitle: {
    color: colores.ink,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 2,
  },
  panel: {
    backgroundColor: colores.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colores.line,
    padding: 14,
    marginBottom: 14,
    shadowColor: colores.terracottaDark,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  panelTitle: {
    color: colores.ink,
    fontWeight: '800',
    fontSize: 15,
  },
  statCard: {
    flex: 1,
    minWidth: 130,
    backgroundColor: colores.surface,
    borderWidth: 1,
    borderColor: colores.line,
    borderRadius: 8,
    padding: 12,
  },
  statLabel: {
    color: colores.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  statValue: {
    color: colores.terracottaDark,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  statCaption: {
    color: colores.olive,
    fontSize: 11,
    marginTop: 4,
    fontWeight: '700',
  },
  phoneSafe: {
    flex: 1,
    backgroundColor: colores.background,
    alignItems: 'center',
  },
  phone: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
    backgroundColor: colores.background,
    overflow: 'hidden',
  },

  headerBar: {
    height: 44,
    backgroundColor: colores.terracotta,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  roleContent: {
    flex: 1,
  },
  roleScroll: {
    paddingHorizontal: 20,
    paddingTop: 28,

    paddingBottom: 48,
  },

  roleNav: {
    backgroundColor: colores.terracotta,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: RELLENO_BARRA,
    gap: 4,
  },
  roleNavItem: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  roleNavActive: {
    backgroundColor: 'rgba(255, 249, 239, 0.24)',
  },
  roleNavLabel: {
    color: colores.surface,
    fontSize: 10,
    marginTop: 2,
  },
  backTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  backCircle: {
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.white,
    shadowColor: colores.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  roleTitle: {
    color: colores.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  roleButton: {
    minHeight: 58,
    borderRadius: 9,
    backgroundColor: colores.terracottaDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
    shadowColor: colores.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  roleButtonOutline: {
    backgroundColor: colores.white,
    borderWidth: 1,
    borderColor: colores.line,
  },
  roleButtonText: {
    color: colores.surface,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  roleButtonTextOutline: {
    color: colores.ink,
  },
  searchBox: {
    height: 35,
    borderWidth: 1,
    borderColor: colores.ink,
    borderRadius: 18,
    backgroundColor: colores.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 22,
    shadowColor: colores.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    color: colores.ink,
    fontSize: 12,
    padding: 0,
  },
  searchIcon: {
    color: colores.ink,
    fontSize: 18,
  },
  statusPill: {
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: '#B7B7B7',
  },
  statusDanger: {
    borderWidth: 1,
    borderColor: colores.danger,
    backgroundColor: '#FFF1ED',
  },
  statusReady: {
    backgroundColor: colores.ready,
  },
  statusPay: {
    backgroundColor: '#FFB15E',
  },
  statusPillText: {
    color: colores.ink,
    fontSize: 9,
    fontWeight: '900',
  },
  miniDivider: {
    height: 1,
    backgroundColor: colores.ink,
    opacity: 0.7,
    marginVertical: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  cancelButton: {
    flex: 1,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colores.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: colores.ink,
    fontSize: 10,
    fontWeight: '900',
  },
  confirmButton: {
    flex: 1,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#8F6651',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: colores.surface,
    fontSize: 10,
    fontWeight: '900',
  },

  productPhoto: {
    overflow: 'hidden',
    backgroundColor: colores.white,
  },
  dlgFondo: {
    flex: 1,
    backgroundColor: 'rgba(30, 18, 12, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dlgCaja: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colores.white,
    borderRadius: 18,
    padding: 22,
  },
  dlgTitulo: { color: colores.ink, fontSize: 18, fontWeight: '900' },
  dlgTexto: { color: colores.muted, fontSize: 12, marginTop: 4, marginBottom: 16 },
  dlgEtiqueta: { color: colores.ink, fontSize: 11, fontWeight: '900', marginBottom: 6 },
  dlgCampo: {
    borderWidth: 1,
    borderColor: colores.line,
    borderRadius: 8,
    color: colores.ink,
    fontSize: 14,
    minHeight: 64,
    padding: 10,
    textAlignVertical: 'top',
  },
  dlgError: { color: '#B3261E', fontSize: 11, marginTop: 6 },
  dlgCasilla: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, marginTop: 16 },
  dlgMarca: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 2,
    borderColor: colores.terracotta, alignItems: 'center', justifyContent: 'center',
  },
  dlgMarcaActiva: { backgroundColor: colores.terracotta },
  dlgMarcaTexto: { color: colores.white, fontSize: 13, fontWeight: '900' },
  dlgCasillaTexto: { color: colores.ink, flex: 1, fontSize: 13, fontWeight: '700' },
  dlgCasillaNota: { color: colores.muted, fontSize: 11, fontWeight: '400' },
  dlgAcciones: { flexDirection: 'row', gap: 10, marginTop: 22 },
  dlgVolver: {
    flex: 1, height: 42, borderRadius: 21, borderWidth: 1,
    borderColor: colores.muted, alignItems: 'center', justifyContent: 'center',
  },
  dlgVolverTexto: { color: colores.muted, fontSize: 11, fontWeight: '900' },
  dlgConfirmar: {
    flex: 2, height: 42, borderRadius: 21, backgroundColor: '#B3261E',
    alignItems: 'center', justifyContent: 'center',
  },
  dlgConfirmarInactivo: { opacity: 0.6 },
  dlgConfirmarTexto: { color: colores.white, fontSize: 11, fontWeight: '900' },
  productImage: {
    width: 42,
    height: 45,
    borderRadius: 7,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colores.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  productBag: {
    backgroundColor: 'transparent',
  },
  iconSlot: {
    color: colores.ink,
    fontWeight: '900',
    textAlign: 'center',
  },
  iconLight: {
    color: colores.surface,
  },
  iconBrand: {
    color: colores.terracotta,
  },
  iconImage: {
    tintColor: undefined,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#FBE3E4',
    borderLeftWidth: 4,
    borderLeftColor: colores.danger,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderRadius: 6,
  },
  noticeInfo: {
    backgroundColor: '#FDF0DC',
    borderLeftColor: colores.warning,
  },
  noticeText: {
    flex: 1,
    color: colores.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  noticeAction: {
    color: colores.terracottaDark,
    fontSize: 10,
    fontWeight: '900',
  },
  emptyState: {
    backgroundColor: '#FFFDF8',
    borderRadius: 10,
    padding: 26,
    alignItems: 'center',
    marginTop: 8,
  },
  emptyStateTitle: {
    color: colores.ink,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyStateText: {
    color: colores.muted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loaderText: {
    color: colores.muted,
    fontSize: 11,
    fontWeight: '700',
  },
});
