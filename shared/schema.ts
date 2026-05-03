import { sql } from "drizzle-orm";
import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Families ────────────────────────────────────────────────
export const families = sqliteTable("families", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ─── Family Members ──────────────────────────────────────────
export const familyMembers = sqliteTable("family_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  familyId: integer("family_id").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "member", "child"] }).notNull().default("member"),
  avatarColor: text("avatar_color").notNull().default("#01696F"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ─── Wallets ─────────────────────────────────────────────────
export const wallets = sqliteTable("wallets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  familyId: integer("family_id").notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: ["cash", "bank", "credit", "savings"] }).notNull().default("cash"),
  balance: real("balance").notNull().default(0),
  currency: text("currency").notNull().default("VND"),
  icon: text("icon").notNull().default("wallet"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ─── Categories ──────────────────────────────────────────────
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  familyId: integer("family_id"),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("tag"),
  type: text("type", { enum: ["income", "expense"] }).notNull(),
  color: text("color").notNull().default("#01696F"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
});

// ─── Users (auth) ────────────────────────────────────────────
//
// Internal-use auth: a small set of named accounts gated by username + password.
// `passwordHash` is a bcrypt hash; the cleartext password is never stored.
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ─── Transactions ────────────────────────────────────────────
//
// `walletId` is the source wallet for income/expense, and the FROM wallet for transfers.
// `toWalletId` is only used when `type === "transfer"` and is the destination wallet.
export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  familyId: integer("family_id").notNull(),
  memberId: integer("member_id").notNull(),
  categoryId: integer("category_id").notNull(),
  walletId: integer("wallet_id").notNull(),
  toWalletId: integer("to_wallet_id"),
  amount: real("amount").notNull(),
  type: text("type", { enum: ["income", "expense", "transfer"] }).notNull(),
  note: text("note"),
  date: text("date").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ─── Insert Schemas ──────────────────────────────────────────
export const insertFamilySchema = createInsertSchema(families).omit({ id: true, createdAt: true });
export const insertMemberSchema = createInsertSchema(familyMembers).omit({ id: true, createdAt: true });
export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, createdAt: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });

// ─── Types ────────────────────────────────────────────────────
export type InsertFamily = z.infer<typeof insertFamilySchema>;
export type Family = typeof families.$inferSelect;

export type InsertMember = z.infer<typeof insertMemberSchema>;
export type FamilyMember = typeof familyMembers.$inferSelect;

export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof wallets.$inferSelect;

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── Extended types for frontend ─────────────────────────────
export type TransactionWithDetails = Transaction & {
  member: FamilyMember;
  category: Category;
  wallet: Wallet;
};
