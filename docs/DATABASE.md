# Database setup

AbbasiConnect uses PostgreSQL. The backend reads one environment variable:

```text
DATABASE_URL
```

## Local Docker database

The repository includes `docker-compose.yml`.

Start it:

```bash
docker compose up -d db
```

Use this connection string in `apps/api/.env`:

```text
postgresql://abbasi:abbasi_dev_password@localhost:5432/abbasiconnect?schema=public
```

## Hosted PostgreSQL later

You can use any PostgreSQL host that gives you a PostgreSQL connection string.

The migration path is:

1. Create a PostgreSQL database with the provider.
2. Copy its connection string.
3. Put that string into `DATABASE_URL` on the backend host.
4. Run Prisma migrations against that database.
5. Never put `DATABASE_URL` in the web frontend.

Example shape only:

```text
postgresql://USERNAME:PASSWORD@HOST:5432/DATABASE
```

`DATABASE_URL` belongs only on the API server because it contains credentials that allow database access.

## What creates the tables?

The file `apps/api/prisma/schema.prisma` is the source of truth for the starter data model.

Run:

```bash
npm run db:generate
npm run db:migrate -- --name init
```

Prisma creates the SQL migration and applies it to the database in `DATABASE_URL`.

## Viewing rows

```bash
npm run db:studio
```

Use Prisma Studio for development inspection rather than manually editing production rows.
