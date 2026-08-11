"""Verificación de entrega de Terracota.

Comprueba, contra el sistema realmente en marcha, que todo lo que se va a
presentar funciona: servicios arriba, credenciales de la tarjeta válidas,
flujo completo del negocio y los reportes en PDF y XLSX.

    python scripts/verificar_entrega.py

Requiere `requests` (viene en el entorno de la web):

    web\\.venv\\Scripts\\python.exe scripts\\verificar_entrega.py     (Windows)
    web/.venv/bin/python scripts/verificar_entrega.py                (Linux/Mac)
"""

from __future__ import annotations

import re
import sys

try:
    import requests
except ImportError:
    sys.exit("Falta la librería `requests`. Instálala con: pip install requests")

API = "http://localhost:8080/api/v1"
RAIZ_API = "http://localhost:8080"
WEB = "http://localhost:5000"

CREDENCIALES = [
    ("admin", "Admin123!", "administrador"),
    ("mesero", "Mesero123!", "mesero"),
    ("cocina", "Cocina123!", "cocina"),
    ("caja", "Caja123!", "caja"),
    ("mesero2", "Mesero123!", "mesero"),
    ("gerente", "Gerente123!", "administrador"),
]

fallos: list[str] = []
avisos: list[str] = []

def revisar(nombre: str, ok: bool, detalle: str = "") -> bool:
    print(("  [ok]    " if ok else "  [FALLA] ") + nombre + ("" if ok else f"  ->  {detalle}"))
    if not ok:
        fallos.append(nombre)
    return ok

def titulo(texto: str) -> None:
    print(f"\n{texto}\n" + "-" * len(texto))

