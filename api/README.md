# API REST de Terracota

FastAPI + JWT + PostgreSQL. Es la **única** capa que abre conexiones a la base
de datos: la app móvil y el panel web consumen exactamente estos endpoints.

Documentación interactiva: <http://localhost:8080/docs>

## Ejecutar

Lo normal es levantarla junto al resto con `docker compose up -d --build`
desde la carpeta raíz. Para correrla suelta:

```bash
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # y ajusta DATABASE_URL y JWT_SECRET
uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

## Endpoints

### Autenticación
| Método | Ruta | Quién |
|---|---|---|
| POST | `/api/v1/auth/token` | público |
| GET | `/api/v1/auth/me` | cualquier sesión |

### Catálogos — cualquier sesión
`GET /catalogos/mesas` · `GET /catalogos/productos` · `GET /catalogos/categorias`

### Mesero
| Método | Ruta |
|---|---|
| GET | `/mesero/pedidos` |
| POST | `/mesero/pedidos` |
| GET | `/mesero/pedidos/{id}` |
| PATCH | `/mesero/pedidos/{id}/entregar` |

### Cocina
| Método | Ruta |
|---|---|
| GET | `/cocina/pedidos` |
| PATCH | `/cocina/pedidos/{id}/estado` |
| GET | `/cocina/resumen` |

### Caja
| Método | Ruta |
|---|---|
| GET | `/caja/pedidos-pendientes` |
| POST | `/caja/pagos` |
| GET | `/caja/tickets` · `/caja/tickets/{id}` |
| GET | `/caja/ventas/hoy` |

### Inventario — cocina y administrador
| Método | Ruta |
|---|---|
| GET | `/inventario/productos` (filtros: `categoria`, `estado`, `buscar`) |
| POST | `/inventario/productos` |
| GET/PATCH/DELETE | `/inventario/productos/{id}` |
| PATCH | `/inventario/productos/{id}/suministro` |
| GET | `/inventario/alertas` |

### Administración — sólo administrador
| Método | Ruta |
|---|---|
| GET | `/administracion/roles` |
| GET/POST | `/administracion/usuarios` |
| GET/PATCH/DELETE | `/administracion/usuarios/{id}` |
| POST | `/administracion/usuarios/{id}/reactivar` |
| GET | `/administracion/pedidos` · `/administracion/pedidos/{id}` |
| POST | `/administracion/pedidos/{id}/cancelar` |
| GET/POST | `/administracion/gastos` · DELETE `/administracion/gastos/{id}` |
| GET | `/administracion/estadisticas/resumen` · `/estadisticas/dashboard` |
| GET | `/administracion/reportes?tipo=ventas\|usuarios\|inventario` |

## Cómo funcionan los permisos

El token JWT lleva `uid`, `sub` y los `roles` reales que tiene el usuario en la
base: un cliente no puede otorgarse permisos por su cuenta. `require_roles()`
comprueba el rol de cada módulo y **siempre** deja pasar a `administrador`, que
es el superusuario del sistema.

Además, las funciones PL/pgSQL vuelven a validar el rol antes de crear un
pedido o registrar un pago. Es una segunda barrera por si alguien llegara a la
base por otro camino.

## Códigos de error

Los errores de PostgreSQL se traducen a códigos HTTP con sentido, en lugar de
devolver siempre 400:

| SQLSTATE | HTTP | Caso típico |
|---|---|---|
| `23505` | 409 | La mesa ya tiene un pedido activo |
| `23514` | 422 | Stock insuficiente, monto incompleto |
| `42501` | 403 | El usuario no tiene el rol necesario |
| `P0002` | 404 | El pedido no existe |
| — | 503 | La base de datos no responde |

## Pruebas

```bash
pip install -r requirements-dev.txt
pytest
ruff check app tests
```

Las pruebas cubren la validación de esquemas, la firma y verificación de JWT,
el freno de fuerza bruta y la generación de claves de producto (`slugify`).
