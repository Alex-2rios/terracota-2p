import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  BotonPrincipal,
  CampoTexto,
  ContenedorPantalla,
  Logo,
  MensajeAviso,
  colores,
} from '../components/TerracotaUI';
import { roles } from '../components/terracotaData';

export default function PantallaAutenticacion({ rol, alCambiarRol, alEntrar }) {
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const ingresar = async () => {
    if (!usuario.trim() || !contrasena) {
      setError('Escribe tu usuario y tu contraseña.');
      return;
    }

    setError(null);
    setCargando(true);
    try {
      await alEntrar(usuario, contrasena, rol);
    } catch (fallo) {
      setError(fallo.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <ContenedorPantalla scroll>
      <View style={styles.page}>
        <View style={styles.brandBlock}>
          <Logo />
          <View style={styles.logoLine} />
        </View>

        <View style={styles.card}>
          <Text style={styles.instructions}>Ingresa tu usuario y contraseña</Text>

          <MensajeAviso texto={error} />

          <CampoTexto
            etiqueta="Usuario"
            placeholder="Usuario"
            value={usuario}
            onChangeText={setUsuario}
            icono="usuario"
          />
          <CampoTexto
            etiqueta="Contraseña"
            placeholder="Contraseña"
            secureTextEntry={!mostrarContrasena}
            icono="candado"
            iconoDerecho="ojo"
            value={contrasena}
            onChangeText={setContrasena}
            alPresionarDerecha={() => setMostrarContrasena(!mostrarContrasena)}
          />

          <Text style={styles.roleCaption}>Selecciona el módulo al que vas a entrar</Text>
          <View style={styles.roleSelector}>
            {roles.map((item) => (
              <TouchableOpacity
                key={item.clave}
                style={[styles.roleChip, rol === item.clave && styles.roleChipActive]}
                onPress={() => alCambiarRol(item.clave)}
                accessibilityRole="button"
                accessibilityState={{ selected: rol === item.clave }}
                activeOpacity={0.8}>
                <Text style={[styles.roleChipText, rol === item.clave && styles.roleChipTextActive]}>
                  {item.etiqueta}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <BotonPrincipal
            titulo={cargando ? 'Ingresando...' : 'Iniciar sesión'}
            onPress={cargando ? undefined : ingresar}
            style={styles.submit}
            icono="ingresar"
          />

          <Text style={styles.helper}>Módulos disponibles: Mesero · Caja · Cocina</Text>
        </View>
      </View>
    </ContenedorPantalla>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 34,
    paddingTop: 76,
    paddingBottom: 40,
    backgroundColor: colores.background,
  },
  brandBlock: { marginBottom: 34 },
  logoLine: {
    height: 1,
    backgroundColor: colores.ink,
    opacity: 0.72,
    marginTop: 18,
    marginHorizontal: 4,
  },
  card: { backgroundColor: 'transparent', paddingHorizontal: 8 },
  instructions: {
    color: colores.muted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 22,
  },
  roleCaption: {
    color: colores.muted,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  roleSelector: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  roleChip: {
    flex: 1,
    height: 34,
    borderWidth: 1,
    borderColor: '#D8C7BB',
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFDF8',
  },
  roleChipActive: {
    backgroundColor: colores.terracottaDark,
    borderColor: colores.terracottaDark,
  },
  roleChipText: { color: colores.muted, fontSize: 11, fontWeight: '900' },
  roleChipTextActive: { color: colores.surface },
  submit: { marginTop: 4 },
  helper: {
    color: colores.terracotta,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 34,
  },
});
