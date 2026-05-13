# Family Finance

Internal family finance app — track household income, expenses, wallets, and members.

## Stack

- **Client**: React 18 + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query + Wouter (hash routing) + Recharts
- **Server**: Express 5 + TypeScript (tsx in dev, esbuild bundle in prod)
- **Database**: SQLite-compatible libSQL + Drizzle ORM
- **Locale**: Vietnamese, VND currency

## Getting started

```bash
npm install
cp .env.example .env
# edit .env and set ADMIN_USERNAME + ADMIN_PASSWORD (and SESSION_SECRET in prod)
npm run dev      # starts express + vite middleware on :5000
```

Open http://localhost:5000 — you'll be redirected to the login page.

The first run seeds a demo family ("Gia đình Hậu") with members, wallets, categories, and a few sample transactions. The SQLite file (`data.db`) is created next to `package.json` and is gitignored.

## Authentication

The app is gated behind a username + password login. There is no public
registration — accounts are created via environment variables on first boot:

| Var | Required | Purpose |
|---|---|---|
| `ADMIN_USERNAME` | yes | First admin login. Idempotent: ignored once the user already exists. |
| `ADMIN_PASSWORD` | yes | Cleartext password used to bootstrap the first admin. Hashed with bcrypt before storage. |
| `SESSION_SECRET` | in production | ≥16 chars. Generate: `openssl rand -hex 32`. App refuses to start in production without it. |
| `TRUST_PROXY` | optional | Set `true` if running behind a reverse proxy. Needed for `Secure` cookies + correct rate-limit IPs. |
| `TURSO_DATABASE_URL` | hosted production | Turso/libSQL URL, e.g. `libsql://...turso.io`. |
| `TURSO_AUTH_TOKEN` | hosted production | Turso database auth token. |
| `DATA_DB_PATH` | local only | Local file DB path when Turso is not configured. Defaults to `./data.db`. |

Sessions live in memory (express-session + `memorystore`) — restarting the
server logs everyone out. Cookies are `httpOnly` + `sameSite=lax`, plus
`secure` when `NODE_ENV=production`.

Additional accounts can be created from the **Tài khoản** (User Management)
page — no CLI required.

## User Management

The User Management page (`/#/users`) lets admins:

- List all login accounts
- Create new accounts (username + password)
- Edit existing accounts (rename, reset password)
- Delete accounts (cannot delete yourself or the last remaining account)

Passwords are hashed with bcrypt before storage.

## Category Management

The Categories page (`/#/categories`) lets users:

- View all income/expense categories in tabbed layout
- Add custom categories with emoji icon and color picker
- Edit custom categories (name, icon, color)
- Delete unused custom categories (default categories are locked)

## Savings Goals

The Savings Goals page (`/#/savings`) lets families track progress toward
financial targets:

- Create goals with a name, target amount, icon, color, and optional deadline
- Contribute to or withdraw from goals
- Visual progress bars showing percentage saved
- Automatic completion when target is reached
- Dashboard widget showing active goals at a glance

## Dark Mode

Theme preference (light/dark) is saved to `localStorage` and persists across
page reloads. The toggle is in the sidebar header.

## Recurring Transactions

Set up repeating income/expense/transfer entries that fire automatically.
Frequencies: daily, weekly, monthly, yearly. Manage from the "Định kỳ" page.

The server processes any due entries on startup (catches up after downtime).
You can also trigger processing manually via the "Xử lý" button or
`POST /api/recurring/process`.

## Settings

The Settings page (`/#/settings`) lets users:

- View their account info
- Change their password
- See app and security details

## Notifications

The app generates in-app notifications automatically:

- **Budget warnings** — when spending reaches 80% of a category's monthly limit
- **Budget exceeded** — when spending exceeds 100% of the limit
- **Savings milestones** — when a savings goal reaches 50% or 75%
- **Savings completed** — when a savings goal is fully funded
- **Recurring processed** — when recurring transactions are auto-generated

Access notifications via the bell icon in the sidebar (desktop) or header
(mobile). Unread count badge updates every 30 seconds.

## Free-Tier Deploy

The included `render.yaml` is ready for a Render Free web service. Use Turso for
the database so finance data does not live on Render's ephemeral local disk.

Required hosted environment variables:

- `SESSION_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

The app initializes tables on startup and exposes `/healthz` for host health
checks. `npm run db:push` is still useful when you intentionally change the
Drizzle schema.

## Scripts

- `npm run dev` — dev server (Vite middleware + Express)
- `npm run build` — bundle client (`dist/public`) + server (`dist/index.cjs`)
- `npm run start` — run the bundled production server
- `npm run check` — TypeScript typecheck
- `npm run db:push` — push Drizzle schema to local SQLite or Turso, depending on env

## Project layout

```
client/          # React app (Vite root)
server/          # Express API + storage
shared/schema.ts # Drizzle schema + Zod insert schemas
script/build.ts  # production bundler (vite + esbuild)
```

## Status

Internal MVP. See PRs for ongoing work.
