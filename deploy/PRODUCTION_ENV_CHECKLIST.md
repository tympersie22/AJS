# AJS Production Environment Checklist

Create `/opt/ajs/apps/ajs/.env.production` on the VPS. Restrict it with `chmod 600` and never commit it.

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV=production` | Yes | Enables production behavior in Node.js and Next.js. |
| `TZ=UTC` | Yes | Keeps server/container runtime timestamps predictable; AJS business deadlines are converted to Africa/Dar_es_Salaam in application code. |
| `AJS_DOMAIN` | Yes | Public hostname used by Nginx and TLS, for example `ajs.yourdomain.com`. |
| `DATABASE_URL` | Yes | Full PostgreSQL connection string using host `postgres` and port `5432`. |
| `POSTGRES_DB` | Yes | PostgreSQL database name created by the production container. |
| `POSTGRES_USER` | Yes | Dedicated PostgreSQL application user. |
| `POSTGRES_PASSWORD` | Yes | Strong unique password for the PostgreSQL application user. |
| `JWT_SECRET` | Yes | Long random signing secret for AJS authentication tokens. |
| `WEB_ORIGIN` | Yes | Allowed browser origin, normally `https://ajs.yourdomain.com`. |
| `NEXT_PUBLIC_AJS_API_URL=/api` | Yes | Browser-facing API prefix routed through Nginx. This value is embedded during the frontend build. |
| `HOST=0.0.0.0` | Yes | Makes Express listen on the API container network interface. |
| `PORT=4000` | Yes | Internal Express API port. Do not publish it on the VPS. |
| `SMTP_HOST` | Deferred | SMTP server hostname for email alerts. |
| `SMTP_PORT` | Deferred | SMTP port, commonly `587` or `465`. |
| `SMTP_USER` | Deferred | SMTP account username. |
| `SMTP_PASS` | Deferred | SMTP password or Gmail App Password. |
| `SMTP_FROM` | Deferred | Sender address displayed on alert emails. |
| `AT_API_KEY` | Deferred | Africa's Talking application API key. |
| `AT_USERNAME` | Deferred | Africa's Talking app username; use `sandbox` for sandbox testing. |
| `AT_SENDER_ID` | Deferred | Approved Africa's Talking SMS sender ID. |

Generate strong values on the server, keep `.env.production` outside Git, and back it up separately from the database.
