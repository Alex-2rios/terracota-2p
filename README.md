# Terracota · Entrega 2º parcial

Punto de venta para una cafetería. Hay una sola API y dos clientes que la
consumen: una app móvil y un panel web. Ninguno de los dos toca la base de
datos directamente.

```
   App móvil (Expo)  ─┐
                      ├─► API REST (FastAPI + JWT) ─► PostgreSQL
   Panel web (Flask) ─┘
```

| Capa | Tecnología | Carpeta | Puerto |
|---|---|---|---|
| Base de datos | PostgreSQL 16 | `database/` | 5433 |
| API | FastAPI, JWT, psycopg3 | `api/` | 8080 |
| Panel web (Administrador) | Flask, Jinja | `web/` | 5000 |
| App móvil (Mesero, Cocina, Caja) | Expo 54, React Native | `movil/` | 5001 |

Las credenciales están en [CREDENCIALES.md](CREDENCIALES.md).

---

## 1. Levantar todo

Con Docker encendido, desde esta carpeta:

```bash
docker compose up -d --build
```

Eso arranca PostgreSQL, aplica el esquema, crea los usuarios de demostración y
levanta la API, el panel y la app. Para ver que respondió:

```bash
curl http://localhost:8080/health
```

| Qué | Dónde |
|---|---|
| Panel web | http://localhost:5000 |
| App móvil | http://localhost:5001 |
| Documentación de la API | http://localhost:8080/docs |
| Base de datos | `localhost:5433`, base `terracota` |

`docker compose down` detiene todo sin perder datos. `docker compose down -v`
borra también la base y empieza de cero.

Si quieres cambiar puertos o contraseñas, copia `.env.example` a `.env`. Si no
existe, se usan los valores de desarrollo de `docker-compose.yml`.

---

## 2. La app en el teléfono

La app no pregunta por ningún servidor, ya lo trae dentro. Quien la usa sólo
escribe usuario y contraseña.

### Instalar el APK

Se baja del mismo servidor que sirve la aplicación web:

```
https://<host>:10000/terracota.apk
```

Esa dirección es un enlace a la última versión compilada, así que no cambia
entre actualizaciones y el mismo QR sigue funcionando. Android va a pedir
permiso para instalar de un origen desconocido; hay que dárselo una vez.

### Compilar el APK

```bash
cd movil && ./construir-apk.sh
```

No hay que instalar Java ni el SDK de Android. Están en una imagen de Docker que
el script arma la primera vez. El APK sale firmado en `descargas/` y publicado
en la dirección de arriba.

Cuidado con `movil/terracota-release.jks` y `movil/firma.properties`. No se
versionan y no se pueden volver a generar: Android exige firmar cada
actualización con la misma clave. Si se pierden, ya no se puede publicar una
actualización de esta app. Conviene tener una copia fuera del servidor.

### En desarrollo

Para apuntar a otro servidor sin recompilar:

```bash
cd movil
EXPO_PUBLIC_API_URL=http://TU_IP:8080/api/v1 npm start
```

En un teléfono físico `127.0.0.1` no sirve, porque apunta al propio teléfono.
Hay que usar la IP de la computadora en la red Wi-Fi.

---

## 3. Sin Docker (opcional)

<details>
<summary>Instalación manual paso a paso</summary>

**Base de datos**, con PostgreSQL 14 o superior:

```bash
psql -U postgres -f database/00_CREAR_BASE.sql
psql -U postgres -d terracota -f database/terracota_postgresql.sql
psql -U postgres -d terracota -v api_password='TerracotaLocal123!' -f database/02_PERMISOS_API.sql
```

**API:**

