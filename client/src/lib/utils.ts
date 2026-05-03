import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    minimumFractionDigits: 0,
  }).format(amount);
}

// Format a plain number as a Vietnamese-style amount (e.g. 1500000 -> "1.500.000")
// without the currency symbol. Used inside `<input>` while the user types.
export function formatNumberVn(value: number): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat("vi-VN").format(value);
}

// Strip everything except digits and parse as an integer. Returns 0 for empty.
export function parseAmountInput(value: string): number {
  const digits = value.replace(/\D+/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `Tháng ${parseInt(m)}/${year}`;
}

export function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "Quản trị",
    member: "Thành viên",
    child: "Con",
  };
  return map[role] || role;
}

export function getWalletTypeLabel(type: string): string {
  const map: Record<string, string> = {
    cash: "Tiền mặt",
    bank: "Ngân hàng",
    credit: "Thẻ tín dụng",
    savings: "Tiết kiệm",
  };
  return map[type] || type;
}
