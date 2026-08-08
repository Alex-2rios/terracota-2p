import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import { CentroDeAvisos } from './components/Avisos';
import PantallaMenu from './screens/PantallaMenu';

export default function App() {
  return (
    <View style={styles.container}>
      <PantallaMenu />
      {/* Se monta una sola vez: cualquier pantalla puede lanzar avisos con `avisar`. */}
      <CentroDeAvisos />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4EBDD',
  },
});
