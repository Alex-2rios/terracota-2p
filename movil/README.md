# App móvil de Terracota

Aplicación Expo (React Native) para los módulos **Mesero, Cocina y Caja**.
Consume la API a través de `services/api.js`; nunca toca PostgreSQL.

## Arrancar

```bash
npm install
npm start
```

Escanea el QR con **Expo Go**. La computadora y el teléfono deben estar en la
misma red Wi-Fi.

### Apuntar a la API

Dos formas, la que prefieras:

1. **Desde la app** — en la pantalla de login, botón **Configurar servidor**.
   Escribe `http://TU_IP:8080/api/v1`, guarda y pulsa *Probar*. Ideal cuando
   cambias de red y no quieres reiniciar Expo.

2. **Con un archivo** — copia `.env.example` a `.env.local`:

   ```env
   EXPO_PUBLIC_API_URL=http://192.168.1.20:8080/api/v1
   ```

   Hay que reiniciar `npm start` para que Expo tome el cambio.

| Entorno | Dirección |
|---|---|
| Teléfono físico | `http://IP_DE_LA_LAPTOP:8080/api/v1` |
| Emulador Android | `http://10.0.2.2:8080/api/v1` |
| Simulador iOS | `http://127.0.0.1:8080/api/v1` |

> En un teléfono físico `127.0.0.1` apunta al propio teléfono, no a la
> computadora. Si aun con la IP correcta no conecta, revisa el Firewall de
> Windows (puerto 8080) o usa `npm run tunnel`.

## Qué hace cada rol

**Mesero** — elige mesa (las ocupadas se marcan en rojo), arma el pedido con
observaciones por producto, revisa el resumen con IVA, sigue el estado y marca
entregado cuando cocina lo deja listo. Las cantidades se topan al stock real.

**Cocina** — tablero por etapas (Pendientes / En preparación / Listos), avanza
cada pedido y consulta el inventario, donde puede ajustar existencias tocando
la cantidad.

**Caja** — cobra en efectivo, tarjeta o transferencia, calcula el cambio,
emite el ticket, lo comparte en **PDF**, y consulta el corte del día y el
historial de tickets.

## Cómo está armado

```
index.js → App.js → screens/PantallaMenu.js   (contenedor: sesión y datos)
                     ├── PantallaAutenticacion
                     ├── PantallaInicioRol
                     ├── PantallaMesero
                     ├── PantallaCocina
                     └── PantallaCaja
```

`PantallaMenu` mantiene la sesión, los datos del rol activo y la pantalla
visible; el resto son componentes de presentación que reciben todo por props.
La navegación es un `switch` sobre el estado, sin librería de routing.

Los datos se refrescan solos cada 12 segundos y también deslizando hacia abajo
(*pull to refresh*). Si la API falla, aparece una banda de aviso con botón de
reintento en lugar de romperse; si el token caduca, la app cierra la sesión y
regresa al login.

## Verificar antes de presentar

```bash
node verificar-sintaxis.js
```

Revisa que los 12 archivos JS de la app se parsean sin errores.
