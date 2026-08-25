# Local setup

This is the exact local-development path for the starter repository.

## 1. Install prerequisites

Install Node.js 20 or newer and Docker Desktop.

Verify them:

```bash
node --version
npm --version
docker --version
```

## 2. Clone the repository

```bash
git clone https://github.com/abdullah-x-bd/AbbasiConnect.git
cd AbbasiConnect
```

## 3. Install JavaScript dependencies

```bash
npm install
```

## 4. Start PostgreSQL

```bash
docker compose up -d db
```

Check that the database container is running:

```bash
docker compose ps
```

## 5. Create backend environment file

On macOS/Linux:

```bash
cp apps/api/.env.example apps/api/.env
```

On Windows PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

The local database URL is already filled in for the Docker database.

Change `JWT_SECRET` in `apps/api/.env` to any long random development string.

## 6. Create web environment file

On macOS/Linux:

```bash
cp apps/web/.env.example apps/web/.env
```

On Windows PowerShell:

```powershell
Copy-Item apps/web/.env.example apps/web/.env
```

## 7. Generate Prisma client

```bash
npm run db:generate
```

## 8. Create database tables

```bash
npm run db:migrate -- --name init
```

## 9. Start both applications

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

Backend health check:

```text
http://localhost:3001/health
```

## 10. Development login

Use a fake reference such as:

```text
DEV-ABBASI-001
```

Do not enter a real Aadhaar number into the development simulator.

## Inspect the database visually

Run:

```bash
npm run db:studio
```

Prisma Studio opens a browser interface where you can inspect `User`, `Post`, and `Follow` rows.

## Stop local PostgreSQL

```bash
docker compose down
```

To also delete the local database volume and all development data:

```bash
docker compose down -v
```
