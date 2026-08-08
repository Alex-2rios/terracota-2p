# Panel web de Terracota

Panel de administración en Flask. **No se conecta a PostgreSQL**: todo pasa por
la API a través de `api_client.py`. Si buscas una consulta SQL aquí, no la vas
a encontrar; hay que agregar el endpoint en `api/` y consumirlo desde el
cliente.

Sólo entran usuarios con rol **Administrador**.

## Ejecutar

Lo normal es levantarlo con el resto: `docker compose up -d --build` desde la
raíz, y abrir <http://localhost:5000>. Para correrlo suelto:

```bash
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python app.py
```

| Variable | Para qué | Por defecto |
|---|---|---|
| `API_URL` | Dirección base de la API | `http://localhost:8080/api/v1` |
| `SECRET_KEY` | Firma de la cookie de sesión | aleatoria en cada arranque |
| `FLASK_DEBUG` | Depurador de Werkzeug | `false` |
| `SESSION_COOKIE_SECURE` | Cookie sólo por HTTPS | `false` |
| `WEB_PORT` | Puerto | `5000` |

> Si no defines `SECRET_KEY`, se genera una al azar en cada arranque y las
> sesiones se pierden al reiniciar. Para la entrega defínela en el `.env`.

## Pantallas

| Ruta | Qué hace |
|---|---|
| `/` | Inicio de sesión (muestra si la API responde) |
| `/inicio` | Métricas, gráfica de ganancias vs gastos, ranking de productos, pedidos recientes |
| `/pedidos` | Listado con filtros, detalle con historial de estados y cancelación |
| `/usuarios` | Alta, edición con roles múltiples, baja lógica y reactivación |
| `/inventario` | Alta, edición, baja lógica y alertas de stock |
| `/gastos` | Registro de gastos (alimentan la gráfica del tablero) |
| `/reportes` | Nueve reportes (ventas, pedidos, productos, inventario, tickets, gastos, usuarios, mesas y auditoría) para ver en pantalla o descargar en PDF y XLSX |
| `/salud` | Diagnóstico: comprueba la conexión con la API |

## Seguridad

- **CSRF** en todos los formularios: token en la sesión, validado en
  `before_request` para POST/PUT/PATCH/DELETE.
- Cookie de sesión `HttpOnly` y `SameSite=Lax`.
- Cerrar sesión es un POST, no un enlace (no se dispara por prefetch).
- Depuración apagada por defecto; en Docker corre con **gunicorn**.
- El token JWT vive en la sesión del servidor, nunca se manda al navegador.

## Detalles de implementación

- Las **gráficas** están dibujadas con Canvas 2D en `static/charts.js`, sin
  librerías externas: el panel funciona igual sin internet.
- La gráfica de **Ganancias vs Gastos** es interactiva: los botones
  *Ambas / Ganancias / Gastos* filtran las series y redibujan el lienzo. La
  escala del eje Y y los totales del pie se recalculan con lo que quedó
  visible, así que al ver una sola serie se aprecia mejor su variación.
- Los **reportes** los arma la API ya seccionados; la web sólo los convierte a
  PDF (reportlab) o XLSX (openpyxl). Cualquier otro cliente puede pedir el
  mismo reporte. La pantalla de reportes se construye a partir del catálogo
  que publica la API, así que no hay ninguna lista codificada en el frontend.
- Si la API falla, la web **no redirige**: muestra una página de error. Redirigir
  provocaba un bucle infinito (`ERR_TOO_MANY_REDIRECTS`) porque el destino
  fallaba igual. Los errores del usuario (un filtro mal puesto) se distinguen de
  los del servicio: los primeros limpian el filtro y avisan, los segundos
  explican que el servicio no responde.
- `static/confirm.js` reinyecta el botón que disparó el envío como campo
  oculto: sin eso, `form.submit()` perdería cuál de los dos botones de
  exportación se presionó.
