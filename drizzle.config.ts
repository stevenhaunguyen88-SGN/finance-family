import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { databaseUrl, sqliteDbPath, tursoAuthToken, tursoDatabaseUrl } from "./server/config";

const baseConfig = {
  out: "./migrations",
  schema: "./shared/schema.ts",
} as const;

export default defineConfig(tursoDatabaseUrl ? {
  ...baseConfig,
  dialect: "turso",
  dbCredentials: {
    url: databaseUrl,
    authToken: tursoAuthToken,
  },
} : {
  ...baseConfig,
  dialect: "sqlite",
  dbCredentials: {
    url: sqliteDbPath,
  },
});
