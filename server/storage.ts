import { db } from "./db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import {
  families, familyMembers, wallets, categories, transactions, budgets, recurringTransactions, savingsGoals,
  type Family, type FamilyMember, type Wallet, type Category,
  type Transaction, type TransactionWithDetails,
  type Budget, type BudgetWithProgress,
  type RecurringTransaction, type RecurringTransactionWithDetails,
  type SavingsGoal, type InsertSavingsGoal,
  type ReportsSummary, type CategoryReport, type MemberReport, type MonthlyTrendPoint,
  type InsertFamily, type InsertMember, type InsertWallet,
  type InsertCategory, type InsertTransaction, type InsertBudget,
  type InsertRecurringTransaction,
} from "@shared/schema";

type Awaitable<T> = T | Promise<T>;

/** Error subclass that the express error middleware can serialize as an HTTP status. */
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface IStorage {
  // Families
  getFamily(id: number): Awaitable<Family | undefined>;
  createFamily(data: InsertFamily): Awaitable<Family>;

  // Members
  getMembers(familyId: number): Awaitable<FamilyMember[]>;
  getMember(id: number): Awaitable<FamilyMember | undefined>;
  createMember(data: InsertMember): Awaitable<FamilyMember>;
  updateMember(id: number, data: Partial<InsertMember>): Awaitable<FamilyMember | undefined>;
  deleteMember(id: number): Awaitable<boolean>;

  // Wallets
  getWallets(familyId: number): Awaitable<Wallet[]>;
  getWallet(id: number): Awaitable<Wallet | undefined>;
  createWallet(data: InsertWallet): Awaitable<Wallet>;
  updateWallet(id: number, data: Partial<InsertWallet>): Awaitable<Wallet | undefined>;
  deleteWallet(id: number): Awaitable<boolean>;

  // Categories
  getCategories(familyId?: number): Awaitable<Category[]>;
  createCategory(data: InsertCategory): Awaitable<Category>;
  updateCategory(id: number, data: Partial<InsertCategory>): Awaitable<Category | undefined>;
  deleteCategory(id: number): Awaitable<boolean>;

  // Budgets
  getBudgets(familyId: number): Awaitable<Budget[]>;
  getBudgetsWithProgress(familyId: number, month: string): Awaitable<BudgetWithProgress[]>;
  createBudget(data: InsertBudget): Awaitable<Budget>;
  updateBudget(id: number, data: Partial<InsertBudget>): Awaitable<Budget | undefined>;
  deleteBudget(id: number): Awaitable<boolean>;

  // Transactions
  getTransactions(familyId: number, filters?: { month?: string; memberId?: number; type?: string; q?: string; minAmount?: number; maxAmount?: number }): Awaitable<TransactionWithDetails[]>;
  getTransaction(id: number): Awaitable<TransactionWithDetails | undefined>;
  createTransaction(data: InsertTransaction): Awaitable<Transaction>;
  updateTransaction(id: number, data: Partial<InsertTransaction>): Awaitable<Transaction | undefined>;
  deleteTransaction(id: number): Awaitable<boolean>;

  // Recurring Transactions
  getRecurringTransactions(familyId: number): Awaitable<RecurringTransactionWithDetails[]>;
  getRecurringTransaction(id: number): Awaitable<RecurringTransactionWithDetails | undefined>;
  createRecurringTransaction(data: InsertRecurringTransaction): Awaitable<RecurringTransaction>;
  updateRecurringTransaction(id: number, data: Partial<InsertRecurringTransaction>): Awaitable<RecurringTransaction | undefined>;
  deleteRecurringTransaction(id: number): Awaitable<boolean>;
  processDueRecurringTransactions(familyId: number): Awaitable<number>;

  // Savings Goals
  getSavingsGoals(familyId: number): Awaitable<SavingsGoal[]>;
  getSavingsGoal(id: number): Awaitable<SavingsGoal | undefined>;
  createSavingsGoal(data: InsertSavingsGoal): Awaitable<SavingsGoal>;
  updateSavingsGoal(id: number, data: Partial<InsertSavingsGoal>): Awaitable<SavingsGoal | undefined>;
  deleteSavingsGoal(id: number): Awaitable<boolean>;
  contributeSavingsGoal(id: number, amount: number): Awaitable<SavingsGoal | undefined>;

  // Stats
  getMonthlyStats(familyId: number, month: string): Awaitable<{ income: number; expense: number; balance: number }>;
  getReportsSummary(familyId: number, month: string): Awaitable<ReportsSummary>;

  // Seed
  seedDefaultData(): Awaitable<void>;
}

