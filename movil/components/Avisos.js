import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colores } from './TerracotaUI';

let publicar = null;
const pendientes = [];

function emitir(aviso) {
  if (publicar) {
    publicar(aviso);
  } else {

    pendientes.push(aviso);
  }
}

export const avisar = {
  exito: (titulo, mensaje) => emitir({ tono: 'exito', titulo, mensaje }),
  error: (titulo, mensaje) => emitir({ tono: 'error', titulo, mensaje }),
  info: (titulo, mensaje) => emitir({ tono: 'info', titulo, mensaje }),

  confirmar: ({ titulo, mensaje, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', alConfirmar }) =>
    emitir({ tono: 'info', titulo, mensaje, textoConfirmar, textoCancelar, alConfirmar }),
};

const TONOS = {
  exito: { simbolo: '✓', color: '#1E8B3A', fondo: '#E4F5E8' },
  error: { simbolo: '!', color: '#B3261E', fondo: '#FBE3E4' },
  info: { simbolo: 'i', color: colores.terracottaDark, fondo: '#F7E9DE' },
};

export function CentroDeAvisos() {
  const [aviso, setAviso] = useState(null);
  const cola = useRef([]);

  const siguiente = useCallback(() => {
    setAviso(cola.current.shift() || null);
  }, []);

  useEffect(() => {
    publicar = (nuevo) => {
      setAviso((actual) => {
        if (actual) {
          cola.current.push(nuevo);
          return actual;
        }
        return nuevo;
      });
    };

    while (pendientes.length) publicar(pendientes.shift());

    return () => {
      publicar = null;
    };
  }, []);

  if (!aviso) return null;

  const estilo = TONOS[aviso.tono] || TONOS.info;
  const esConfirmacion = typeof aviso.alConfirmar === 'function';

  const cerrar = () => siguiente();

  const aceptar = () => {
    const accion = aviso.alConfirmar;
    siguiente();
    if (accion) accion();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={cerrar} statusBarTranslucent>
      <Pressable style={styles.fondo} onPress={esConfirmacion ? undefined : cerrar}>
        <Pressable style={styles.tarjeta} onPress={() => {}}>
          <View style={[styles.icono, { backgroundColor: estilo.fondo }]}>
            <Text style={[styles.iconoTexto, { color: estilo.color }]}>{estilo.simbolo}</Text>
          </View>

          <Text style={styles.titulo}>{aviso.titulo}</Text>
          {aviso.mensaje ? <Text style={styles.mensaje}>{aviso.mensaje}</Text> : null}

          <View style={styles.acciones}>
            {esConfirmacion && (
              <Pressable
                style={({ pressed }) => [styles.boton, styles.botonFantasma, pressed && styles.presionado]}
                onPress={cerrar}
                accessibilityRole="button">
                <Text style={styles.botonFantasmaTexto}>{aviso.textoCancelar}</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.boton,
                { backgroundColor: estilo.color },
                esConfirmacion && styles.botonMitad,
                pressed && styles.presionado,
              ]}
              onPress={aceptar}
              accessibilityRole="button">
              <Text style={styles.botonTexto}>
                {esConfirmacion ? aviso.textoConfirmar : 'Entendido'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(35, 20, 12, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  tarjeta: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colores.white,
    borderRadius: 18,
    paddingVertical: 26,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: colores.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  icono: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconoTexto: {
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
  },
  titulo: {
    color: colores.ink,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  mensaje: {
    color: colores.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 10,
  },
  acciones: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
    width: '100%',
  },
  boton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonMitad: { flex: 1 },
  botonFantasma: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colores.line,
  },
  botonTexto: {
    color: colores.white,
    fontSize: 13,
    fontWeight: '900',
  },
  botonFantasmaTexto: {
    color: colores.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  presionado: { opacity: 0.75 },
});
