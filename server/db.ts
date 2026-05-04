import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";

const dbPath = process.env.DATA_DB_PATH
  ? path.resolve(process.env.DATA_DB_PATH)
  : path.resolve(process.cwd(), "data.db");

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS family_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    avatar_color TEXT NOT NULL DEFAULT '#01696F',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cash',
    balance REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'VND',
    icon TEXT NOT NULL DEFAULT 'wallet',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'tag',
    type TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#01696F',
    is_default INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    wallet_id INTEGER NOT NULL,
    to_wallet_id INTEGER,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    note TEXT,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_family_date
    ON transactions(family_id, date);
  CREATE INDEX IF NOT EXISTS idx_transactions_wallet
    ON transactions(wallet_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_to_wallet
    ON transactions(to_wallet_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_member
    ON transactions(member_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_category
    ON transactions(category_id);

  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    monthly_limit REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(family_id, category_id)
  );

  CREATE INDEX IF NOT EXISTS idx_budgets_family
    ON budgets(family_id);
`);

// Lightweight migrations: add new columns if upgrading from an older schema.
function safeAddColumn(table: string, columnSpec: string) {
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSpec}`);
  } catch (err: any) {
    // Ignore "duplicate column name" — column already exists.
    if (!String(err?.message || "").includes("duplicate column name")) {
      throw err;
    }
  }
}

safeAddColumn("transactions", "to_wallet_id INTEGER");
