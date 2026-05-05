import path from "node:path";

export const DEFAULT_SQLITE_DB_PATH = "./data.db";
export const DEFAULT_PORT = 5000;

export const tursoDatabaseUrl = process.env.TURSO_DATABASE_URL?.trim();
export const tursoAuthToken = process.env.TURSO_AUTH_TOKEN?.trim();
export const databaseMode = tursoDatabaseUrl ? "turso" : "local";

export function resolveSqliteDbPath(value = process.env.DATA_DB_PATH): string {
  return path.resolve(value || DEFAULT_SQLITE_DB_PATH);
}

export function resolveDatabaseUrl(): string {
  if (tursoDatabaseUrl) return tursoDatabaseUrl;
  return `file:${resolveSqliteDbPath()}`;
}

export function resolvePort(value = process.env.PORT): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
}

export const sqliteDbPath = resolveSqliteDbPath();
export const databaseUrl = resolveDatabaseUrl();
