# Garment Shop ERP

Multi-branch garment retail billing and ERP: POS, GST invoices, returns/exchanges, inventory,
purchasing, customers, suppliers, expenses, cash sessions, accounting and reports.

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 4, TanStack Query, React Router 7, PWA
- **Backend:** Java 21, Spring Boot 3.4, Spring Security (JWT), Spring Data JPA, Flyway
- **Database:** MySQL 8 (production) / H2 in MySQL mode (local development)

## Quick start with Docker

```bash
cp .env.example .env
# Edit .env and set a long random JWT_SECRET.
docker compose up --build
```

| Service | URL |
| --- | --- |
| App | http://localhost:8088 |
| API | http://localhost:8080/api |
| Health | http://localhost:8080/actuator/health |

The first backend start creates the business and owner account. Sign in with
`owner` / the `SEED_PASSWORD` from `.env` (default `Retail@123`).

The stack runs with `prod,mysql` profiles: Swagger and the H2 console are disabled, demo data is
forced off, and `JWT_SECRET` / `CORS_ORIGINS` are required.

## Local development

Prerequisites: JDK 21, Maven 3.9+, Node.js 20+.

### Backend (H2 file database, demo data)

```bash
cd backend
mvn spring-boot:run
```

- API: http://localhost:8080
- Swagger UI: http://localhost:8080/swagger-ui.html
- H2 console: http://localhost:8080/h2-console (JDBC URL `jdbc:h2:file:./data/db/garmenterp`)
- Demo login: `owner` / `Retail@123`
- Data lives in `backend/data/db`; delete that folder for a clean reseed.

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Vite serves http://localhost:5173 and proxies `/api` to the backend.

## Configuration

Profiles are selected with `SPRING_PROFILES_ACTIVE`.

| Profile | Purpose |
| --- | --- |
| `local` (default) | H2 file database, demo data, dev JWT fallback |
| `test` | In-memory H2, `create-drop`, no demo data |
| `mysql` | MySQL datasource, Flyway enabled, `ddl-auto: validate` |
| `prod` | Hardening: requires `JWT_SECRET` and `CORS_ORIGINS`, disables Swagger/H2 console, forces demo data off |

Common environment variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `JWT_SECRET` | dev-only in `local`/`test` | Required in `prod`; at least 32 random characters |
| `JWT_EXPIRATION_MINUTES` | `480` | Token lifetime |
| `CORS_ORIGINS` | localhost dev origins | Comma-separated allowed origins; required in `prod` |
| `DEMO_DATA` | `true` in `local`, else `false` | Seeds the demo catalogue/sales |
| `SEED_PASSWORD` | `Retail@123` | Password for the bootstrap owner |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | `localhost` / `3306` / `garment_erp` | MySQL profile |
| `DB_USER` / `DB_PASSWORD` | `garment` / `garment` | MySQL profile |
| `LOGIN_RATE_LIMIT_MAX` | `30` | Login attempts per IP per window |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | `300` | Rate-limit window |
| `BACKUP_ENABLED` | `true` (local) | Scheduled `mysqldump` backups |

## Tests and builds

```bash
cd backend && mvn verify
cd frontend && npm run build
```

Unit tests cover the refund-method policy, login rate limiter and invoice numbering.
CI (`.github/workflows/ci.yml`) runs backend tests, frontend build, Playwright E2E, a real MySQL
Flyway migration and Docker image builds on push and pull requests.

### End-to-end tests

Playwright covers sign-in, the mode chooser, dashboard, sales/returns navigation and invalid
credentials. The backend must be running on `:8080` with demo data; the config starts Vite
automatically.

```bash
cd frontend
npx playwright install chromium   # first run only
npm run test:e2e
```

To test a deployed stack (for example the Docker compose frontend):

```bash
E2E_BASE_URL=http://localhost:8088 npm run test:e2e
```

Override credentials with `E2E_USERNAME` / `E2E_PASSWORD`.

### Post-deploy smoke test

After `docker compose up` (or any deployment), run the dependency-free API smoke test:

```bash
node scripts/smoke.mjs
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:8080` | Backend base URL |
| `SMOKE_USERNAME` / `SMOKE_PASSWORD` | `owner` / `Retail@123` | Login credentials |
| `SMOKE_BRANCH_ID` | first available | Branch filter for list endpoints |
| `SMOKE_FRONTEND_URL` | unset | Also check the frontend shell is served |

It verifies health, rejects anonymous API calls, logs in, and exercises the dashboard,
returns list/summary and sales invoice list. It exits non-zero on the first failure, so it can
be used in CI or after a deploy.

## Database migrations

- `backend/src/main/resources/db/migration/V1__baseline.sql` is the MySQL 8 baseline generated
  from the JPA entity model (56 tables, 88 foreign keys).
- The `mysql` profile runs Flyway before Hibernate validates the schema.
- Add new changes as `V2__description.sql`, `V3__description.sql`, and never edit an applied file.
- CI applies the baseline to a MySQL 8.4 service container on every push, and the Docker compose
  stack re-runs Flyway plus Hibernate `ddl-auto: validate` at startup.
- To test a migration manually against any MySQL instance:

  ```bash
  cd backend
  mvn flyway:migrate \
    -Dflyway.url=jdbc:mysql://127.0.0.1:3306/garment_erp \
    -Dflyway.user=garment -Dflyway.password=garment
  ```

- Flyway 10.20 (managed by Spring Boot 3.4) logs an upgrade warning for MySQL 8.4 because 8.1 is
  the newest version it officially lists. The baseline and Hibernate validation both pass on 8.4.

## Project layout

```text
backend/
  src/main/java/com/garmentshop/erp/
    auth/ security/ sales/ returns/ inventory/ purchasing/ accounting/ ...
  src/main/resources/application.yml
  src/main/resources/db/migration/
  src/test/java/
frontend/
  src/pages/        route-level code-split screens
  src/components/   layout and shared UI
  src/lib/          API client, auth, types, formatting
docker-compose.yml
```

## Production notes / known limitations

- The login rate limiter is in-memory. It resets on restart and is per instance; use a shared
  store (Redis) if you run multiple backend replicas.
- Exchanges currently require the replacement bill to be at least the return credit. Refunding
  the difference for a cheaper replacement is not implemented; the UI must add items until the
  credit is consumed.
- Automated MySQL backup uses `mysqldump`; set `MYSQLDUMP_PATH` or disable with `BACKUP_ENABLED=false`
  when running in a container without the client tools.
- Demo data is for local evaluation only. Never enable `DEMO_DATA` in production.