def cabecera(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

def entrar(usuario: str, password: str):
    try:
        return requests.post(f"{API}/auth/token", timeout=10,
                             data={"username": usuario, "password": password})
    except requests.RequestException as error:
        return error

titulo("1. Servicios")
try:
    salud = requests.get(f"{RAIZ_API}/health", timeout=10)
    revisar("la API responde", salud.status_code == 200 and salud.json()["status"] == "ok")
except requests.RequestException as error:
    revisar("la API responde", False, str(error))
    print("\n  La API no contesta. Levanta el stack con:  docker compose up -d")
    sys.exit(1)

try:
    revisar("el panel web responde", requests.get(WEB, timeout=10).status_code == 200)
except requests.RequestException as error:
    revisar("el panel web responde", False, str(error))

try:
    puente = requests.get(f"{WEB}/salud", timeout=10).json()
    revisar("la web alcanza a la API", puente.get("api", {}).get("status") == "ok", str(puente))
except requests.RequestException as error:
    revisar("la web alcanza a la API", False, str(error))

titulo("2. Credenciales de la tarjeta")
sesiones: dict[str, str] = {}
for usuario, password, rol in CREDENCIALES:
    respuesta = entrar(usuario, password)
    if isinstance(respuesta, Exception) or respuesta.status_code != 200:
        estado = respuesta.status_code if not isinstance(respuesta, Exception) else "sin red"
        revisar(f"{usuario} / {password}", False,
                f"HTTP {estado} — ¿la cuenta fue desactivada o dada de baja desde el panel?")
        continue
    datos = respuesta.json()
    sesiones[usuario] = datos["access_token"]
    revisar(f"{usuario} / {password}  ->  {rol}", rol in datos["usuario"]["roles"],
            f"roles reales: {datos['usuario']['roles']}")

if "admin" not in sesiones:
    print("\n  Sin la cuenta admin no se puede seguir comprobando.")
    sys.exit(1)

admin = cabecera(sesiones["admin"])

titulo("3. Datos base")
mesas = requests.get(f"{API}/catalogos/mesas", headers=admin, timeout=10).json()
productos = requests.get(f"{API}/catalogos/productos", headers=admin, timeout=10).json()
usuarios = requests.get(f"{API}/administracion/usuarios", headers=admin, timeout=10).json()
revisar(f"hay mesas activas ({len(mesas)})", len(mesas) > 0)
revisar(f"hay productos vendibles ({len(productos)})", len(productos) > 0)
revisar(f"hay usuarios vigentes ({len(usuarios)})", len(usuarios) >= 4)

libres = [m for m in mesas if m["estado"] == "DISPONIBLE"]
if not libres:
    avisos.append("No hay ninguna mesa libre: cancela o cobra pedidos antes de la demostración.")

titulo("4. Flujo completo Mesero -> Cocina -> Mesero -> Caja")
faltan = [r for r in ("mesero", "cocina", "caja") if r not in sesiones]
if faltan:
    revisar("flujo completo", False, f"faltan las cuentas: {', '.join(faltan)}")
elif not libres:
    revisar("flujo completo", False, "no hay mesas disponibles")
else:
    mesero, cocinero, cajero = (cabecera(sesiones[r]) for r in ("mesero", "cocina", "caja"))
    creado = requests.post(f"{API}/mesero/pedidos", headers=mesero, timeout=15, json={
        "mesa": libres[0]["numero"],
        "items": [{"producto_clave": productos[0]["clave"], "cantidad": 1,
                   "observacion": "Verificación de entrega"}]})

    if revisar("el mesero levanta el pedido", creado.status_code == 201, creado.text[:120]):
        pedido = creado.json()["id"]
        for estado in ("PREPARANDO", "LISTO"):
            r = requests.patch(f"{API}/cocina/pedidos/{pedido}/estado", headers=cocinero,
                               json={"estado": estado}, timeout=10)
            revisar(f"cocina lo pasa a {estado}", r.status_code == 200, r.text[:120])
        r = requests.patch(f"{API}/mesero/pedidos/{pedido}/entregar", headers=mesero,
                           json={"estado": "ENTREGADO"}, timeout=10)
        revisar("el mesero lo entrega", r.status_code == 200, r.text[:120])
        r = requests.post(f"{API}/caja/pagos", headers=cajero, timeout=10, json={
            "pedido_id": pedido, "metodo": "EFECTIVO", "monto_recibido": 5000})
        if revisar("caja lo cobra y emite ticket", r.status_code == 201, r.text[:120]):
            print(f"           folio emitido: {r.json()['folio']}")

titulo("5. Reglas del inventario")
if "mesero" in sesiones and libres and productos:
    mesero = cabecera(sesiones["mesero"])
    producto = requests.post(f"{API}/inventario/productos", headers=admin, timeout=10, json={
        "nombre": f"Verificacion {int(__import__('time').time())}", "categoria": "Bebidas",
        "precio": 20, "stock_actual": 30, "stock_minimo": 1}).json()

    def existencias() -> int:
        return requests.get(f"{API}/inventario/productos/{producto['id']}",
                            headers=admin, timeout=10).json()["stock_actual"]

    inicial = existencias()
    mesas_ahora = [m for m in requests.get(f"{API}/catalogos/mesas", headers=mesero, timeout=10).json()
                   if m["estado"] == "DISPONIBLE"]
    if mesas_ahora:
        pedido = requests.post(f"{API}/mesero/pedidos", headers=mesero, timeout=15, json={
            "mesa": mesas_ahora[0]["numero"],
            "items": [{"producto_clave": producto["clave"], "cantidad": 3},
                      {"producto_clave": producto["clave"], "cantidad": 4}]}).json()

        revisar("se descuenta el stock al levantar el pedido",
                existencias() == inicial - 7, f"{inicial} -> {existencias()}")

        baja = requests.delete(f"{API}/inventario/productos/{producto['id']}", headers=admin, timeout=10)
        revisar("no deja dar de baja un producto que está en un pedido",
                baja.status_code == 409, f"HTTP {baja.status_code}")

        requests.post(f"{API}/administracion/pedidos/{pedido['id']}/cancelar",
                      headers=admin, json={"motivo": "Verificación de entrega"}, timeout=10)
        revisar("al cancelar devuelve TODO el stock, incluso repetido",
                existencias() == inicial, f"{inicial} -> {existencias()}")

        baja = requests.delete(f"{API}/inventario/productos/{producto['id']}", headers=admin, timeout=10)
        revisar("tras cancelar el pedido, ya se puede dar de baja",
                baja.status_code == 200, f"HTTP {baja.status_code}")
    else:
        avisos.append("No quedaban mesas libres para comprobar las reglas de inventario.")

titulo("6. Reportes en PDF y XLSX")
catalogo = requests.get(f"{API}/administracion/reportes/opciones", headers=admin, timeout=20).json()
tipos = [t["clave"] for t in catalogo["tipos"]]
print(f"  tipos disponibles: {', '.join(tipos)}\n")

sesion_web = requests.Session()
sesion_web.post(WEB, data={"correo": "admin", "password": "Admin123!"}, timeout=15)
pagina = sesion_web.get(f"{WEB}/reportes", timeout=20)
marca = re.search(r'name="csrf_token" value="([^"]+)"', pagina.text)

if not marca:
    revisar("se puede abrir la pantalla de reportes", False, f"HTTP {pagina.status_code}")
else:
    base = {"csrf_token": marca.group(1), "fecha_inicio": "2020-01-01", "fecha_fin": "2030-12-31"}
    for clave in tipos:
        pdf = sesion_web.post(f"{WEB}/reportes/exportar", timeout=90,
                              data={**base, "tipo_reporte": clave, "formato": "pdf"})
        xlsx = sesion_web.post(f"{WEB}/reportes/exportar", timeout=90,
                               data={**base, "tipo_reporte": clave, "formato": "xlsx"})
        revisar(f"reporte {clave:11} PDF y XLSX",
                pdf.content[:4] == b"%PDF" and xlsx.content[:2] == b"PK",
                f"pdf={pdf.status_code} xlsx={xlsx.status_code}")

titulo("7. Pantallas del panel")
for ruta, senal in [("/inicio", "Estadísticas"), ("/pedidos", "Gestión de Pedidos"),
                    ("/usuarios", "Gestión de Usuarios"), ("/inventario", "Gestión de Inventario"),
                    ("/gastos", "Gastos del negocio"), ("/reportes", "Generar reporte")]:
    r = sesion_web.get(f"{WEB}{ruta}", timeout=25)
    revisar(f"{ruta}", r.status_code == 200 and senal in r.text, f"HTTP {r.status_code}")

print("\n" + "=" * 64)
if avisos:
    print("Avisos:")
    for aviso in avisos:
        print(f"  · {aviso}")
if fallos:
    print(f"\n{len(fallos)} COMPROBACIONES FALLARON:")
    for f in fallos:
        print(f"  · {f}")
    print("\nSi fallan credenciales, la base quedó modificada por pruebas.")
    print("Para dejarla como recién instalada:  docker compose down -v && docker compose up -d")
    sys.exit(1)

print("\nTODO EN ORDEN: el proyecto está listo para presentarse.")
sys.exit(0)