```bash
cd api
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

**Panel web:**

```bash
cd web
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python app.py
```

</details>

---

## 4. Cómo fluye un pedido

```
MESERO           COCINA                     MESERO      CAJA
selecciona  ──►  PENDIENTE ──► PREPARANDO ──► LISTO ──► ENTREGADO ──► PAGADO
mesa y crea                                                           + ticket
el pedido
```

- Al crear el pedido se descuenta el stock de cada producto.
- Una mesa no puede tener dos pedidos activos a la vez.
- Sólo se cobra un pedido ENTREGADO, y sólo una vez.
- Al cancelar, el stock regresa al inventario.
- Cada cambio de estado queda en el historial del pedido.

Las transiciones inválidas las bloquea PostgreSQL con un trigger, no la
interfaz, así que da igual desde dónde se intenten.

---

## 5. Qué hace cada módulo

### App móvil

| Rol | Puede hacer |
|---|---|
| Mesero | Ver mesas libres y ocupadas, crear pedidos con observaciones, seguir su estado, marcar entregados |
| Cocina | Ver pedidos por etapa, avanzarlos a Preparando y Listo, consultar y ajustar existencias |
| Caja | Cobrar en efectivo, tarjeta o transferencia, calcular cambio, emitir tickets, compartirlos en PDF y ver el corte del día |

Los tres pueden cancelar pedidos, sin tener que esperar a un administrador.

### Cancelar un pedido

Cuanto más avanzado está el pedido, menos gente puede cancelarlo:

| Estado | Quién puede cancelar |
|---|---|
| Pendiente | Mesero (sólo los suyos), cocina, caja, administrador |
| Preparando | Cocina, caja, administrador |
| Listo y Entregado | Caja, administrador |
| Pagado | Nadie |

Siempre hay que escribir un motivo y decir si el cliente sigue en la mesa. Eso
último decide qué pasa con la mesa: si el cliente sigue ahí, la mesa no se
libera y queda marcada para volver a tomarle la orden, porque el cliente no fue
quien canceló. Si ya se retiró, la mesa queda libre.

Al mesero del pedido le llega un aviso con el motivo, pero nunca a media
captura. Si está levantando otro pedido, el aviso espera a que termine.

### Panel web (Administrador)

Estadísticas con gráficas, gestión de pedidos con detalle e historial,
usuarios (alta, edición, roles múltiples, baja y reactivación), inventario
(alta, edición, baja lógica, alertas de stock), gastos y reportes.

### Reportes

Se puede reportar todo lo que el sistema registra, tanto de la app móvil como
del panel. Cada uno se ve en pantalla y se descarga en PDF y XLSX:

| Reporte | Qué contiene |
|---|---|
| Ventas | Resumen del periodo, ventas por día, por método de pago y detalle de transacciones |
| Pedidos | Pedidos por estado, productividad por mesero, tiempos de entrega y renglones de cada pedido |
| Productos | Catálogo del menú, ranking de más vendidos, desempeño por categoría y productos sin ventas |
| Inventario | Existencias, alertas de reposición, valor del inventario y consumo del periodo |
| Tickets y cobros | Corte de caja, cobros por cajero y detalle de cada ticket |
| Gastos | Balance de ingresos contra egresos, por día y detalle de cada movimiento |
| Usuarios | Personal por rol, actividad en el periodo y agrupación por estado |
| Mesas | Estado actual y uso en el periodo (pedidos, importe, ticket promedio) |
| Auditoría | Historial de estados de los pedidos y bitácora de cambios del sistema |

Los filtros cambian según el reporte: fechas, categoría, estado, mesa, mesero,
cajero, método de pago o rol. La lista de reportes la publica la API en
`/administracion/reportes/opciones`, así que el panel se arma solo y agregar un
reporte en el backend lo hace aparecer sin tocar el frontend.

---

## 6. Pruebas

Con el stack levantado, esto comprueba de una pasada que los servicios
responden, que cada credencial funciona, que el flujo completo corre y que los
nueve reportes se generan en los dos formatos:

```bash
web\.venv\Scripts\python.exe scripts\verificar_entrega.py
```

Pruebas unitarias de la API y revisión de estilo:

```bash
cd api
pip install -r requirements-dev.txt
pytest
ruff check app tests
```

Sintaxis de la app móvil:

```bash
cd movil
node verificar-sintaxis.js
```

`docker-compose.prueba.yml` levanta un stack aislado en otros puertos (web
`5010`, API `8090`, base `5443`) para probar sobre una base recién creada sin
tocar los datos con los que estás trabajando. Las instrucciones están dentro del
archivo.

Para probar la API a mano está <http://localhost:8080/docs>. Con el botón
Authorize te autenticas con cualquier usuario y puedes lanzar cualquier endpoint
desde el navegador.

Y para ver que la base responde y el flujo completo funciona:

```bash
docker compose run --rm --entrypoint sh database-init -c "psql -h database -U postgres -d terracota -f /scripts/PRUEBA_FLUJO.sql"
```

---

## 7. Estructura

```
Terracota/
├── docker-compose.yml     Levanta base + API + web + móvil
├── .env.example           Puertos y contraseñas
├── CREDENCIALES.md        Tarjeta de credenciales
├── scripts/               Verificador de entrega
├── database/              Esquema, permisos y prueba de flujo (SQL)
├── api/                   FastAPI: la única capa que toca PostgreSQL
│   ├── app/routers/       auth, catalogos, mesero, cocina, caja,
│   │                      inventario, administracion
│   ├── app/reportes.py    Los nueve reportes del sistema
│   └── tests/             Pruebas unitarias
├── web/                   Flask: consume la API con api_client.py
│   ├── templates/         Vistas Jinja
│   └── static/            CSS y JS propios, sin CDN, funciona sin internet
└── movil/                 Expo: consume la API con services/api.js
    ├── screens/           Una pantalla por rol
    └── components/        Componentes e iconografía compartidos
```

## 8. Seguridad

- Contraseñas con bcrypt (`pgcrypto`), nunca en texto plano.
- Sesiones con JWT firmado. El token lleva los roles reales de la base.
- La API entra a PostgreSQL con el rol `terracota_app`, no con `postgres`.
- El panel protege todos los formularios con token CSRF.
- El modo depuración de Flask está apagado y en Docker corre con gunicorn.
- Límite de intentos de inicio de sesión para frenar fuerza bruta.
- Los secretos viven en `.env`, no en el código.

Antes de un despliegue real hay que cambiar `JWT_SECRET`, `WEB_SECRET_KEY`,
`API_DB_PASSWORD` y `POSTGRES_PASSWORD`, y servir todo por HTTPS.

### Cómo está publicado

Los cuatro contenedores escuchan sólo en `127.0.0.1`. El acceso desde fuera lo
da Tailscale Funnel, que además pone el HTTPS y el certificado:

| Puerto | Qué sirve |
|---|---|
| 443 | Panel web |
| 8443 | API |
| 10000 | App móvil y descarga del APK |

Atarlos al bucle local no es opcional: Docker publica sus puertos saltándose
`ufw`, así que si se dejan abiertos la base queda expuesta a toda la red.

Ojo con que las credenciales de demostración son públicas. Mientras el Funnel
esté encendido, cualquiera con el enlace entra como administrador. Para
apagarlo, `tailscale funnel reset`.
