# Terracota

Point of sale for a café. One REST API, two clients: a React Native app used by waiters, kitchen
and cashier, and a Flask panel for administration. Neither client ever touches the database.

Spanish version of this document: [README.md](README.md).

```
   Mobile app (Expo)  ─┐
                       ├─►  REST API (FastAPI + JWT)  ─►  PostgreSQL 16
   Web panel (Flask)  ─┘
```

| Layer | Stack | Folder | Port |
|---|---|---|---|
| Database | PostgreSQL 16 | `database/` | 5433 |
| API | FastAPI, JWT, psycopg3 | `api/` | 8080 |
| Web panel | Flask, Jinja | `web/` | 5000 |
| Mobile app | Expo 54, React Native | `movil/` | 5001 |

## Running it

```bash
docker compose up -d --build
curl http://localhost:8080/health
```

That brings up PostgreSQL, applies the schema, seeds the demo users, and starts the API, the
panel and the app. Swagger lives at <http://localhost:8080/docs>.

`docker compose down` stops everything and keeps the data. `docker compose down -v` starts over.

## Design decisions worth pointing at

**The API is the only component with database credentials.** The mobile app and the web panel
hold a JWT and nothing else. Rotating the database password touches one service, and a stolen
phone gives up a token that expires, not a connection string.

**A dedicated database role.** The API connects as `terracota_app`, never as `postgres`, with the
grants in `database/02_PERMISOS_API.sql` and nothing more.

**PostgreSQL error codes are translated into HTTP status codes.** The PL/pgSQL functions raise
specific SQLSTATEs on purpose and the API maps them:

| SQLSTATE | HTTP | What actually happened |
|---|---|---|
| 23505 | 409 | unique violation, that record already exists |
| 23503 | 422 | foreign key violation |
| 23514 | 422 | check constraint failed |
| 42501 | 403 | the database role is not allowed to do that |
| P0002 | 404 | no data found |

Without that mapping every database error arrives at the client as a generic 400 or a 500, and
there is no way to tell "you sent a duplicate" from "the server is broken".

**Rules live in the database where they can be enforced.** Stock cannot go negative, a product in
use cannot be deleted, and an order that has been paid cannot be cancelled. Those are constraints
and functions, not `if` statements in three different clients.

**Startup order is enforced, not hoped for.** The init job waits for the database to report
healthy, the API waits for the init job to complete successfully, and the panel waits for the API
to be healthy. No retry loops, no connection refused on first boot.

**Idempotent SQL init.** The scripts can run on every `up` without wiping data, so rebuilding the
stack never turns into a decision about whether this is a fresh install.

## Order lifecycle

Pending → Preparing → Ready → Delivered → Paid, with cancellation allowed only by the roles that
should be able to cancel at each stage, and never once an order has been paid. That table is in
the Spanish README and it is the clearest example of the business rules being explicit rather
than implied.

## Reports

Nine reports out of the admin panel: sales, orders, products, inventory, tickets and payments,
expenses, users, tables, and an audit log of order state changes. They export to PDF and XLSX.

## Tests

```bash
cd api
pip install -r requirements-dev.txt
pytest
```

Covers the query layer, the schemas and the security helpers.

## Deployment

Published behind TLS: the web panel on 443, the API on 8443, and the mobile app plus the signed
APK download on 10000. The APK is built inside a Docker image, so putting a new version on a
phone does not require a local Java or Android SDK install, and the download URL stays the same
between releases so the same QR code keeps working.

## What I learned

- Putting an API between the clients and the database is worth the extra hop. Three clients, one
  place where the rules live, and the credentials never leave the server.
- Letting PostgreSQL enforce constraints and then translating its error codes is more reliable
  than reimplementing every rule in Python. The database is going to check anyway, so the useful
  work is turning its answer into something a client can act on.
- `depends_on` with conditions removed an entire class of first boot failures that I had been
  papering over with sleeps and retries.
- Building the APK in a container was the point where releasing stopped being a ritual. Anyone
  who can run Docker can produce the same signed build.
- Remapping PostgreSQL to 5433 sounds trivial and saves an afternoon the first time you run this
  on a machine that already has PostgreSQL on 5432.
