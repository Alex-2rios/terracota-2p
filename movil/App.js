import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CentroDeAvisos } from './components/Avisos';
import PantallaMenu from './screens/PantallaMenu';

const DURACION_SPLASH_MS = 1500;
const ARRANQUE = Date.now();

SplashScreen.preventAutoHideAsync().catch(() => {

});

export default function App() {
  useEffect(() => {
    const restante = Math.max(0, DURACION_SPLASH_MS - (Date.now() - ARRANQUE));
    const temporizador = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, restante);

    return () => clearTimeout(temporizador);
  }, []);

  return (

    <SafeAreaProvider>
      <View style={styles.container}>
        <PantallaMenu />
        <CentroDeAvisos />
        <StatusBar style="dark" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4EBDD',
  },
});
