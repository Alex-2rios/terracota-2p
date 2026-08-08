# Terracota · Tarjeta de credenciales

> Entrega 2º parcial · Estas cuentas se crean solas al levantar la base de datos.
> Las contraseñas se guardan como hash bcrypt (`pgcrypto`), nunca en texto plano.

---

## APLICACIÓN MÓVIL (Expo Go)

| Módulo      | Usuario   | Contraseña   |
|-------------|-----------|--------------|
| **Mesero**  | `mesero`  | `Mesero123!` |
| **Cocina**  | `cocina`  | `Cocina123!` |
| **Caja**    | `caja`    | `Caja123!`   |

En la pantalla de login se elige el módulo (Mesero / Caja / Cocina) **antes** de
entrar. Un usuario sólo puede abrir su propio módulo.

## PANEL WEB (http://localhost:5000)

| Rol               | Usuario   | Contraseña     |
|-------------------|-----------|----------------|
| **Administrador** | `admin`   | `Admin123!`    |

El panel web es **exclusivo del rol Administrador**. Si entra un mesero, la web
lo rechaza con "Acceso denegado".

---

## Cuentas adicionales para pruebas

| Usuario   | Contraseña     | Roles                     | Para qué sirve                                   |
|-----------|----------------|---------------------------|--------------------------------------------------|
| `mesero2` | `Mesero123!`   | Mesero                    | Probar que un mesero no ve pedidos de otro       |
| `gerente` | `Gerente123!`  | Administrador + Caja      | Probar un usuario con varios roles a la vez      |

El usuario `admin` (rol Administrador) también puede entrar a **cualquier**
módulo de la app móvil: es el superusuario del sistema.

---

## Direcciones

| Servicio            | Dirección                          |
|---------------------|------------------------------------|
| Panel web           | http://localhost:5000              |
| API (Swagger)       | http://localhost:8080/docs         |
| API (salud)         | http://localhost:8080/health       |
| PostgreSQL          | localhost:5433 · base `terracota`  |

**App móvil:** sustituye `localhost` por la IP de la computadora
(`ipconfig` → Dirección IPv4), por ejemplo `http://192.168.1.20:8080/api/v1`.
Se configura en `movil/.env.local` o desde el botón **Configurar servidor** de
la pantalla de login.

---

## Cuentas técnicas (no son de usuario final)

| Cuenta          | Contraseña            | Uso                                    |
|-----------------|-----------------------|----------------------------------------|
| `postgres`      | `postgres`            | Administración de PostgreSQL           |
| `terracota_app` | `TerracotaLocal123!`  | Rol con el que la API entra a la base  |

Ambas se configuran en el archivo `.env` de la raíz. **Cámbialas antes de
cualquier despliegue real.**

---

### Cómo cambiar una contraseña

Desde el panel web: **Usuarios → Editar → Contraseña**. O directamente en SQL:

```sql
UPDATE terracota.usuarios
SET password_hash = crypt('NuevaClaveSegura', gen_salt('bf'))
WHERE lower(usuario) = 'admin';
```
