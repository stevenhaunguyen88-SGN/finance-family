import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage } from "./storage";
import {
  insertTransactionSchema,
  insertWalletSchema,
  insertMemberSchema,
  insertCategorySchema,
  insertBudgetSchema,
  insertRecurringTransactionSchema,
} from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";

const FAMILY_ID = 1; // Single family app

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ── Seed default data ────────────────────────────────────────────
  storage.seedDefaultData();

  // ── Family ───────────────────────────────────────────────────────
  app.get("/api/family", (_req, res) => {
    const family = storage.getFamily(FAMILY_ID);
    res.json(family);
  });

  // ── Members ──────────────────────────────────────────────────────
  app.get("/api/members", (_req, res) => {
    const members = storage.getMembers(FAMILY_ID);
    res.json(members);
  });

  app.post("/api/members", (req, res) => {
    const result = insertMemberSchema.safeParse({ ...req.body, familyId: FAMILY_ID });
    if (!result.success) return res.status(400).json({ message: "Invalid member data", details: result.error.flatten() });
    const member = storage.createMember(result.data);
    res.status(201).json(member);
  });

  app.patch("/api/members/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateMember(id, req.body);
    if (!updated) return res.status(404).json({ message: "Member not found" });
    res.json(updated);
  });

  app.delete("/api/members/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const ok = storage.deleteMember(id);
    if (!ok) return res.status(404).json({ message: "Member not found" });
    res.json({ success: true });
  });

  // ── Wallets ──────────────────────────────────────────────────────
  app.get("/api/wallets", (_req, res) => {
    const w = storage.getWallets(FAMILY_ID);
    res.json(w);
  });

  app.post("/api/wallets", (req, res) => {
    const result = insertWalletSchema.safeParse({ ...req.body, familyId: FAMILY_ID });
    if (!result.success) return res.status(400).json({ message: "Invalid wallet data", details: result.error.flatten() });
    const wallet = storage.createWallet(result.data);
    res.status(201).json(wallet);
  });

  app.patch("/api/wallets/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateWallet(id, req.body);
    if (!updated) return res.status(404).json({ message: "Wallet not found" });
    res.json(updated);
  });

  app.delete("/api/wallets/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const ok = storage.deleteWallet(id);
    if (!ok) return res.status(404).json({ message: "Wallet not found" });
    res.json({ success: true });
  });

  // ── Categories ───────────────────────────────────────────────────
  app.get("/api/categories", (_req, res) => {
    const cats = storage.getCategories(FAMILY_ID);
    res.json(cats);
  });

  // Create a new category. Allows families to define their own income/expense categories.
  // The request body should include at least a `name` and `type` field. Optional `icon` and `color`
  // can be provided. The familyId is automatically set to the current family.
  app.post("/api/categories", (req, res) => {
    const payload = { ...req.body, familyId: FAMILY_ID };
    // Validate input using zod. `omit({ id: true })` ensures id is not provided by client.
    const result = insertCategorySchema.safeParse(payload);
    if (!result.success) {
      return res.status(400).json({ message: "Invalid category data", details: result.error.flatten() });
    }
    const category = storage.createCategory(result.data);
    return res.status(201).json(category);
  });

  // Update a category. Only non-default categories can be edited.
  app.patch("/api/categories/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const cats = storage.getCategories(FAMILY_ID);
    const target = cats.find(c => c.id === id);
    if (!target) return res.status(404).json({ message: "Category not found" });
    if (target.isDefault) return res.status(400).json({ message: "Không thể sửa danh mục mặc định" });
    const updated = storage.updateCategory(id, req.body);
    if (!updated) return res.status(404).json({ message: "Category not found" });
    res.json(updated);
  });

  // Delete a category by id. Only non-default categories belonging to the family can be removed.
  app.delete("/api/categories/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const cats = storage.getCategories(FAMILY_ID);
    const target = cats.find(c => c.id === id);
    if (!target) {
      return res.status(404).json({ message: "Category not found" });
    }
    if (target.isDefault) {
      return res.status(400).json({ message: "Không thể xóa danh mục mặc định" });
    }
    const ok = storage.deleteCategory(id);
    if (!ok) {
      return res.status(404).json({ message: "Category not found" });
    }
    return res.json({ success: true });
  });

  // ── Budgets ──────────────────────────────────────────────────────
  app.get("/api/budgets", (req, res) => {
    const month = (req.query.month as string | undefined) ?? "";
    if (month) {
      // When a month is provided, return progress for each budget so the UI
      // can render bars without firing /api/transactions a second time.
      return res.json(storage.getBudgetsWithProgress(FAMILY_ID, month));
    }
    res.json(storage.getBudgets(FAMILY_ID));
  });

  app.post("/api/budgets", (req, res) => {
    const result = insertBudgetSchema.safeParse({ ...req.body, familyId: FAMILY_ID });
    if (!result.success) return res.status(400).json({ message: "Dữ liệu ngân sách không hợp lệ", details: result.error.flatten() });
    const created = storage.createBudget(result.data);
    res.status(201).json(created);
  });

  app.patch("/api/budgets/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateBudget(id, req.body);
    if (!updated) return res.status(404).json({ message: "Budget not found" });
    res.json(updated);
  });

  app.delete("/api/budgets/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const ok = storage.deleteBudget(id);
    if (!ok) return res.status(404).json({ message: "Budget not found" });
    res.json({ success: true });
  });

  // ── Transactions ─────────────────────────────────────────────────
  app.get("/api/transactions", (req, res) => {
    const { month, memberId, type, q, minAmount, maxAmount } = req.query;
    const txs = storage.getTransactions(FAMILY_ID, {
      month: month as string,
      memberId: memberId ? parseInt(memberId as string) : undefined,
      type: type as string,
      q: q as string | undefined,
      minAmount: minAmount ? Number(minAmount) : undefined,
      maxAmount: maxAmount ? Number(maxAmount) : undefined,
    });
    res.json(txs);
  });

  // CSV export. Same filters as GET /api/transactions; includes a UTF-8 BOM so
  // Excel on Windows opens it without mojibake on Vietnamese characters.
  app.get("/api/transactions/export.csv", (req, res) => {
    const { month, memberId, type, q, minAmount, maxAmount } = req.query;
    const txs = storage.getTransactions(FAMILY_ID, {
      month: month as string,
      memberId: memberId ? parseInt(memberId as string) : undefined,
      type: type as string,
      q: q as string | undefined,
      minAmount: minAmount ? Number(minAmount) : undefined,
      maxAmount: maxAmount ? Number(maxAmount) : undefined,
    });
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      // Wrap in quotes when the cell contains a quote / comma / newline.
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const rows = [
      ["Ngày", "Loại", "Danh mục", "Thành viên", "Ví", "Số tiền (VND)", "Ghi chú"],
      ...txs.map(t => [
        t.date,
        t.type === "income" ? "Thu" : t.type === "expense" ? "Chi" : "Chuyển",
        t.category?.name ?? "",
        t.member?.name ?? "",
        t.wallet?.name ?? "",
        t.amount,
        t.note ?? "",
      ]),
    ];
    const csv = "\ufeff" + rows.map(r => r.map(escape).join(",")).join("\r\n");
    const filename = month ? `giao-dich-${month}.csv` : `giao-dich.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  });

  app.get("/api/transactions/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const tx = storage.getTransaction(id);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });
    res.json(tx);
  });

  app.post("/api/transactions", (req, res) => {
    const result = insertTransactionSchema.safeParse({ ...req.body, familyId: FAMILY_ID });
    if (!result.success) return res.status(400).json({ message: "Invalid transaction data", details: result.error.flatten() });
    const tx = storage.createTransaction(result.data);
    res.status(201).json(tx);
  });

  app.patch("/api/transactions/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateTransaction(id, req.body);
    if (!updated) return res.status(404).json({ message: "Transaction not found" });
    res.json(updated);
  });

  app.delete("/api/transactions/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const ok = storage.deleteTransaction(id);
    if (!ok) return res.status(404).json({ message: "Transaction not found" });
    res.json({ success: true });
  });

  // ── Stats ────────────────────────────────────────────────────────
  app.get("/api/stats/:month", (req, res) => {
    const stats = storage.getMonthlyStats(FAMILY_ID, req.params.month);
    res.json(stats);
  });

  // ── Reports ──────────────────────────────────────────────────────
  app.get("/api/reports/summary", (req, res) => {
    const month = (req.query.month as string | undefined) ?? "";
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "Tham số month phải có dạng YYYY-MM" });
    }
    res.json(storage.getReportsSummary(FAMILY_ID, month));
  });

  // ── Recurring Transactions ──────────────────────────────────────
  app.get("/api/recurring", (_req, res) => {
    res.json(storage.getRecurringTransactions(FAMILY_ID));
  });

  app.get("/api/recurring/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const rt = storage.getRecurringTransaction(id);
    if (!rt) return res.status(404).json({ message: "Giao dịch định kỳ không tồn tại" });
    res.json(rt);
  });

  app.post("/api/recurring", (req, res) => {
    const result = insertRecurringTransactionSchema.safeParse({
      ...req.body,
      familyId: FAMILY_ID,
    });
    if (!result.success) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ", details: result.error.flatten() });
    }
    const created = storage.createRecurringTransaction(result.data);
    res.status(201).json(created);
  });

  app.patch("/api/recurring/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateRecurringTransaction(id, req.body);
    if (!updated) return res.status(404).json({ message: "Giao dịch định kỳ không tồn tại" });
    res.json(updated);
  });

  app.delete("/api/recurring/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const ok = storage.deleteRecurringTransaction(id);
    if (!ok) return res.status(404).json({ message: "Giao dịch định kỳ không tồn tại" });
    res.json({ success: true });
  });

  app.post("/api/recurring/process", (_req, res) => {
    const count = storage.processDueRecurringTransactions(FAMILY_ID);
    res.json({ processed: count });
  });

  // ── User Management ────────────────────────────────────────────
  app.get("/api/users", (_req, res) => {
    const allUsers = db
      .select({ id: users.id, username: users.username, createdAt: users.createdAt })
      .from(users)
      .all();
    res.json(allUsers);
  });

  app.post("/api/users", async (req, res) => {
    const { username, password } = req.body;
    if (!username || typeof username !== "string" || username.trim().length < 2) {
      return res.status(400).json({ message: "Tên đăng nhập phải có ít nhất 2 ký tự" });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ message: "Mật khẩu phải có ít nhất 6 ký tự" });
    }
    // Check uniqueness
    const existing = db.select().from(users).where(eq(users.username, username.trim())).get();
    if (existing) {
      return res.status(409).json({ message: "Tên đăng nhập đã tồn tại" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const created = db
      .insert(users)
      .values({ username: username.trim(), passwordHash })
      .returning()
      .get();
    res.status(201).json({ id: created.id, username: created.username, createdAt: created.createdAt });
  });

  app.patch("/api/users/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const target = db.select().from(users).where(eq(users.id, id)).get();
    if (!target) return res.status(404).json({ message: "Người dùng không tồn tại" });

    const updates: Record<string, unknown> = {};
    if (req.body.username && typeof req.body.username === "string") {
      const trimmed = req.body.username.trim();
      if (trimmed.length < 2) return res.status(400).json({ message: "Tên đăng nhập phải có ít nhất 2 ký tự" });
      // Check uniqueness (exclude self)
      const dup = db.select().from(users).where(eq(users.username, trimmed)).get();
      if (dup && dup.id !== id) return res.status(409).json({ message: "Tên đăng nhập đã tồn tại" });
      updates.username = trimmed;
    }
    if (req.body.password && typeof req.body.password === "string") {
      if (req.body.password.length < 6) return res.status(400).json({ message: "Mật khẩu phải có ít nhất 6 ký tự" });
      updates.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Không có thay đổi" });
    }
    db.update(users).set(updates).where(eq(users.id, id)).run();
    const updated = db
      .select({ id: users.id, username: users.username, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, id))
      .get();
    res.json(updated);
  });

  app.delete("/api/users/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const currentUser = req.user as { id: number } | undefined;
    if (currentUser && currentUser.id === id) {
      return res.status(400).json({ message: "Không thể xóa tài khoản đang đăng nhập" });
    }
    const target = db.select().from(users).where(eq(users.id, id)).get();
    if (!target) return res.status(404).json({ message: "Người dùng không tồn tại" });
    // Prevent deleting the last user
    const count = db.select({ count: sql<number>`count(*)` }).from(users).get();
    if (count && count.count <= 1) {
      return res.status(400).json({ message: "Không thể xóa người dùng cuối cùng" });
    }
    db.delete(users).where(eq(users.id, id)).run();
    res.json({ success: true });
  });

  // ── Settings: Change Password ──────────────────────────────────
  app.post("/api/auth/change-password", async (req, res) => {
    const user = req.user as { id: number; username: string } | undefined;
    if (!user) return res.status(401).json({ message: "Chưa đăng nhập" });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Vui lòng nhập mật khẩu hiện tại và mật khẩu mới" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({ message: "Mật khẩu mới phải có ít nhất 6 ký tự" });
    }

    const dbUser = db.select().from(users).where(eq(users.id, user.id)).get();
    if (!dbUser) return res.status(404).json({ message: "Người dùng không tồn tại" });

    const valid = await bcrypt.compare(currentPassword, dbUser.passwordHash);
    if (!valid) return res.status(400).json({ message: "Mật khẩu hiện tại không đúng" });

    const newHash = await bcrypt.hash(newPassword, 10);
    db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id)).run();
    res.json({ success: true });
  });

  return httpServer;
}
