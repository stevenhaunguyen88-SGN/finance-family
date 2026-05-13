import type { Express } from "express";
import type { Server } from "node:http";
import { storage } from "./storage";
import {
  insertTransactionSchema,
  insertWalletSchema,
  insertMemberSchema,
  insertCategorySchema,
  insertBudgetSchema,
  insertRecurringTransactionSchema,
  insertSavingsGoalSchema,
} from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";

const FAMILY_ID = 1; // Single family app

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ── Seed default data ────────────────────────────────────────────
  await storage.seedDefaultData();

  // ── Family ───────────────────────────────────────────────────────
  app.get("/api/family", async (_req, res) => {
    const family = await storage.getFamily(FAMILY_ID);
    res.json(family);
  });

  // ── Members ──────────────────────────────────────────────────────
  app.get("/api/members", async (_req, res) => {
    const members = await storage.getMembers(FAMILY_ID);
    res.json(members);
  });

  app.post("/api/members", async (req, res) => {
    const result = insertMemberSchema.safeParse({ ...req.body, familyId: FAMILY_ID });
    if (!result.success) return res.status(400).json({ message: "Invalid member data", details: result.error.flatten() });
    const member = await storage.createMember(result.data);
    res.status(201).json(member);
  });

  app.patch("/api/members/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateMember(id, req.body);
    if (!updated) return res.status(404).json({ message: "Member not found" });
    res.json(updated);
  });

  app.delete("/api/members/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteMember(id);
    if (!ok) return res.status(404).json({ message: "Member not found" });
    res.json({ success: true });
  });

  // ── Wallets ──────────────────────────────────────────────────────
  app.get("/api/wallets", async (_req, res) => {
    const w = await storage.getWallets(FAMILY_ID);
    res.json(w);
  });

  app.post("/api/wallets", async (req, res) => {
    const result = insertWalletSchema.safeParse({ ...req.body, familyId: FAMILY_ID });
    if (!result.success) return res.status(400).json({ message: "Invalid wallet data", details: result.error.flatten() });
    const wallet = await storage.createWallet(result.data);
    res.status(201).json(wallet);
  });

  app.patch("/api/wallets/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateWallet(id, req.body);
    if (!updated) return res.status(404).json({ message: "Wallet not found" });
    res.json(updated);
  });

  app.delete("/api/wallets/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteWallet(id);
    if (!ok) return res.status(404).json({ message: "Wallet not found" });
    res.json({ success: true });
  });

  // ── Categories ───────────────────────────────────────────────────
  app.get("/api/categories", async (_req, res) => {
    const cats = await storage.getCategories(FAMILY_ID);
    res.json(cats);
  });

  // Create a new category. Allows families to define their own income/expense categories.
  // The request body should include at least a `name` and `type` field. Optional `icon` and `color`
  // can be provided. The familyId is automatically set to the current family.
  app.post("/api/categories", async (req, res) => {
    const payload = { ...req.body, familyId: FAMILY_ID };
    // Validate input using zod. `omit({ id: true })` ensures id is not provided by client.
    const result = insertCategorySchema.safeParse(payload);
    if (!result.success) {
      return res.status(400).json({ message: "Invalid category data", details: result.error.flatten() });
    }
    const category = await storage.createCategory(result.data);
    return res.status(201).json(category);
  });

  // Update a category. Only non-default categories can be edited.
  app.patch("/api/categories/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const cats = await storage.getCategories(FAMILY_ID);
    const target = cats.find(c => c.id === id);
    if (!target) return res.status(404).json({ message: "Category not found" });
    if (target.isDefault) return res.status(400).json({ message: "Không thể sửa danh mục mặc định" });
    const updated = await storage.updateCategory(id, req.body);
    if (!updated) return res.status(404).json({ message: "Category not found" });
    res.json(updated);
  });

  // Delete a category by id. Only non-default categories belonging to the family can be removed.
  app.delete("/api/categories/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const cats = await storage.getCategories(FAMILY_ID);
    const target = cats.find(c => c.id === id);
    if (!target) {
      return res.status(404).json({ message: "Category not found" });
    }
    if (target.isDefault) {
      return res.status(400).json({ message: "Không thể xóa danh mục mặc định" });
    }
    const ok = await storage.deleteCategory(id);
    if (!ok) {
      return res.status(404).json({ message: "Category not found" });
    }
    return res.json({ success: true });
  });

  // ── Budgets ──────────────────────────────────────────────────────
  app.get("/api/budgets", async (req, res) => {
    const month = (req.query.month as string | undefined) ?? "";
    if (month) {
      // When a month is provided, return progress for each budget so the UI
      // can render bars without firing /api/transactions a second time.
      return res.json(await storage.getBudgetsWithProgress(FAMILY_ID, month));
    }
    res.json(await storage.getBudgets(FAMILY_ID));
  });

  app.post("/api/budgets", async (req, res) => {
    const result = insertBudgetSchema.safeParse({ ...req.body, familyId: FAMILY_ID });
    if (!result.success) return res.status(400).json({ message: "Dữ liệu ngân sách không hợp lệ", details: result.error.flatten() });
    const created = await storage.createBudget(result.data);
    res.status(201).json(created);
  });

  app.patch("/api/budgets/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateBudget(id, req.body);
    if (!updated) return res.status(404).json({ message: "Budget not found" });
    res.json(updated);
  });

  app.delete("/api/budgets/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteBudget(id);
    if (!ok) return res.status(404).json({ message: "Budget not found" });
    res.json({ success: true });
  });

  // ── Transactions ─────────────────────────────────────────────────
  app.get("/api/transactions", async (req, res) => {
    const { month, memberId, type, q, minAmount, maxAmount } = req.query;
    const txs = await storage.getTransactions(FAMILY_ID, {
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
  app.get("/api/transactions/export.csv", async (req, res) => {
    const { month, memberId, type, q, minAmount, maxAmount } = req.query;
    const txs = await storage.getTransactions(FAMILY_ID, {
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

  app.get("/api/transactions/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const tx = await storage.getTransaction(id);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });
    res.json(tx);
  });

  app.post("/api/transactions", async (req, res) => {
    const result = insertTransactionSchema.safeParse({ ...req.body, familyId: FAMILY_ID });
    if (!result.success) return res.status(400).json({ message: "Invalid transaction data", details: result.error.flatten() });
    const tx = await storage.createTransaction(result.data);
    if (tx.type === "expense") {
      const month = tx.date.slice(0, 7);
      storage.checkBudgetAlerts(FAMILY_ID, month).catch(() => {});
    }
    res.status(201).json(tx);
  });

  app.patch("/api/transactions/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateTransaction(id, req.body);
    if (!updated) return res.status(404).json({ message: "Transaction not found" });
    res.json(updated);
  });

  app.delete("/api/transactions/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteTransaction(id);
    if (!ok) return res.status(404).json({ message: "Transaction not found" });
    res.json({ success: true });
  });

  // ── Stats ────────────────────────────────────────────────────────
  app.get("/api/stats/:month", async (req, res) => {
    const stats = await storage.getMonthlyStats(FAMILY_ID, req.params.month);
    res.json(stats);
  });

  // ── Reports ──────────────────────────────────────────────────────
  app.get("/api/reports/summary", async (req, res) => {
    const month = (req.query.month as string | undefined) ?? "";
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "Tham số month phải có dạng YYYY-MM" });
    }
    res.json(await storage.getReportsSummary(FAMILY_ID, month));
  });

  // ── Recurring Transactions ──────────────────────────────────────
  app.get("/api/recurring", async (_req, res) => {
    res.json(await storage.getRecurringTransactions(FAMILY_ID));
  });

  app.get("/api/recurring/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const rt = await storage.getRecurringTransaction(id);
    if (!rt) return res.status(404).json({ message: "Giao dịch định kỳ không tồn tại" });
    res.json(rt);
  });

  app.post("/api/recurring", async (req, res) => {
    const result = insertRecurringTransactionSchema.safeParse({
      ...req.body,
      familyId: FAMILY_ID,
    });
    if (!result.success) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ", details: result.error.flatten() });
    }
    const created = await storage.createRecurringTransaction(result.data);
    res.status(201).json(created);
  });

  app.patch("/api/recurring/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateRecurringTransaction(id, req.body);
    if (!updated) return res.status(404).json({ message: "Giao dịch định kỳ không tồn tại" });
    res.json(updated);
  });

  app.delete("/api/recurring/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteRecurringTransaction(id);
    if (!ok) return res.status(404).json({ message: "Giao dịch định kỳ không tồn tại" });
    res.json({ success: true });
  });

  app.post("/api/recurring/process", async (_req, res) => {
    const count = await storage.processDueRecurringTransactions(FAMILY_ID);
    res.json({ processed: count });
  });

  // ── Savings Goals ──────────────────────────────────────────────
  app.get("/api/savings-goals", async (_req, res) => {
    res.json(await storage.getSavingsGoals(FAMILY_ID));
  });

  app.get("/api/savings-goals/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const goal = await storage.getSavingsGoal(id);
    if (!goal) return res.status(404).json({ message: "Mục tiêu không tồn tại" });
    res.json(goal);
  });

  app.post("/api/savings-goals", async (req, res) => {
    const result = insertSavingsGoalSchema.safeParse({
      ...req.body,
      familyId: FAMILY_ID,
    });
    if (!result.success) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ", details: result.error.flatten() });
    }
    const created = await storage.createSavingsGoal(result.data);
    res.status(201).json(created);
  });

  app.patch("/api/savings-goals/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateSavingsGoal(id, req.body);
    if (!updated) return res.status(404).json({ message: "Mục tiêu không tồn tại" });
    res.json(updated);
  });

  app.delete("/api/savings-goals/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteSavingsGoal(id);
    if (!ok) return res.status(404).json({ message: "Mục tiêu không tồn tại" });
    res.json({ success: true });
  });

  app.post("/api/savings-goals/:id/contribute", async (req, res) => {
    const id = parseInt(req.params.id);
    const { amount } = req.body;
    if (typeof amount !== "number" || amount === 0) {
      return res.status(400).json({ message: "Số tiền không hợp lệ" });
    }
    const updated = await storage.contributeSavingsGoal(id, amount);
    if (!updated) return res.status(404).json({ message: "Mục tiêu không tồn tại" });
    res.json(updated);
  });

  // ── Notifications ─────────────────────────────────────────────
  app.get("/api/notifications", async (_req, res) => {
    res.json(await storage.getNotifications(FAMILY_ID));
  });

  app.get("/api/notifications/unread-count", async (_req, res) => {
    const count = await storage.getUnreadCount(FAMILY_ID);
    res.json({ count });
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    const id = parseInt(req.params.id);
    const ok = await storage.markRead(id);
    if (!ok) return res.status(404).json({ message: "Thông báo không tồn tại" });
    res.json({ success: true });
  });

  app.post("/api/notifications/read-all", async (_req, res) => {
    const count = await storage.markAllRead(FAMILY_ID);
    res.json({ marked: count });
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteNotification(id);
    if (!ok) return res.status(404).json({ message: "Thông báo không tồn tại" });
    res.json({ success: true });
  });

  app.delete("/api/notifications", async (_req, res) => {
    const count = await storage.clearAllNotifications(FAMILY_ID);
    res.json({ cleared: count });
  });

  // ── User Management ────────────────────────────────────────────
  app.get("/api/users", async (_req, res) => {
    const allUsers = await db
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
    const existing = await db.select().from(users).where(eq(users.username, username.trim())).get();
    if (existing) {
      return res.status(409).json({ message: "Tên đăng nhập đã tồn tại" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const created = await db
      .insert(users)
      .values({ username: username.trim(), passwordHash })
      .returning()
      .get();
    res.status(201).json({ id: created.id, username: created.username, createdAt: created.createdAt });
  });

  app.patch("/api/users/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const target = await db.select().from(users).where(eq(users.id, id)).get();
    if (!target) return res.status(404).json({ message: "Người dùng không tồn tại" });

    const updates: Record<string, unknown> = {};
    if (req.body.username && typeof req.body.username === "string") {
      const trimmed = req.body.username.trim();
      if (trimmed.length < 2) return res.status(400).json({ message: "Tên đăng nhập phải có ít nhất 2 ký tự" });
      // Check uniqueness (exclude self)
      const dup = await db.select().from(users).where(eq(users.username, trimmed)).get();
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
    await db.update(users).set(updates).where(eq(users.id, id)).run();
    const updated = await db
      .select({ id: users.id, username: users.username, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, id))
      .get();
    res.json(updated);
  });

  app.delete("/api/users/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const currentUser = req.user as { id: number } | undefined;
    if (currentUser && currentUser.id === id) {
      return res.status(400).json({ message: "Không thể xóa tài khoản đang đăng nhập" });
    }
    const target = await db.select().from(users).where(eq(users.id, id)).get();
    if (!target) return res.status(404).json({ message: "Người dùng không tồn tại" });
    // Prevent deleting the last user
    const count = await db.select({ count: sql<number>`count(*)` }).from(users).get();
    if (count && count.count <= 1) {
      return res.status(400).json({ message: "Không thể xóa người dùng cuối cùng" });
    }
    await db.delete(users).where(eq(users.id, id)).run();
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

    const dbUser = await db.select().from(users).where(eq(users.id, user.id)).get();
    if (!dbUser) return res.status(404).json({ message: "Người dùng không tồn tại" });

    const valid = await bcrypt.compare(currentPassword, dbUser.passwordHash);
    if (!valid) return res.status(400).json({ message: "Mật khẩu hiện tại không đúng" });

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id)).run();
    res.json({ success: true });
  });

  return httpServer;
}
