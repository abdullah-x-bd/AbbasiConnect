# Deployment notes

The starter is intentionally provider-neutral.

For production you need three deployable pieces:

1. PostgreSQL database
2. Fastify API
3. static Vite web application

## Backend environment variables

```text
DATABASE_URL
JWT_SECRET
PORT
WEB_ORIGIN
```

## Frontend environment variable

```text
VITE_API_URL
```

Example production topology:

```text
www.abbasiconnect.example  -> web frontend
api.abbasiconnect.example  -> Fastify API
private database host      -> PostgreSQL
```

Set `WEB_ORIGIN` to the exact frontend origin and `VITE_API_URL` to the HTTPS API origin.

The database connection string must exist only on the backend host.
