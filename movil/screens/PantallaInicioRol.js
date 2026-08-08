import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  BarraSuperior,
  BotonRol,
  Contenido,
  Icono,
  MarcoTelefono,
  MensajeAviso,
  colores,
} from '../components/TerracotaUI';
import { inicioPorRol, navegacionPorRol } from '../components/terracotaData';

export default function PantallaInicioRol({
  rol,
  nombre,
  estadisticas,
  alNavegar,
  alCerrarSesion,
  cargando,
  aviso,
  alRefrescar,
}) {
  const inicio = inicioPorRol[rol];

  return (
    <MarcoTelefono
      elementosNavegacion={navegacionPorRol[rol]}
      activo="inicio"
      alNavegar={alNavegar}>
      <BarraSuperior alCerrarSesion={alCerrarSesion} />
      <Contenido alRefrescar={alRefrescar} refrescando={cargando}>
        <MensajeAviso texto={aviso} alReintentar={alRefrescar} />

        <View style={styles.hero}>
          <Text style={styles.title}>Bienvenido, {nombre}</Text>
          <Text style={styles.rolTexto}>{inicio.etiqueta}</Text>
        </View>

        {estadisticas?.length > 0 && (
          <View style={styles.statsRow}>
            {estadisticas.map((estadistica) => (
              <View key={estadistica.etiqueta} style={styles.statBox}>
                <Icono icono={estadistica.icono} tamaño={18} />
                <Text style={styles.statValue}>{estadistica.valor}</Text>
                <Text style={styles.statLabel}>{estadistica.etiqueta}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          {inicio.acciones.map((accion) => (
            <BotonRol
              key={accion.clave}
              icono={accion.icono}
              titulo={accion.titulo}
              variante={accion.contorno ? 'outline' : 'filled'}
              onPress={() => alNavegar(accion.clave)}
            />
          ))}
        </View>

        <Text style={styles.hint}>Desliza hacia abajo para actualizar</Text>
      </Contenido>
    </MarcoTelefono>
  );
}

const styles = StyleSheet.create({
  hero: { marginBottom: 36 },
  title: {
    color: colores.ink,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 12,
  },
  rolTexto: {
    color: colores.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 34,
  },
  statBox: {
    flex: 1,
    minHeight: 96,
    backgroundColor: '#FFFDF8',
    borderRadius: 12,
    padding: 14,
    shadowColor: colores.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  statValue: {
    color: colores.terracottaDark,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 6,
  },
  statLabel: {
    color: colores.ink,
    fontSize: 11,
    marginTop: 4,
  },
  actions: { marginTop: 4 },
  hint: {
    color: colores.muted,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 22,
  },
});
