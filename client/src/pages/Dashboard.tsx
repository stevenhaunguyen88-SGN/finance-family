import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, formatDate, getCurrentMonth, getMonthLabel } from "@/lib/utils";
import type { TransactionWithDetails, Wallet, FamilyMember, BudgetWithProgress } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, TrendingDown, Wallet as WalletIcon,
  ArrowLeftRight, ChevronLeft, ChevronRight, PlusCircle, Plus,
  PiggyBank, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

function StatCard({
  title, amount, icon: Icon, color, bg, isLoading
}: {
  title: string; amount: number; icon: any; color: string; bg: string; isLoading: boolean;
}) {
  return (
    <Card data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            {isLoading ? (
              <Skeleton className="h-7 w-32" />
            ) : (
              <p className={`text-xl font-bold ${color}`}>{formatCurrency(amount)}</p>
            )}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TxBadge({ type }: { type: string }) {
  if (type === "income") return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100 text-xs">Thu</Badge>;
  if (type === "expense") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 text-xs">Chi</Badge>;
  return <Badge variant="secondary" className="text-xs">Chuyển</Badge>;
}

export default function Dashboard() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [, navigate] = useLocation();

  const goCreateTx = () => {
    // Read on Transactions page to auto-open the dialog.
    try { sessionStorage.setItem("openNewTx", "1"); } catch {}
    navigate("/transactions");
  };

  const prevMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const { data: stats, isLoading: statsLoading } = useQuery<{ income: number; expense: number; balance: number }>({
    queryKey: ["/api/stats", month],
    queryFn: () => apiRequest("GET", `/api/stats/${month}`).then(r => r.json()),
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery<TransactionWithDetails[]>({
    queryKey: ["/api/transactions", { month }],
    queryFn: () => apiRequest("GET", `/api/transactions?month=${month}`).then(r => r.json()),
  });

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
    queryFn: () => apiRequest("GET", "/api/wallets").then(r => r.json()),
  });

  const { data: budgets = [] } = useQuery<BudgetWithProgress[]>({
    queryKey: ["/api/budgets", { month }],
    queryFn: () => apiRequest("GET", `/api/budgets?month=${month}`).then(r => r.json()),
  });

  // Chart data: daily net for current month
  const chartData = (() => {
    const map: Record<string, { income: number; expense: number }> = {};
    transactions.forEach(t => {
      const d = t.date.split("-")[2]; // day
      if (!map[d]) map[d] = { income: 0, expense: 0 };
      if (t.type === "income") map[d].income += t.amount;
      if (t.type === "expense") map[d].expense += t.amount;
    });
    return Object.entries(map)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([day, v]) => ({ day: `${parseInt(day)}`, ...v }));
  })();

  const recentTx = transactions.slice(0, 6);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Tổng quan</h1>
          <p className="text-sm text-muted-foreground">Theo dõi thu chi gia đình</p>
        </div>
        <div className="flex items-center gap-1 bg-secondary rounded-lg px-2 py-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium px-1 min-w-28 text-center">{getMonthLabel(month)}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Tổng thu nhập"
          amount={stats?.income ?? 0}
          icon={TrendingUp}
          color="text-green-600 dark:text-green-400"
          bg="bg-green-100 dark:bg-green-900/30"
          isLoading={statsLoading}
        />
        <StatCard
          title="Tổng chi tiêu"
          amount={stats?.expense ?? 0}
          icon={TrendingDown}
          color="text-red-500 dark:text-red-400"
          bg="bg-red-100 dark:bg-red-900/30"
          isLoading={statsLoading}
        />
        <StatCard
          title="Số dư tổng"
          amount={stats?.balance ?? 0}
          icon={WalletIcon}
          color="text-primary"
          bg="bg-accent"
          isLoading={statsLoading}
        />
      </div>

      {/* Chart + Wallets */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Bar chart */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Biểu đồ thu chi — {getMonthLabel(month)}</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-muted-foreground text-sm">Không có dữ liệu</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : `${(v / 1000).toFixed(0)}k`} className="fill-muted-foreground" />
                  <Tooltip
                    formatter={(val: number, name: string) => [
                      formatCurrency(val),
                      name === "income" ? "Thu nhập" : "Chi tiêu"
                    ]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="income" name="income" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expense" name="expense" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Wallets */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Ví tiền</CardTitle>
            <Link href="/wallets">
              <a className="text-xs text-primary hover:underline">Xem tất cả</a>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {wallets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có ví nào</p>
            ) : (
              wallets.map(w => (
                <div key={w.id} data-testid={`wallet-card-${w.id}`} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <WalletIcon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-none">{w.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{w.type === "cash" ? "Tiền mặt" : w.type === "bank" ? "Ngân hàng" : w.type === "savings" ? "Tiết kiệm" : "Tín dụng"}</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold">{formatCurrency(w.balance)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent transactions */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Giao dịch gần đây</CardTitle>
          <Link href="/transactions">
            <a className="text-xs text-primary hover:underline">Xem tất cả</a>
          </Link>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : recentTx.length === 0 ? (
            <div className="py-8 text-center">
              <ArrowLeftRight className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Chưa có giao dịch nào trong tháng này</p>
              <Link href="/transactions">
                <Button variant="outline" size="sm" className="mt-3">
                  <PlusCircle className="w-4 h-4 mr-1.5" />
                  Thêm giao dịch
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentTx.map(t => (
                <div key={t.id} data-testid={`tx-row-${t.id}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-base">
                      {t.category?.icon || "💰"}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-none">{t.category?.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.member?.name} · {formatDate(t.date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TxBadge type={t.type} />
                    <span className={`text-sm font-semibold ${t.type === "income" ? "text-green-600 dark:text-green-400" : t.type === "expense" ? "text-red-500 dark:text-red-400" : "text-foreground"}`}>
                      {t.type === "income" ? "+" : t.type === "expense" ? "-" : ""}{formatCurrency(t.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Budget summary widget */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <PiggyBank className="w-4 h-4 text-primary" />
            Ngân sách tháng — {getMonthLabel(month)}
          </CardTitle>
          <Link href="/budgets">
            <a className="text-xs text-primary hover:underline">Quản lý</a>
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {budgets.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">Chưa đặt ngân sách nào</p>
              <Link href="/budgets">
                <Button variant="outline" size="sm">
                  <PlusCircle className="w-4 h-4 mr-1.5" />
                  Đặt ngân sách
                </Button>
              </Link>
            </div>
          ) : (
            budgets.slice(0, 5).map(b => {
              const over = b.percent > 100;
              const warn = b.percent >= 80 && b.percent <= 100;
              return (
                <div key={b.id} data-testid={`dashboard-budget-${b.id}`} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-base leading-none">{b.category?.icon}</span>
                      <span className="font-medium truncate">{b.category?.name}</span>
                      {over && <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />}
                    </div>
                    <span className={`tabular-nums ${over ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}`}>
                      {formatCurrency(b.spent)} / {formatCurrency(b.monthlyLimit)}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(b.percent, 100)}
                    className={over ? "[&>div]:bg-red-500" : warn ? "[&>div]:bg-amber-500" : ""}
                  />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Floating action button — mobile only, opens new-transaction sheet. */}
      <button
        type="button"
        onClick={goCreateTx}
        data-testid="btn-fab-add-tx-dashboard"
        aria-label="Thêm giao dịch"
        className="sm:hidden fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-30 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}
