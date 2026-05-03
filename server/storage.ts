import { db } from "./db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import {
  families, familyMembers, wallets, categories, transactions, budgets,
  type Family, type FamilyMember, type Wallet, type Category,
  type Transaction, type TransactionWithDetails,
  type Budget, type BudgetWithProgress,
  type ReportsSummary, type CategoryReport, type MemberReport, type MonthlyTrendPoint,
  type InsertFamily, type InsertMember, type InsertWallet,
  type InsertCategory, type InsertTransaction, type InsertBudget,
} from "@shared/schema";

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
  getFamily(id: number): Family | undefined;
  createFamily(data: InsertFamily): Family;

  // Members
  getMembers(familyId: number): FamilyMember[];
  getMember(id: number): FamilyMember | undefined;
  createMember(data: InsertMember): FamilyMember;
  updateMember(id: number, data: Partial<InsertMember>): FamilyMember | undefined;
  deleteMember(id: number): boolean;

  // Wallets
  getWallets(familyId: number): Wallet[];
  getWallet(id: number): Wallet | undefined;
  createWallet(data: InsertWallet): Wallet;
  updateWallet(id: number, data: Partial<InsertWallet>): Wallet | undefined;
  deleteWallet(id: number): boolean;

  // Categories
  getCategories(familyId?: number): Category[];
  createCategory(data: InsertCategory): Category;
  deleteCategory(id: number): boolean;

  // Budgets
  getBudgets(familyId: number): Budget[];
  getBudgetsWithProgress(familyId: number, month: string): BudgetWithProgress[];
  createBudget(data: InsertBudget): Budget;
  updateBudget(id: number, data: Partial<InsertBudget>): Budget | undefined;
  deleteBudget(id: number): boolean;

  // Transactions
  getTransactions(familyId: number, filters?: { month?: string; memberId?: number; type?: string; q?: string; minAmount?: number; maxAmount?: number }): TransactionWithDetails[];
  getTransaction(id: number): TransactionWithDetails | undefined;
  createTransaction(data: InsertTransaction): Transaction;
  updateTransaction(id: number, data: Partial<InsertTransaction>): Transaction | undefined;
  deleteTransaction(id: number): boolean;

  // Stats
  getMonthlyStats(familyId: number, month: string): { income: number; expense: number; balance: number };
  getReportsSummary(familyId: number, month: string): ReportsSummary;

  // Seed
  seedDefaultData(): void;
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
  private applyBalanceDelta(tx: Tx | typeof db, walletId: number, delta: number) {
    if (delta === 0) return;
    tx.update(wallets)
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

  deleteMember(id: number) {
    const inUse = db.select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.memberId, id))
      .limit(1)
      .get();
    if (inUse) {
      throw new HttpError(409, "Không thể xóa thành viên đang có giao dịch. Hãy chuyển/xóa giao dịch trước.");
    }
    const result = db.delete(familyMembers).where(eq(familyMembers.id, id)).run();
    return result.changes > 0;
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
  updateWallet(id: number, data: Partial<InsertWallet>) {
    const { balance: _ignored, familyId: _ignoredFamily, ...allowed } = data;
    if (Object.keys(allowed).length === 0) {
      return this.getWallet(id);
    }
    return db.update(wallets).set(allowed).where(eq(wallets.id, id)).returning().get();
  }

  deleteWallet(id: number) {
    const inUse = db.select({ id: transactions.id })
      .from(transactions)
      .where(or(eq(transactions.walletId, id), eq(transactions.toWalletId, id)))
      .limit(1)
      .get();
    if (inUse) {
      throw new HttpError(409, "Không thể xóa ví đang có giao dịch. Hãy chuyển/xóa giao dịch trước.");
    }
    const result = db.delete(wallets).where(eq(wallets.id, id)).run();
    return result.changes > 0;
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

  deleteCategory(id: number) {
    const inUse = db.select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.categoryId, id))
      .limit(1)
      .get();
    if (inUse) {
      throw new HttpError(409, "Không thể xóa danh mục đang có giao dịch. Hãy chuyển/xóa giao dịch trước.");
    }
    const result = db.delete(categories).where(eq(categories.id, id)).run();
    return result.changes > 0;
  }

  // ── Budgets ───────────────────────────────────────────────────────
  getBudgets(familyId: number) {
    return db.select().from(budgets).where(eq(budgets.familyId, familyId)).all();
  }

  getBudgetsWithProgress(familyId: number, month: string): BudgetWithProgress[] {
    const list = this.getBudgets(familyId);
    if (list.length === 0) return [];
    const cats = this.getCategories(familyId);
    // One pass over the month's expense rows, summed per category.
    const monthTx = db.select().from(transactions)
      .where(and(eq(transactions.familyId, familyId), eq(transactions.type, "expense"))!)
      .all()
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

  createBudget(data: InsertBudget) {
    if (typeof data.monthlyLimit !== "number" || !Number.isFinite(data.monthlyLimit) || data.monthlyLimit <= 0) {
      throw new HttpError(400, "Hạn mức ngân sách phải lớn hơn 0");
    }
    // Reject budgets bound to non-expense categories — Sprint 3 only models
    // expense budgets; mixing income would make "đã tiêu / hạn mức" misleading.
    const cat = db.select().from(categories).where(eq(categories.id, data.categoryId)).get();
    if (!cat) throw new HttpError(400, "Danh mục không tồn tại");
    if (cat.type !== "expense") throw new HttpError(400, "Chỉ được đặt ngân sách cho danh mục chi tiêu");
    try {
      return db.insert(budgets).values(data).returning().get();
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

  deleteBudget(id: number) {
    const result = db.delete(budgets).where(eq(budgets.id, id)).run();
    return result.changes > 0;
  }

  // ── Transactions ──────────────────────────────────────────────────
  getTransactions(
    familyId: number,
    filters?: { month?: string; memberId?: number; type?: string; q?: string; minAmount?: number; maxAmount?: number },
  ) {
    const all = db.select().from(transactions)
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

    const members = this.getMembers(familyId);
    const cats = this.getCategories(familyId);
    const wals = this.getWallets(familyId);

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

  getTransaction(id: number) {
    const t = db.select().from(transactions).where(eq(transactions.id, id)).get();
    if (!t) return undefined;
    const member = this.getMember(t.memberId);
    const cat = db.select().from(categories).where(eq(categories.id, t.categoryId)).get();
    const wallet = this.getWallet(t.walletId);
    return { ...t, member: member!, category: cat!, wallet: wallet! };
  }

  /**
   * Atomically insert a transaction and apply its delta(s) to the affected wallet(s).
   * Throws `HttpError(400)` if the input shape is invalid (e.g. transfer without `toWalletId`).
   */
  createTransaction(data: InsertTransaction) {
    validateTransactionShape(data);
    return db.transaction((tx) => {
      const inserted = tx.insert(transactions).values(data).returning().get();
      if (inserted.type === "income") {
        this.applyBalanceDelta(tx, inserted.walletId, inserted.amount);
      } else if (inserted.type === "expense") {
        this.applyBalanceDelta(tx, inserted.walletId, -inserted.amount);
      } else if (inserted.type === "transfer") {
        this.applyBalanceDelta(tx, inserted.walletId, -inserted.amount);
        if (inserted.toWalletId != null) {
          this.applyBalanceDelta(tx, inserted.toWalletId, inserted.amount);
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
  updateTransaction(id: number, data: Partial<InsertTransaction>) {
    return db.transaction((tx) => {
      const old = tx.select().from(transactions).where(eq(transactions.id, id)).get();
      if (!old) return undefined;

      const merged = { ...old, ...data } as Transaction;
      validateTransactionShape(merged);

      // Reverse old deltas on every wallet they touched.
      for (const wid of affectedWalletIds(old)) {
        this.applyBalanceDelta(tx, wid, -deltaFor(old, wid));
      }

      const updated = tx.update(transactions).set(data).where(eq(transactions.id, id)).returning().get();
      if (!updated) return undefined;

      // Apply new deltas.
      for (const wid of affectedWalletIds(updated)) {
        this.applyBalanceDelta(tx, wid, deltaFor(updated, wid));
      }

      return updated;
    });
  }

  /** Atomically delete a transaction and reverse its wallet effect(s). */
  deleteTransaction(id: number) {
    return db.transaction((tx) => {
      const old = tx.select().from(transactions).where(eq(transactions.id, id)).get();
      if (!old) return false;

      for (const wid of affectedWalletIds(old)) {
        this.applyBalanceDelta(tx, wid, -deltaFor(old, wid));
      }

      const result = tx.delete(transactions).where(eq(transactions.id, id)).run();
      return result.changes > 0;
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────
  getMonthlyStats(familyId: number, month: string) {
    const txs = this.getTransactions(familyId, { month });
    const income = txs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const walletList = this.getWallets(familyId);
    const balance = walletList.reduce((s, w) => s + w.balance, 0);
    return { income, expense, balance };
  }

  // ── Reports ───────────────────────────────────────────────────────
  getReportsSummary(familyId: number, month: string): ReportsSummary {
    // We pull *all* transactions for the family once (fine for a single-family
    // app — total rows are small), then bucket in JS. Keeps SQL simple and lets
    // us derive multiple aggregates from one scan.
    const all = db.select().from(transactions).where(eq(transactions.familyId, familyId)).all();
    const cats = this.getCategories(familyId);
    const members = this.getMembers(familyId);

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
  seedDefaultData() {
    const existingFamily = db.select().from(families).get();
    if (existingFamily) return;

    const family = this.createFamily({ name: "Gia đình Hậu" });

    const members = [
      { familyId: family.id, name: "Bố (Hậu)", role: "admin" as const, avatarColor: "#01696F" },
      { familyId: family.id, name: "Mẹ (Vợ)", role: "member" as const, avatarColor: "#a12c7b" },
      { familyId: family.id, name: "Bé Lớn", role: "child" as const, avatarColor: "#da7101" },
      { familyId: family.id, name: "Bé Nhỏ", role: "child" as const, avatarColor: "#437a22" },
    ];
    const createdMembers = members.map(m => this.createMember(m));

    const walletData = [
      { familyId: family.id, name: "Tiền mặt", type: "cash" as const, balance: 2_000_000, icon: "banknotes" },
      { familyId: family.id, name: "Ngân hàng VCB", type: "bank" as const, balance: 15_000_000, icon: "building-columns" },
      { familyId: family.id, name: "Tiết kiệm", type: "savings" as const, balance: 50_000_000, icon: "piggy-bank" },
    ];
    const createdWallets = walletData.map(w => this.createWallet(w));

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
    const createdCats = defaultCategories.map(c => this.createCategory(c));

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
    sampleTx.forEach(t => this.createTransaction(t));
  }
}

export { HttpError };
export const storage = new SqliteStorage();
