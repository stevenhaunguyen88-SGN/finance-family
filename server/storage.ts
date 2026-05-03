import { db } from "./db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import {
  families, familyMembers, wallets, categories, transactions,
  type Family, type FamilyMember, type Wallet, type Category,
  type Transaction, type TransactionWithDetails,
  type InsertFamily, type InsertMember, type InsertWallet,
  type InsertCategory, type InsertTransaction,
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

  // Transactions
  getTransactions(familyId: number, filters?: { month?: string; memberId?: number; type?: string }): TransactionWithDetails[];
  getTransaction(id: number): TransactionWithDetails | undefined;
  createTransaction(data: InsertTransaction): Transaction;
  updateTransaction(id: number, data: Partial<InsertTransaction>): Transaction | undefined;
  deleteTransaction(id: number): boolean;

  // Stats
  getMonthlyStats(familyId: number, month: string): { income: number; expense: number; balance: number };

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

  // ── Transactions ──────────────────────────────────────────────────
  getTransactions(familyId: number, filters?: { month?: string; memberId?: number; type?: string }) {
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

    const members = this.getMembers(familyId);
    const cats = this.getCategories(familyId);
    const wals = this.getWallets(familyId);

    return filtered.map(t => ({
      ...t,
      member: members.find(m => m.id === t.memberId)!,
      category: cats.find(c => c.id === t.categoryId)!,
      wallet: wals.find(w => w.id === t.walletId)!,
    }));
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
