# Deployment Options

This is a private, single-family finance app. The safest free-tier choice is the one that keeps the database persistent and easy to back up.

## Recommendation

Implemented path: local file-backed libSQL for development, Turso/libSQL for hosted production when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set.

Use SQLite-compatible storage locally for now. For a free hosted deployment, prefer:

1. **Static website on Cloudflare Pages + hosted database on Turso**
   - Good fit now that the API/database layer uses the async libSQL driver.
   - Cloudflare Pages Free currently allows 500 builds per month, 20 minute build timeouts, and 20,000 files per site.
   - Turso Free currently lists 5 GB total storage, 500M monthly rows read, 10M monthly rows written, and 1 day point-in-time restore.

2. **Full Node app on Render Free + external persistent database**
   - Easiest fit for the current Express server shape.
   - `render.yaml` is included for this path. Add the secret env vars in Render: `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN`.
   - Do not store SQLite on Render Free local disk. Render says Free web service files are ephemeral, and local SQLite files are lost on redeploy, restart, or spin-down.
   - Render Free web services also spin down after 15 minutes idle. That is okay for family-only use, but the first request can be slow.

3. **Supabase or Neon Postgres + a small Node host**
   - Best long-term if we want managed backups, SQL tooling, and less SQLite-specific hosting friction.
   - This requires migrating Drizzle from SQLite tables to Postgres tables.
   - Supabase Free currently lists 2 free projects, 500 MB database size per project, 5 GB egress, and 1 GB file storage.
   - Neon Free currently lists 0.5 GB storage per project, 100 CU-hours monthly per project, scale to zero, and 5 GB included public network transfer.

## What Not To Do

- Do not commit `data.db`, `data.db-shm`, or `data.db-wal`.
- Do not rely on an app host's free ephemeral filesystem for the real family database.
- Do not deploy with `ADMIN_PASSWORD=1`; keep `.env.example` blank and set a real secret only in local/host environment variables.

## Current App Fit

The current project is a single Express server that serves both API and Vite-built client, backed by Drizzle + libSQL. Local development uses `file:./data.db`; hosted production should use Turso via `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

If zero cost matters most, Turso is the closest match to the current SQLite data model. If minimum code change matters most, Render Free can run the server, but the database still needs to live somewhere persistent.

Sources checked May 5, 2026:

- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Render Free docs: https://render.com/docs/free
- Turso pricing: https://turso.tech/pricing
- Supabase billing docs: https://supabase.com/docs/guides/platform/billing-on-supabase
- Neon pricing: https://neon.com/pricing