/** Drizzle's transaction handle (better-sqlite3 driver). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Returns the +/- delta a transaction applies to a given wallet:
 *   - income to walletId:   +amount
 *   - expense from walletId: -amount
 *   - transfer: -amount from walletId, +amount to toWalletId
 *
 * `null` means the transaction has no effect on that wallet.
 */
function deltaFor(t: Pick<Transaction, "type" | "amount" | "walletId" | "toWalletId">, walletId: number): number {
  if (t.type === "income" && t.walletId === walletId) return t.amount;
  if (t.type === "expense" && t.walletId === walletId) return -t.amount;
  if (t.type === "transfer") {
    if (t.walletId === walletId) return -t.amount;
    if (t.toWalletId === walletId) return t.amount;
  }
  return 0;
}

/** All wallet ids touched by a transaction (1 for income/expense, 2 for transfer). */
function affectedWalletIds(t: Pick<Transaction, "type" | "walletId" | "toWalletId">): number[] {
  if (t.type === "transfer" && t.toWalletId != null) {
    return [t.walletId, t.toWalletId];
  }
  return [t.walletId];
}

/** Return the "YYYY-MM" string for the month immediately before `month`. */
function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  // m is 1..12; new Date(y, 0, 1) is January, so passing m-2 yields last month.
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Six "YYYY-MM" strings ending at `month`, oldest first. */
function lastSixMonthsEnding(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Advance a date by the given frequency. Returns "YYYY-MM-DD". */
function advanceDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr + "T00:00:00");
  switch (frequency) {
    case "daily":   d.setDate(d.getDate() + 1); break;
    case "weekly":  d.setDate(d.getDate() + 7); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "yearly":  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().split("T")[0];
}

/** Validate the shape of a transaction before insert/update. Throws `HttpError(400)` on bad input. */
function validateTransactionShape(data: Pick<InsertTransaction, "type" | "amount" | "walletId" | "toWalletId">) {
  if (typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount <= 0) {
    throw new HttpError(400, "Số tiền phải lớn hơn 0");
  }
  if (data.type === "transfer") {
    if (data.toWalletId == null) {
      throw new HttpError(400, "Chuyển khoản phải có ví đến (toWalletId)");
    }
    if (data.toWalletId === data.walletId) {
      throw new HttpError(400, "Ví nguồn và ví đích phải khác nhau");
    }
  } else if (data.toWalletId != null) {
    throw new HttpError(400, "Chỉ giao dịch chuyển khoản mới có ví đích");
  }
}

class SqliteStorage implements IStorage {
  // ── Internal helpers (work inside or outside a tx) ────────────────
  private async applyBalanceDelta(tx: Tx | typeof db, walletId: number, delta: number) {
    if (delta === 0) return;
    await tx.update(wallets)
      .set({ balance: sql`${wallets.balance} + ${delta}` })
      .where(eq(wallets.id, walletId))
      .run();
  }

  // ── Families ──────────────────────────────────────────────────────
  getFamily(id: number) {
    return db.select().from(families).where(eq(families.id, id)).get();
  }

  createFamily(data: InsertFamily) {
    return db.insert(families).values(data).returning().get();
  }

