# Family Finance

Internal family finance app — track household income, expenses, wallets, and members.

## Stack

- **Client**: React 18 + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query + Wouter (hash routing) + Recharts
- **Server**: Express 5 + TypeScript (tsx in dev, esbuild bundle in prod)
- **Database**: SQLite via `better-sqlite3` + Drizzle ORM
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

Sessions live in memory (express-session + `memorystore`) — restarting the
server logs everyone out. Cookies are `httpOnly` + `sameSite=lax`, plus
`secure` when `NODE_ENV=production`.

To add more users today, insert rows directly into the `users` table with a
bcrypt hash:

```bash
node -e "import('bcryptjs').then(({default: b}) => console.log(b.hashSync('your-password', 10)))"
# then:
sqlite3 data.db "INSERT INTO users(username, password_hash) VALUES('alice', '<hash>');"
```

A proper user-management UI is queued for a later sprint.

## Scripts

- `npm run dev` — dev server (Vite middleware + Express)
- `npm run build` — bundle client (`dist/public`) + server (`dist/index.cjs`)
- `npm run start` — run the bundled production server
- `npm run check` — TypeScript typecheck
- `npm run db:push` — push Drizzle schema to SQLite

## Project layout

```
client/          # React app (Vite root)
server/          # Express API + storage
shared/schema.ts # Drizzle schema + Zod insert schemas
script/build.ts  # production bundler (vite + esbuild)
```

## Status

Internal MVP. See PRs for ongoing work (auth, mobile UX, PWA, recurring transactions, budgets, etc.).
