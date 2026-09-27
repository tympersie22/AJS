# AJS Single-VPS Deployment

Target: Ubuntu 22.04/24.04 with Docker Engine, the Docker Compose plugin, Git, Certbot, and at least 2 GB RAM.

## First deployment

1. Clone `https://github.com/tympersie22/AJS.git` to `/opt/ajs`.
2. Copy `.env.production.example` to `.env.production`, fill every required value, then run `chmod 600 .env.production`.
3. Point the `AJS_DOMAIN` DNS A/AAAA record at the VPS.
4. Allow inbound TCP `22`, `80`, and `443` in the VPS firewall; do not expose PostgreSQL, API port `4000`, or frontend port `3010`.
5. Run `scripts/deploy.sh`. Nginx starts in HTTP mode when no certificate exists.
6. Obtain the certificate manually:

   ```bash
   sudo certbot certonly --webroot \
     --webroot-path /opt/ajs/deploy/certbot \
     --domain ajs.yourdomain.com
   ```

7. Restart Nginx so its bootstrap script detects the certificate and enables HTTPS:

   ```bash
   docker compose --env-file .env.production \
     -f docker-compose.prod.yml restart nginx
   ```

8. Add `scripts/backup.sh` to root's nightly crontab and test a restore before accepting real operations.

## Deployment behavior

Images build before the running application is replaced, Prisma migrations run before the restart, and Compose waits for API/PostgreSQL health. Nginx remains running during application replacement. On a single API/frontend instance this is a health-gated minimal-downtime deployment; mathematically guaranteed zero downtime requires at least two application instances or blue-green infrastructure.

The alert scheduler runs inside the API container. Do not scale the API service above one replica without first adding a distributed scheduler lock.