  // ── Members ───────────────────────────────────────────────────────
  getMembers(familyId: number) {
    return db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId)).all();
  }

  getMember(id: number) {
    return db.select().from(familyMembers).where(eq(familyMembers.id, id)).get();
  }

  createMember(data: InsertMember) {
    return db.insert(familyMembers).values(data).returning().get();
  }

  updateMember(id: number, data: Partial<InsertMember>) {
    return db.update(familyMembers).set(data).where(eq(familyMembers.id, id)).returning().get();
  }

  async deleteMember(id: number) {
    const inUse = await db.select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.memberId, id))
      .limit(1)
      .get();
    if (inUse) {
      throw new HttpError(409, "Không thể xóa thành viên đang có giao dịch. Hãy chuyển/xóa giao dịch trước.");
    }
    const result = await db.delete(familyMembers).where(eq(familyMembers.id, id)).run();
    return result.rowsAffected > 0;
  }

  // ── Wallets ───────────────────────────────────────────────────────
  getWallets(familyId: number) {
    return db.select().from(wallets).where(eq(wallets.familyId, familyId)).all();
  }

  getWallet(id: number) {
    return db.select().from(wallets).where(eq(wallets.id, id)).get();
  }

  createWallet(data: InsertWallet) {
    return db.insert(wallets).values(data).returning().get();
  }

  /**
   * Wallet `balance` is a derived value computed by adding initial balance + sum of transactions.
   * Direct edits via PATCH bypass the audit trail, so we strip `balance` from updates.
   * To adjust a balance after the fact, create an `income` or `expense` transaction in the
   * "Khác" / adjustment category instead.
   */
  async updateWallet(id: number, data: Partial<InsertWallet>) {
    const { balance: _ignored, familyId: _ignoredFamily, ...allowed } = data;
    if (Object.keys(allowed).length === 0) {
      return this.getWallet(id);
    }
    return db.update(wallets).set(allowed).where(eq(wallets.id, id)).returning().get();
  }

  async deleteWallet(id: number) {
    const inUse = await db.select({ id: transactions.id })
      .from(transactions)
      .where(or(eq(transactions.walletId, id), eq(transactions.toWalletId, id)))
      .limit(1)
      .get();
    if (inUse) {
      throw new HttpError(409, "Không thể xóa ví đang có giao dịch. Hãy chuyển/xóa giao dịch trước.");
    }
    const result = await db.delete(wallets).where(eq(wallets.id, id)).run();
    return result.rowsAffected > 0;
  }

  // ── Categories ────────────────────────────────────────────────────
  getCategories(familyId?: number) {
    if (familyId) {
      return db.select().from(categories).where(
        or(eq(categories.isDefault, true), eq(categories.familyId, familyId))
      ).all();
    }
    return db.select().from(categories).where(eq(categories.isDefault, true)).all();
  }

  createCategory(data: InsertCategory) {
    return db.insert(categories).values(data).returning().get();
  }

  async updateCategory(id: number, data: Partial<InsertCategory>) {
    const existing = await db.select().from(categories).where(eq(categories.id, id)).get();
    if (!existing) return undefined;
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.icon !== undefined) updates.icon = data.icon;
    if (data.color !== undefined) updates.color = data.color;
    if (data.type !== undefined) updates.type = data.type;
    if (Object.keys(updates).length === 0) return existing;
    await db.update(categories).set(updates).where(eq(categories.id, id)).run();
    return db.select().from(categories).where(eq(categories.id, id)).get();
  }

  async deleteCategory(id: number) {
    const inUse = await db.select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.categoryId, id))
      .limit(1)
      .get();
    if (inUse) {
      throw new HttpError(409, "Không thể xóa danh mục đang có giao dịch. Hãy chuyển/xóa giao dịch trước.");
    }
    const result = await db.delete(categories).where(eq(categories.id, id)).run();
    return result.rowsAffected > 0;
  }

  // ── Budgets ───────────────────────────────────────────────────────
  getBudgets(familyId: number) {
    return db.select().from(budgets).where(eq(budgets.familyId, familyId)).all();
  }

  async getBudgetsWithProgress(familyId: number, month: string): Promise<BudgetWithProgress[]> {
    const list = await this.getBudgets(familyId);
    if (list.length === 0) return [];
    const cats = await this.getCategories(familyId);
    // One pass over the month's expense rows, summed per category.
    const monthTx = (await db.select().from(transactions)
      .where(and(eq(transactions.familyId, familyId), eq(transactions.type, "expense"))!)
      .all())
      .filter(t => t.date.startsWith(month));
    const spentByCat = new Map<number, number>();
    for (const t of monthTx) {
      spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) ?? 0) + t.amount);
    }
    return list.map(b => {
      const category = cats.find(c => c.id === b.categoryId)!;
      const spent = spentByCat.get(b.categoryId) ?? 0;
      const remaining = b.monthlyLimit - spent;
      const percent = b.monthlyLimit > 0 ? Math.round((spent / b.monthlyLimit) * 100) : 0;
      return { ...b, category, spent, remaining, percent };
    });
  }

  async createBudget(data: InsertBudget) {
    if (typeof data.monthlyLimit !== "number" || !Number.isFinite(data.monthlyLimit) || data.monthlyLimit <= 0) {
      throw new HttpError(400, "Hạn mức ngân sách phải lớn hơn 0");
    }
    // Reject budgets bound to non-expense categories — Sprint 3 only models
    // expense budgets; mixing income would make "đã tiêu / hạn mức" misleading.
    const cat = await db.select().from(categories).where(eq(categories.id, data.categoryId)).get();
    if (!cat) throw new HttpError(400, "Danh mục không tồn tại");
    if (cat.type !== "expense") throw new HttpError(400, "Chỉ được đặt ngân sách cho danh mục chi tiêu");
    try {
      return await db.insert(budgets).values(data).returning().get();
    } catch (err: any) {
      // SQLite UNIQUE(family_id, category_id) violation → friendlier message.
      if (String(err?.message || "").includes("UNIQUE")) {
        throw new HttpError(409, "Danh mục này đã có ngân sách. Hãy sửa hạn mức hiện tại.");
      }
      throw err;
    }
  }

  updateBudget(id: number, data: Partial<InsertBudget>) {
    if (data.monthlyLimit != null) {
      if (typeof data.monthlyLimit !== "number" || !Number.isFinite(data.monthlyLimit) || data.monthlyLimit <= 0) {
        throw new HttpError(400, "Hạn mức ngân sách phải lớn hơn 0");
      }
    }
    // Don't let callers reassign categoryId — that would silently change which
    // category this budget tracks. Force them to delete + create.
    const { categoryId: _ignored, familyId: _ignored2, ...rest } = data;
    const updated = db.update(budgets).set(rest).where(eq(budgets.id, id)).returning().get();
    return updated;
  }

  async deleteBudget(id: number) {
    const result = await db.delete(budgets).where(eq(budgets.id, id)).run();
    return result.rowsAffected > 0;
  }

  // ── Transactions ──────────────────────────────────────────────────
  async getTransactions(
    familyId: number,
    filters?: { month?: string; memberId?: number; type?: string; q?: string; minAmount?: number; maxAmount?: number },
  ) {
    const all = await db.select().from(transactions)
      .where(eq(transactions.familyId, familyId))
      .orderBy(desc(transactions.date))
      .all();

    let filtered = all;
    if (filters?.month) {
      filtered = filtered.filter(t => t.date.startsWith(filters.month!));
    }
    if (filters?.memberId) {
      filtered = filtered.filter(t => t.memberId === filters.memberId);
    }
    if (filters?.type && filters.type !== "all") {
      filtered = filtered.filter(t => t.type === filters.type);
    }
    if (filters?.minAmount != null) {
      const min = filters.minAmount;
      filtered = filtered.filter(t => t.amount >= min);
    }
    if (filters?.maxAmount != null) {
      const max = filters.maxAmount;
      filtered = filtered.filter(t => t.amount <= max);
    }

    const members = await this.getMembers(familyId);
    const cats = await this.getCategories(familyId);
    const wals = await this.getWallets(familyId);

    // Free-text search runs after we've joined member/category so the user can
    // match against the displayed labels (e.g. "Lương", "Mẹ", "Ăn uống") and
    // not just the raw note.
    let withDetails = filtered.map(t => ({
      ...t,
      member: members.find(m => m.id === t.memberId)!,
      category: cats.find(c => c.id === t.categoryId)!,
      wallet: wals.find(w => w.id === t.walletId)!,
    }));

    if (filters?.q && filters.q.trim()) {
      const needle = filters.q.trim().toLowerCase();
      withDetails = withDetails.filter(t => {
        return (
          (t.note ?? "").toLowerCase().includes(needle) ||
          (t.category?.name ?? "").toLowerCase().includes(needle) ||
          (t.member?.name ?? "").toLowerCase().includes(needle) ||
          (t.wallet?.name ?? "").toLowerCase().includes(needle)
        );
      });
    }

    return withDetails;
  }

  async getTransaction(id: number) {
    const t = await db.select().from(transactions).where(eq(transactions.id, id)).get();
    if (!t) return undefined;
    const member = await this.getMember(t.memberId);
    const cat = await db.select().from(categories).where(eq(categories.id, t.categoryId)).get();
    const wallet = await this.getWallet(t.walletId);
    return { ...t, member: member!, category: cat!, wallet: wallet! };
  }

  /**
   * Atomically insert a transaction and apply its delta(s) to the affected wallet(s).
   * Throws `HttpError(400)` if the input shape is invalid (e.g. transfer without `toWalletId`).
   */
  async createTransaction(data: InsertTransaction) {
    validateTransactionShape(data);
    return db.transaction(async (tx) => {
      const inserted = await tx.insert(transactions).values(data).returning().get();
      if (inserted.type === "income") {
        await this.applyBalanceDelta(tx, inserted.walletId, inserted.amount);
      } else if (inserted.type === "expense") {
        await this.applyBalanceDelta(tx, inserted.walletId, -inserted.amount);
      } else if (inserted.type === "transfer") {
        await this.applyBalanceDelta(tx, inserted.walletId, -inserted.amount);
        if (inserted.toWalletId != null) {
          await this.applyBalanceDelta(tx, inserted.toWalletId, inserted.amount);
        }
      }
      return inserted;
    });
  }

  /**
   * Atomically reverse the old transaction's wallet effects, then apply the patched
   * transaction's effects. If the patch changes type, walletId, toWalletId, or amount,
   * balance(s) stay correct end-to-end.
   */
  async updateTransaction(id: number, data: Partial<InsertTransaction>) {
    return db.transaction(async (tx) => {
      const old = await tx.select().from(transactions).where(eq(transactions.id, id)).get();
      if (!old) return undefined;

      const merged = { ...old, ...data } as Transaction;
      validateTransactionShape(merged);

      // Reverse old deltas on every wallet they touched.
      for (const wid of affectedWalletIds(old)) {
        await this.applyBalanceDelta(tx, wid, -deltaFor(old, wid));
      }

      const updated = await tx.update(transactions).set(data).where(eq(transactions.id, id)).returning().get();
      if (!updated) return undefined;

      // Apply new deltas.
      for (const wid of affectedWalletIds(updated)) {
        await this.applyBalanceDelta(tx, wid, deltaFor(updated, wid));
      }

      return updated;
    });
  }

  /** Atomically delete a transaction and reverse its wallet effect(s). */
  async deleteTransaction(id: number) {
    return db.transaction(async (tx) => {
      const old = await tx.select().from(transactions).where(eq(transactions.id, id)).get();
      if (!old) return false;

      for (const wid of affectedWalletIds(old)) {
        await this.applyBalanceDelta(tx, wid, -deltaFor(old, wid));
      }

      const result = await tx.delete(transactions).where(eq(transactions.id, id)).run();
      return result.rowsAffected > 0;
    });
  }

  // ── Recurring Transactions ─────────────────────────────────────────
  async getRecurringTransactions(familyId: number): Promise<RecurringTransactionWithDetails[]> {
    const all = await db.select().from(recurringTransactions)
      .where(eq(recurringTransactions.familyId, familyId))
      .all();
    const members = await this.getMembers(familyId);
    const cats = await this.getCategories(familyId);
    const wals = await this.getWallets(familyId);
    return all.map(r => ({
      ...r,
      member: members.find(m => m.id === r.memberId)!,
      category: cats.find(c => c.id === r.categoryId)!,
      wallet: wals.find(w => w.id === r.walletId)!,
    }));
  }

  async getRecurringTransaction(id: number): Promise<RecurringTransactionWithDetails | undefined> {
    const r = await db.select().from(recurringTransactions).where(eq(recurringTransactions.id, id)).get();
    if (!r) return undefined;
    const member = await this.getMember(r.memberId);
    const cat = await db.select().from(categories).where(eq(categories.id, r.categoryId)).get();
    const wallet = await this.getWallet(r.walletId);
    return { ...r, member: member!, category: cat!, wallet: wallet! };
  }

  async createRecurringTransaction(data: InsertRecurringTransaction): Promise<RecurringTransaction> {
    validateTransactionShape(data);
    return db.insert(recurringTransactions).values(data).returning().get();
  }

  async updateRecurringTransaction(id: number, data: Partial<InsertRecurringTransaction>): Promise<RecurringTransaction | undefined> {
    if (data.amount != null) {
      validateTransactionShape({ ...data, type: data.type ?? "expense", walletId: data.walletId ?? 0, toWalletId: data.toWalletId } as any);
    }
    return db.update(recurringTransactions).set(data).where(eq(recurringTransactions.id, id)).returning().get();
  }

  async deleteRecurringTransaction(id: number): Promise<boolean> {
    const result = await db.delete(recurringTransactions).where(eq(recurringTransactions.id, id)).run();
    return result.rowsAffected > 0;
  }

  async processDueRecurringTransactions(familyId: number): Promise<number> {
    const today = new Date().toISOString().split("T")[0];
    const active = (await db.select().from(recurringTransactions)
      .where(and(
        eq(recurringTransactions.familyId, familyId),
        eq(recurringTransactions.isActive, true),
      )!)
      .all())
      .filter(r => r.nextDueDate <= today && (!r.endDate || r.nextDueDate <= r.endDate));

    let created = 0;
    for (const r of active) {
      let dueDate = r.nextDueDate;
      while (dueDate <= today && (!r.endDate || dueDate <= r.endDate)) {
        await this.createTransaction({
          familyId: r.familyId,
          memberId: r.memberId,
          categoryId: r.categoryId,
          walletId: r.walletId,
          toWalletId: r.toWalletId,
          amount: r.amount,
          type: r.type,
          note: r.note ? `${r.note} (tự động)` : "(giao dịch tự động)",
          date: dueDate,
        });
        created++;
        dueDate = advanceDate(dueDate, r.frequency);
      }

      const pastEnd = r.endDate && dueDate > r.endDate;
      await db.update(recurringTransactions).set({
        nextDueDate: dueDate,
        lastGeneratedDate: today,
        isActive: pastEnd ? false : true,
      }).where(eq(recurringTransactions.id, r.id)).run();
    }
    return created;
  }

  // ── Savings Goals ────────────────────────────────────────────────
  getSavingsGoals(familyId: number) {
    return db.select().from(savingsGoals).where(eq(savingsGoals.familyId, familyId)).all();
  }

  getSavingsGoal(id: number) {
    return db.select().from(savingsGoals).where(eq(savingsGoals.id, id)).get();
  }

  createSavingsGoal(data: InsertSavingsGoal) {
    return db.insert(savingsGoals).values(data).returning().get();
  }

  async updateSavingsGoal(id: number, data: Partial<InsertSavingsGoal>) {
    const existing = await db.select().from(savingsGoals).where(eq(savingsGoals.id, id)).get();
    if (!existing) return undefined;
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.icon !== undefined) updates.icon = data.icon;
    if (data.color !== undefined) updates.color = data.color;
    if (data.targetAmount !== undefined) updates.targetAmount = data.targetAmount;
    if (data.deadline !== undefined) updates.deadline = data.deadline;
    if (data.note !== undefined) updates.note = data.note;
    if (data.isCompleted !== undefined) updates.isCompleted = data.isCompleted;
    if (Object.keys(updates).length === 0) return existing;
    await db.update(savingsGoals).set(updates).where(eq(savingsGoals.id, id)).run();
    return db.select().from(savingsGoals).where(eq(savingsGoals.id, id)).get();
  }

  async deleteSavingsGoal(id: number) {
    const result = await db.delete(savingsGoals).where(eq(savingsGoals.id, id)).run();
    return result.rowsAffected > 0;
  }

  async contributeSavingsGoal(id: number, amount: number) {
    const goal = await db.select().from(savingsGoals).where(eq(savingsGoals.id, id)).get();
    if (!goal) return undefined;
    const newAmount = goal.currentAmount + amount;
    const isCompleted = newAmount >= goal.targetAmount;
    await db.update(savingsGoals)
      .set({ currentAmount: Math.max(0, newAmount), isCompleted })
      .where(eq(savingsGoals.id, id))
      .run();
    return db.select().from(savingsGoals).where(eq(savingsGoals.id, id)).get();
  }

  // ── Stats ─────────────────────────────────────────────────────────
  async getMonthlyStats(familyId: number, month: string) {
    const txs = await this.getTransactions(familyId, { month });
    const income = txs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const walletList = await this.getWallets(familyId);
    const balance = walletList.reduce((s, w) => s + w.balance, 0);
    return { income, expense, balance };
  }

  // ── Reports ───────────────────────────────────────────────────────
  async getReportsSummary(familyId: number, month: string): Promise<ReportsSummary> {
    // We pull *all* transactions for the family once (fine for a single-family
    // app — total rows are small), then bucket in JS. Keeps SQL simple and lets
    // us derive multiple aggregates from one scan.
    const all = await db.select().from(transactions).where(eq(transactions.familyId, familyId)).all();
    const cats = await this.getCategories(familyId);
    const members = await this.getMembers(familyId);

    const prevMonth = previousMonth(month);

    // Category totals for selected & previous month (expense only — income is
    // not what people care about when reading "where did the money go").
    const catTotalsThisMonth = new Map<number, number>();
    const catTotalsPrevMonth = new Map<number, number>();
    const memberTotals = new Map<number, number>();
    let totalIncome = 0;
    let totalExpense = 0;

    // Trailing-six-months trend, including the selected month as the right edge.
    const trendMonths = lastSixMonthsEnding(month);
    const trendIndex = new Map(trendMonths.map((m, i) => [m, i]));
    const trend: MonthlyTrendPoint[] = trendMonths.map(m => ({ month: m, income: 0, expense: 0 }));

    for (const t of all) {
      const m = t.date.slice(0, 7);

      if (m === month) {
        if (t.type === "income") totalIncome += t.amount;
        if (t.type === "expense") {
          totalExpense += t.amount;
          catTotalsThisMonth.set(t.categoryId, (catTotalsThisMonth.get(t.categoryId) ?? 0) + t.amount);
          memberTotals.set(t.memberId, (memberTotals.get(t.memberId) ?? 0) + t.amount);
        }
      } else if (m === prevMonth && t.type === "expense") {
        catTotalsPrevMonth.set(t.categoryId, (catTotalsPrevMonth.get(t.categoryId) ?? 0) + t.amount);
      }

      const trendIdx = trendIndex.get(m);
      if (trendIdx != null) {
        if (t.type === "income") trend[trendIdx].income += t.amount;
        if (t.type === "expense") trend[trendIdx].expense += t.amount;
      }
    }

    const byCategory: CategoryReport[] = [];
    catTotalsThisMonth.forEach((total, catId) => {
      const cat = cats.find(c => c.id === catId);
      if (!cat) return;
      const prev = catTotalsPrevMonth.get(catId) ?? 0;
      const changePercent = prev === 0 ? null : Math.round(((total - prev) / prev) * 100);
      byCategory.push({
        categoryId: cat.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        total,
        prevTotal: prev,
        changePercent,
      });
    });
    byCategory.sort((a, b) => b.total - a.total);

    const byMember: MemberReport[] = [];
    memberTotals.forEach((totalE, memId) => {
      const mem = members.find(m => m.id === memId);
      if (!mem) return;
      byMember.push({
        memberId: mem.id,
        name: mem.name,
        avatarColor: mem.avatarColor,
        totalExpense: totalE,
      });
    });
    byMember.sort((a, b) => b.totalExpense - a.totalExpense);

    return {
      month,
      totalIncome,
      totalExpense,
      byCategory,
      byMember,
      lastSixMonths: trend,
    };
  }

  // ── Seed ──────────────────────────────────────────────────────────
  async seedDefaultData() {
    const existingFamily = await db.select().from(families).get();
    if (existingFamily) return;

    const family = await this.createFamily({ name: "Gia đình Hậu" });

    const members = [
      { familyId: family.id, name: "Bố (Hậu)", role: "admin" as const, avatarColor: "#01696F" },
      { familyId: family.id, name: "Mẹ (Vợ)", role: "member" as const, avatarColor: "#a12c7b" },
      { familyId: family.id, name: "Bé Lớn", role: "child" as const, avatarColor: "#da7101" },
      { familyId: family.id, name: "Bé Nhỏ", role: "child" as const, avatarColor: "#437a22" },
    ];
    const createdMembers = await Promise.all(members.map(m => this.createMember(m)));

    const walletData = [
      { familyId: family.id, name: "Tiền mặt", type: "cash" as const, balance: 2_000_000, icon: "banknotes" },
      { familyId: family.id, name: "Ngân hàng VCB", type: "bank" as const, balance: 15_000_000, icon: "building-columns" },
      { familyId: family.id, name: "Tiết kiệm", type: "savings" as const, balance: 50_000_000, icon: "piggy-bank" },
    ];
    const createdWallets = await Promise.all(walletData.map(w => this.createWallet(w)));

    const defaultCategories = [
      // Thu nhập
      { name: "Lương", icon: "💰", type: "income" as const, color: "#437a22", isDefault: true },
      { name: "Thưởng", icon: "🎁", type: "income" as const, color: "#437a22", isDefault: true },
      { name: "Đầu tư", icon: "📈", type: "income" as const, color: "#006494", isDefault: true },
      { name: "Khác (Thu)", icon: "➕", type: "income" as const, color: "#437a22", isDefault: true },
      // Chi tiêu
      { name: "Ăn uống", icon: "🍜", type: "expense" as const, color: "#da7101", isDefault: true },
      { name: "Di chuyển", icon: "🚗", type: "expense" as const, color: "#964219", isDefault: true },
      { name: "Học phí", icon: "📚", type: "expense" as const, color: "#7a39bb", isDefault: true },
      { name: "Sức khỏe", icon: "🏥", type: "expense" as const, color: "#a12c7b", isDefault: true },
      { name: "Hóa đơn", icon: "💡", type: "expense" as const, color: "#d19900", isDefault: true },
      { name: "Mua sắm", icon: "🛒", type: "expense" as const, color: "#da7101", isDefault: true },
      { name: "Nhà ở", icon: "🏠", type: "expense" as const, color: "#964219", isDefault: true },
      { name: "Giải trí", icon: "🎮", type: "expense" as const, color: "#7a39bb", isDefault: true },
      { name: "Khác (Chi)", icon: "💸", type: "expense" as const, color: "#a13544", isDefault: true },
    ];
    const createdCats = await Promise.all(defaultCategories.map(c => this.createCategory(c)));

    // Seed sample transactions in the current month. Recompute wallet balances afterward
    // so the seeded "starting balance" + tx history stays self-consistent.
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const sampleTx: InsertTransaction[] = [
      { familyId: family.id, memberId: createdMembers[0].id, categoryId: createdCats[0].id, walletId: createdWallets[1].id, amount: 25_000_000, type: "income", note: "Lương tháng 5", date: `${month}-01` },
      { familyId: family.id, memberId: createdMembers[1].id, categoryId: createdCats[0].id, walletId: createdWallets[1].id, amount: 18_000_000, type: "income", note: "Lương vợ", date: `${month}-01` },
      { familyId: family.id, memberId: createdMembers[0].id, categoryId: createdCats[4].id, walletId: createdWallets[0].id, amount: 1_500_000, type: "expense", note: "Tiền ăn tuần 1", date: `${month}-03` },
      { familyId: family.id, memberId: createdMembers[1].id, categoryId: createdCats[9].id, walletId: createdWallets[0].id, amount: 800_000, type: "expense", note: "Mua đồ cho con", date: `${month}-04` },
      { familyId: family.id, memberId: createdMembers[0].id, categoryId: createdCats[10].id, walletId: createdWallets[1].id, amount: 5_000_000, type: "expense", note: "Tiền nhà tháng 5", date: `${month}-05` },
      { familyId: family.id, memberId: createdMembers[1].id, categoryId: createdCats[6].id, walletId: createdWallets[1].id, amount: 3_500_000, type: "expense", note: "Học phí bé lớn", date: `${month}-06` },
    ];
    for (const t of sampleTx) {
      await this.createTransaction(t);
    }
  }
}

export { HttpError };
export const storage = new SqliteStorage();
