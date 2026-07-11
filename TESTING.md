# AJS Testing Notes

## Regression Suite

Run from this directory:

```bash
npm run db:test:up
npm run db:test:migrate
npm run test:db
```

The regression suite intentionally exercises the real Prisma/Postgres-backed alert spine. It creates users, drivers, watched items, alerts, alert events, and related fixture records with `regression-*` identifiers.

Important: the suite does **not** clean up after itself. It must run only through `npm run test:db`, which loads `.env.test` and points Prisma at the disposable Postgres container on `127.0.0.1:54330`.

Do **not** run the regression suite against `.env`, production, or any database that contains real AJS operational data.

## Disposable Test Database

The isolated test database is defined in:

- `.env.test`
- `docker-compose.test.yml`

It uses its own Docker container (`ajs-postgres-test`), port (`54330`), and named volume (`ajs-test-postgres-data`) so local/production data remains untouched.

There is intentionally no ambiguous `npm test` script. Use `npm run test:db` after migrations are applied.
