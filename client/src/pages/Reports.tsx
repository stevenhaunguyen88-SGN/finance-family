import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, getCurrentMonth, getMonthLabel } from "@/lib/utils";
import type { ReportsSummary } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartPie, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Users, Minus,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";

// Repeated palette so categories without their own color still get a stable hue.
const PALETTE = [
  "#01696F", "#da7101", "#7a39bb", "#a13544", "#437a22",
  "#964219", "#a12c7b", "#d19900", "#006494", "#374151",
];

function compactVnd(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

function shortMonthLabel(month: string): string {
  // "2026-05" → "T5" (month-only, since the chart is one row of months)
  const [, m] = month.split("-");
  return `T${parseInt(m)}`;
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="text-xs text-muted-foreground">mới</span>;
  }
  if (pct === 0) {
    return (
      <span className="text-xs text-muted-foreground inline-flex items-center gap-0.5">
        <Minus className="w-3 h-3" />0%
      </span>
    );
  }
  if (pct > 0) {
    return (
      <span className="text-xs text-red-600 dark:text-red-400 inline-flex items-center gap-0.5">
        <TrendingUp className="w-3 h-3" />+{pct}%
      </span>
    );
  }
  return (
    <span className="text-xs text-green-600 dark:text-green-400 inline-flex items-center gap-0.5">
      <TrendingDown className="w-3 h-3" />{pct}%
    </span>
  );
}

export default function Reports() {
  const [month, setMonth] = useState(getCurrentMonth());

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

  const { data, isLoading } = useQuery<ReportsSummary>({
    queryKey: ["/api/reports/summary", { month }],
    queryFn: () => apiRequest("GET", `/api/reports/summary?month=${month}`).then(r => r.json()),
  });

  const empty =
    !isLoading &&
    data &&
    data.totalIncome === 0 &&
    data.totalExpense === 0 &&
    data.byCategory.length === 0;

  const pieData = (data?.byCategory ?? []).map((c, i) => ({
    name: c.name,
    value: c.total,
    fill: c.color || PALETTE[i % PALETTE.length],
    icon: c.icon,
  }));

  return (
    <div className="container max-w-4xl px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ChartPie className="w-5 h-5 text-primary" />
            Báo cáo
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Phân tích chi tiêu theo danh mục, thành viên và xu hướng 6 tháng
          </p>
        </div>
        <div className="flex items-center gap-1 bg-secondary rounded-lg px-2 py-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth} data-testid="btn-prev-month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium px-1 min-w-24 text-center">{getMonthLabel(month)}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth} data-testid="btn-next-month">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Top totals */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Thu nhập</p>
            {isLoading ? <Skeleton className="h-6 w-24 mt-1" /> : (
              <p className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums" data-testid="report-total-income">
                {formatCurrency(data?.totalIncome ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Chi tiêu</p>
            {isLoading ? <Skeleton className="h-6 w-24 mt-1" /> : (
              <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums" data-testid="report-total-expense">
                {formatCurrency(data?.totalExpense ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {empty && (
        <Card>
          <CardContent className="py-12 text-center">
            <ChartPie className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">Chưa có dữ liệu cho {getMonthLabel(month)}</p>
            <p className="text-xs text-muted-foreground mt-1">Hãy thêm giao dịch để xem báo cáo.</p>
          </CardContent>
        </Card>
      )}

      {!empty && (
        <>
          {/* Pie chart by category */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-semibold">Chi tiêu theo danh mục</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              {isLoading ? (
                <Skeleton className="h-60 w-full" />
              ) : pieData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Không có chi tiêu trong tháng này.</p>
              ) : (
                <div className="grid sm:grid-cols-[1fr_1fr] gap-3 items-center">
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={45}
                          outerRadius={85}
                          paddingAngle={1}
                        >
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => formatCurrency(value)}
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Legend list (more readable than the recharts default on mobile). */}
                  <ul className="space-y-1.5 max-h-60 overflow-auto">
                    {pieData.map((p, i) => {
                      const pct = data!.totalExpense > 0 ? Math.round((p.value / data!.totalExpense) * 100) : 0;
                      return (
                        <li key={i} className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.fill }} />
                            <span className="text-base leading-none">{p.icon}</span>
                            <span className="truncate font-medium">{p.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="tabular-nums text-muted-foreground">{pct}%</span>
                            <span className="tabular-nums font-semibold">{formatCurrency(p.value)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top categories with month-over-month change */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-primary" />
                Top 5 danh mục chi nhiều nhất
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              {isLoading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (data?.byCategory ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">Không có chi tiêu.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data!.byCategory.slice(0, 5).map(c => (
                    <li key={c.categoryId} data-testid={`top-cat-${c.categoryId}`} className="flex items-center justify-between gap-2 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl leading-none">{c.icon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            Tháng trước: {formatCurrency(c.prevTotal)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <span className="text-sm font-semibold tabular-nums">{formatCurrency(c.total)}</span>
                        <ChangeBadge pct={c.changePercent} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Top spenders (by member) */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary" />
                Chi theo thành viên
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              {isLoading ? (
                <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (data?.byMember ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">Không có chi tiêu.</p>
              ) : (
                <ul className="space-y-2">
                  {data!.byMember.map(m => {
                    const pct = data!.totalExpense > 0 ? Math.round((m.totalExpense / data!.totalExpense) * 100) : 0;
                    return (
                      <li key={m.memberId} data-testid={`top-mem-${m.memberId}`} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                              style={{ background: m.avatarColor }}
                            >
                              {m.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="text-sm font-medium truncate">{m.name}</span>
                          </div>
                          <span className="text-sm font-semibold tabular-nums flex-shrink-0">
                            {formatCurrency(m.totalExpense)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* 6-month trend (always shown, even when current month empty) */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-semibold">Thu / Chi 6 tháng gần nhất</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={(data?.lastSixMonths ?? []).map(p => ({ ...p, label: shortMonthLabel(p.month) }))}
                  margin={{ top: 5, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={compactVnd} width={56} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="income" name="Thu" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="expense" name="Chi" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
