import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import {
  BotonPrincipal,
  CampoTexto,
  ContenedorPantalla,
  Logo,
  MensajeAviso,
  colores,
} from '../components/TerracotaUI';
import { avisar } from '../components/Avisos';
import { roles } from '../components/terracotaData';
import { comprobarServidor, getApiUrl, setApiUrl } from '../services/api';

export default function PantallaAutenticacion({ rol, alCambiarRol, alEntrar }) {
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const [ajustesVisibles, setAjustesVisibles] = useState(false);
  const [urlServidor, setUrlServidor] = useState(getApiUrl());
  const [estadoServidor, setEstadoServidor] = useState(null);

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

  const guardarServidor = async () => {
    try {
      const nueva = setApiUrl(urlServidor);
      setUrlServidor(nueva);
      setEstadoServidor('Probando conexión...');
      await comprobarServidor();
      setEstadoServidor('Conectado correctamente.');
      setError(null);
    } catch (fallo) {
      setEstadoServidor(fallo.message);
    }
  };

  const probarConexion = async () => {
    setEstadoServidor('Probando conexión...');
    try {
      await comprobarServidor();
      setEstadoServidor('Conectado correctamente.');
    } catch (fallo) {
      setEstadoServidor(fallo.message);
      avisar.error('Sin conexión', fallo.message);
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
            placeholder="mesero"
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

          <TouchableOpacity
            style={styles.settingsToggle}
            onPress={() => setAjustesVisibles(!ajustesVisibles)}
            activeOpacity={0.7}>
            <Text style={styles.settingsToggleText}>
              {ajustesVisibles ? 'Ocultar configuración del servidor' : 'Configurar servidor'}
            </Text>
          </TouchableOpacity>

          {ajustesVisibles && (
            <View style={styles.settingsBox}>
              <Text style={styles.settingsLabel}>Dirección de la API</Text>
              <TextInput
                style={styles.settingsInput}
                value={urlServidor}
                onChangeText={setUrlServidor}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="http://192.168.1.20:8080/api/v1"
                placeholderTextColor="#B89D8C"
              />
              <Text style={styles.settingsHelp}>
                En un teléfono físico usa la IP de la computadora en la misma red Wi-Fi,
                nunca 127.0.0.1.
              </Text>
              <View style={styles.settingsActions}>
                <TouchableOpacity style={styles.settingsButton} onPress={guardarServidor} activeOpacity={0.8}>
                  <Text style={styles.settingsButtonText}>GUARDAR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingsButtonGhost} onPress={probarConexion} activeOpacity={0.8}>
                  <Text style={styles.settingsButtonGhostText}>PROBAR</Text>
                </TouchableOpacity>
              </View>
              {estadoServidor ? <Text style={styles.settingsStatus}>{estadoServidor}</Text> : null}
            </View>
          )}

          <Text style={styles.helper}>Módulos disponibles: Mesero · Caja · Cocina</Text>
          <Text style={styles.helperSmall}>Servidor: {getApiUrl()}</Text>
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
  settingsToggle: { alignSelf: 'center', paddingVertical: 14 },
  settingsToggleText: {
    color: colores.terracotta,
    fontSize: 11,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
  settingsBox: {
    backgroundColor: '#FFFDF8',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: colores.line,
  },
  settingsLabel: {
    color: colores.ink,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 8,
  },
  settingsInput: {
    height: 40,
    borderWidth: 1,
    borderColor: colores.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    color: colores.ink,
    fontSize: 12,
    backgroundColor: colores.surface,
  },
  settingsHelp: {
    color: colores.muted,
    fontSize: 10,
    marginTop: 8,
    lineHeight: 14,
  },
  settingsActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  settingsButton: {
    flex: 1,
    height: 34,
    borderRadius: 17,
    backgroundColor: colores.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonText: { color: colores.surface, fontSize: 10, fontWeight: '900' },
  settingsButtonGhost: {
    flex: 1,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colores.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonGhostText: { color: colores.terracotta, fontSize: 10, fontWeight: '900' },
  settingsStatus: {
    color: colores.ink,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 10,
  },
  helper: {
    color: colores.terracotta,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 34,
  },
  helperSmall: {
    color: colores.muted,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 6,
  },
});
