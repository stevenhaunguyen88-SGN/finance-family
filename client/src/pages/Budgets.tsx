import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, getCurrentMonth, getMonthLabel } from "@/lib/utils";
import type { BudgetWithProgress, Category, InsertBudget } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MoneyInput } from "@/components/MoneyInput";
import {
  PiggyBank, PlusCircle, Pencil, Trash2,
  ChevronLeft, ChevronRight, AlertTriangle,
} from "lucide-react";

interface BudgetFormState {
  categoryId: number | null;
  monthlyLimit: number;
}

function BudgetDialog({
  open, onClose, editing, expenseCategories, takenCategoryIds,
}: {
  open: boolean;
  onClose: () => void;
  editing: BudgetWithProgress | null;
  expenseCategories: Category[];
  takenCategoryIds: Set<number>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<BudgetFormState>(() =>
    editing
      ? { categoryId: editing.categoryId, monthlyLimit: editing.monthlyLimit }
      : { categoryId: null, monthlyLimit: 0 },
  );

  const createMut = useMutation({
    mutationFn: (data: Partial<InsertBudget>) =>
      apiRequest("POST", "/api/budgets", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({ title: "Đã thêm ngân sách" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Lỗi", description: err?.message ?? "", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<InsertBudget>) =>
      apiRequest("PATCH", `/api/budgets/${editing?.id}`, data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({ title: "Đã cập nhật" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Lỗi", description: err?.message ?? "", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing && form.categoryId == null) {
      return toast({ title: "Chọn danh mục", variant: "destructive" });
    }
    if (!form.monthlyLimit || form.monthlyLimit <= 0) {
      return toast({ title: "Hạn mức phải lớn hơn 0", variant: "destructive" });
    }
    if (editing) {
      updateMut.mutate({ monthlyLimit: form.monthlyLimit });
    } else {
      createMut.mutate({ categoryId: form.categoryId!, monthlyLimit: form.monthlyLimit });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;
  const availableCats = expenseCategories.filter((c) => !takenCategoryIds.has(c.id) || c.id === editing?.categoryId);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={editing ? "Sửa ngân sách" : "Thêm ngân sách"}
      desktopWidthClassName="sm:max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!editing && (
          <div className="space-y-1.5">
            <Label>Danh mục chi tiêu</Label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {availableCats.map((c) => {
                const active = form.categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`btn-category-${c.id}`}
                    onClick={() => setForm((f) => ({ ...f, categoryId: c.id }))}
                    className={
                      "flex flex-col items-center gap-1 p-2 rounded-md border text-xs " +
                      (active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground hover:bg-accent")
                    }
                  >
                    <span className="text-xl leading-none">{c.icon}</span>
                    <span className="truncate w-full text-center">{c.name}</span>
                  </button>
                );
              })}
              {availableCats.length === 0 && (
                <p className="col-span-full text-sm text-muted-foreground py-2">
                  Tất cả danh mục chi tiêu đã có ngân sách. Hãy sửa hạn mức của ngân sách hiện tại.
                </p>
              )}
            </div>
          </div>
        )}
        {editing && (
          <div className="space-y-1.5">
            <Label>Danh mục</Label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted">
              <span className="text-xl">{editing.category?.icon}</span>
              <span className="text-sm font-medium">{editing.category?.name}</span>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Hạn mức / tháng (VND)</Label>
          <MoneyInput
            value={form.monthlyLimit}
            onChange={(v) => setForm((f) => ({ ...f, monthlyLimit: v }))}
            placeholder="VD: 5.000.000"
            testId="input-budget-limit"
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={isPending} data-testid="btn-submit-budget">
            {isPending ? "Đang lưu..." : editing ? "Cập nhật" : "Thêm"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

export default function Budgets() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetWithProgress | null>(null);
  const { toast } = useToast();

  const { data: budgets = [], isLoading } = useQuery<BudgetWithProgress[]>({
    queryKey: ["/api/budgets", { month }],
    queryFn: () => apiRequest("GET", `/api/budgets?month=${month}`).then((r) => r.json()),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: () => apiRequest("GET", "/api/categories").then((r) => r.json()),
  });

  const expenseCategories = categories.filter((c) => c.type === "expense");
  const takenCategoryIds = new Set(budgets.map((b) => b.categoryId));

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/budgets/${id}`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({ title: "Đã xóa ngân sách" });
    },
    onError: () => toast({ title: "Lỗi", variant: "destructive" }),
  });

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

  const totalLimit = budgets.reduce((s, b) => s + b.monthlyLimit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);

  return (
    <div className="container max-w-3xl px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-primary" />
            Ngân sách
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Đặt hạn mức chi tiêu mỗi tháng theo danh mục
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          disabled={expenseCategories.length === 0}
          data-testid="btn-add-budget"
        >
          <PlusCircle className="w-4 h-4 mr-1.5" />
          Thêm
        </Button>
      </div>

      {/* Month switcher + totals */}
      <Card>
        <CardContent className="flex items-center justify-between p-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth} data-testid="btn-prev-month">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium px-1">{getMonthLabel(month)}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth} data-testid="btn-next-month">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          {budgets.length > 0 && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Tổng đã tiêu / hạn mức</div>
              <div className="text-sm font-semibold tabular-nums">
                {formatCurrency(totalSpent)} / {formatCurrency(totalLimit)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Budget list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : budgets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <PiggyBank className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">Chưa có ngân sách nào</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Thêm hạn mức cho từng danh mục để theo dõi chi tiêu hàng tháng.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setEditing(null); setDialogOpen(true); }}
              disabled={expenseCategories.length === 0}
            >
              <PlusCircle className="w-4 h-4 mr-1.5" />
              Thêm ngân sách đầu tiên
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {budgets.map((b) => {
            const over = b.percent > 100;
            const warn = b.percent >= 80 && b.percent <= 100;
            return (
              <Card key={b.id} data-testid={`budget-card-${b.id}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-2xl leading-none flex-shrink-0">{b.category?.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight truncate">{b.category?.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                          <span className={over ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                            {formatCurrency(b.spent)}
                          </span>
                          {" / "}
                          {formatCurrency(b.monthlyLimit)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => { setEditing(b); setDialogOpen(true); }}
                        data-testid={`btn-edit-budget-${b.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <ConfirmButton
                        title={`Xóa ngân sách "${b.category?.name}"?`}
                        description="Hành động này chỉ xóa hạn mức, không xóa giao dịch nào."
                        onConfirm={() => deleteMut.mutate(b.id)}
                      >
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          data-testid={`btn-delete-budget-${b.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </ConfirmButton>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Progress
                      value={Math.min(b.percent, 100)}
                      className={over ? "[&>div]:bg-red-500" : warn ? "[&>div]:bg-amber-500" : ""}
                    />
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={over ? "text-red-600 dark:text-red-400 font-medium flex items-center gap-1" : "text-muted-foreground"}>
                        {over && <AlertTriangle className="w-3 h-3" />}
                        {b.percent}%
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {b.remaining >= 0
                          ? `Còn ${formatCurrency(b.remaining)}`
                          : `Vượt ${formatCurrency(-b.remaining)}`}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BudgetDialog
        key={dialogOpen ? (editing?.id ?? "new") : "closed"}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        editing={editing}
        expenseCategories={expenseCategories}
        takenCategoryIds={takenCategoryIds}
      />
    </div>
  );
}
