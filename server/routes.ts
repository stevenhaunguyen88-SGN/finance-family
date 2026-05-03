import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage } from "./storage";
import {
  insertTransactionSchema,
  insertWalletSchema,
  insertMemberSchema,
  insertCategorySchema,
} from "@shared/schema";
import { z } from "zod";

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

  // ── Transactions ─────────────────────────────────────────────────
  app.get("/api/transactions", (req, res) => {
    const { month, memberId, type } = req.query;
    const txs = storage.getTransactions(FAMILY_ID, {
      month: month as string,
      memberId: memberId ? parseInt(memberId as string) : undefined,
      type: type as string,
    });
    res.json(txs);
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

  return httpServer;
}
