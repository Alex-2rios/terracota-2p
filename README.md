# Terracota · Entrega 2º parcial

Sistema de punto de venta para una cafetería, con **arquitectura desacoplada**:
una sola API REST alimenta tanto la aplicación móvil como el panel web, y
ninguno de los dos clientes habla directamente con la base de datos.

```
   App móvil (Expo)  ─┐
                      ├─► API REST (FastAPI + JWT) ─► PostgreSQL
   Panel web (Flask) ─┘
```

| Capa | Tecnología | Carpeta | Puerto |
|---|---|---|---|
| Base de datos | PostgreSQL 16 | `database/` | 5433 |
| API | FastAPI · JWT · psycopg3 | `api/` | 8080 |
| Panel web (Administrador) | Flask · Jinja | `web/` | 5000 |
| App móvil (Mesero, Cocina, Caja) | Expo 54 · React Native | `movil/` | Expo Go |
| Pruebas de API | Colección Postman | `postman/` | — |

**Las credenciales están en [CREDENCIALES.md](CREDENCIALES.md).**

---

## 1. Levantar todo (Docker)

Requiere Docker Desktop encendido. Desde esta carpeta:

```bash
docker compose up -d --build
```

Eso arranca PostgreSQL, aplica el esquema, crea los usuarios de demostración y
levanta la API y el panel web. Comprobar que todo respondió:

```bash
curl http://localhost:8080/health
```

| Qué | Dónde |
|---|---|
| Panel web | http://localhost:5000 |
| Documentación interactiva de la API | http://localhost:8080/docs |
| Base de datos | `localhost:5433`, base `terracota` |

Para detener sin borrar datos: `docker compose down`.
Para empezar de cero (**borra la base**): `docker compose down -v`.

### Variables de entorno

Copia `.env.example` a `.env` si quieres cambiar puertos o contraseñas. Si no
existe, se usan los valores de desarrollo que trae `docker-compose.yml`.

---

## 2. Conectar el teléfono

1. La computadora y el teléfono deben estar en la **misma red Wi-Fi**.
2. Averigua la IP de la computadora: `ipconfig` → *Dirección IPv4*.
3. En `movil/`:

   ```bash
   npm install
   npm start
   ```

4. Escanea el QR con **Expo Go**.
5. En la pantalla de login toca **Configurar servidor** y escribe:

   ```
   http://TU_IP:8080/api/v1
   ```

   (o déjalo fijo copiando `movil/.env.example` a `movil/.env.local`).

> En un teléfono físico `127.0.0.1` **no funciona**: esa dirección apunta al
> propio teléfono. Si Windows bloquea la conexión, permite el puerto 8080 en el
> Firewall o usa `npm run tunnel`.

---

## 3. Sin Docker (opcional)

<details>
<summary>Instalación manual paso a paso</summary>

**Base de datos** — con PostgreSQL 14+ instalado:

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

## 4. Flujo completo del negocio

```
MESERO           COCINA                     MESERO      CAJA
selecciona  ──►  PENDIENTE ──► PREPARANDO ──► LISTO ──► ENTREGADO ──► PAGADO
mesa y crea                                                           + ticket
el pedido
```

- Al **crear** el pedido se descuenta el stock de cada producto.
- Una mesa no puede tener dos pedidos activos al mismo tiempo.
- Sólo se cobra un pedido **ENTREGADO**, y sólo una vez.
- Al **cancelar** desde el panel web, el stock regresa al inventario.
- Cada cambio de estado queda registrado en el historial del pedido.

Las transiciones inválidas las bloquea PostgreSQL con un *trigger*, no la
interfaz: da igual desde dónde se intente.

---

## 5. Qué hace cada módulo

### App móvil

| Rol | Puede hacer |
|---|---|
| **Mesero** | Ver mesas libres/ocupadas, crear pedidos con observaciones, seguir su estado, marcar entregados |
| **Cocina** | Ver pedidos por etapa, avanzarlos a Preparando/Listo, consultar y ajustar existencias |
| **Caja** | Cobrar (efectivo/tarjeta/transferencia), calcular cambio, emitir tickets, compartirlos en PDF, ver el corte del día |

### Panel web (Administrador)

Estadísticas con gráficas · Gestión de pedidos con detalle e historial y
cancelación · Usuarios (alta, edición, roles múltiples, baja y reactivación) ·
Inventario (alta, edición, baja lógica, alertas de stock) · Gastos ·
Reportes de ventas, usuarios e inventario exportables a **PDF y XLSX**.

---

## 6. Pruebas

```bash
cd api
pip install -r requirements-dev.txt
pytest
ruff check app tests
```

```bash
cd movil
node verificar-sintaxis.js
```

**Postman:** importa `postman/Terracota.postman_collection.json` y
`postman/Terracota.postman_environment.json`, selecciona el entorno
*Terracota local* y ejecuta la colección **en orden** (`Run collection`).
Recorre el flujo completo guardando tokens e identificadores automáticamente.

---

## 7. Estructura

```
Terracota/
├── docker-compose.yml     Levanta base + API + web
├── .env.example           Puertos y contraseñas
├── CREDENCIALES.md        Tarjeta de credenciales
├── database/              Esquema, permisos y prueba de flujo (SQL)
├── api/                   FastAPI: la única capa que toca PostgreSQL
│   ├── app/routers/       auth · catalogos · mesero · cocina · caja
│   │                      inventario · administracion
│   └── tests/             Pruebas unitarias
├── web/                   Flask: consume la API con `api_client.py`
│   ├── templates/         Vistas Jinja
│   └── static/            CSS y JS propios (sin CDN: funciona sin internet)
├── movil/                 Expo: consume la API con `services/api.js`
│   ├── screens/           Una pantalla por rol
│   └── components/        Componentes e iconografía compartidos
└── postman/               Colección de pruebas de la API
```

## 8. Notas de seguridad

- Contraseñas con **bcrypt** (`pgcrypto`), nunca en texto plano.
- Sesiones con **JWT** firmado; el token lleva los roles reales de la base.
- La API entra a PostgreSQL con el rol `terracota_app`, **no** con `postgres`.
- El panel web protege todos los formularios con **token CSRF**.
- El modo depuración de Flask está apagado; en Docker corre con **gunicorn**.
- Límite de intentos de inicio de sesión para frenar fuerza bruta.
- Los secretos viven en `.env`, no en el código.

Antes de un despliegue real: cambia `JWT_SECRET`, `WEB_SECRET_KEY`,
`API_DB_PASSWORD` y `POSTGRES_PASSWORD`, y sirve todo por HTTPS.
