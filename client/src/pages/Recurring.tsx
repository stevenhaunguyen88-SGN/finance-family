import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import type {
  RecurringTransactionWithDetails, Category, Wallet, FamilyMember,
  InsertRecurringTransaction,
} from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MoneyInput } from "@/components/MoneyInput";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { ConfirmButton } from "@/components/ConfirmButton";
import { cn } from "@/lib/utils";
import {
  PlusCircle, Pencil, Trash2, Plus,
  TrendingUp, TrendingDown, ArrowLeftRight,
  CalendarClock, RefreshCw, Pause, Play,
} from "lucide-react";

const FREQ_LABELS: Record<string, string> = {
  daily: "Hàng ngày",
  weekly: "Hàng tuần",
  monthly: "Hàng tháng",
  yearly: "Hàng năm",
};

function TxTypeBadge({ type }: { type: string }) {
  if (type === "income") return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100 text-xs">Thu</Badge>;
  if (type === "expense") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 text-xs">Chi</Badge>;
  return <Badge variant="secondary" className="text-xs">Chuyển</Badge>;
}

interface RecFormData {
  type: "income" | "expense" | "transfer";
  amount: number;
  categoryId: string;
  walletId: string;
  toWalletId: string;
  memberId: string;
  note: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  startDate: string;
  endDate: string;
}

const defaultForm: RecFormData = {
  type: "expense",
  amount: 0,
  categoryId: "",
  walletId: "",
  toWalletId: "",
  memberId: "",
  note: "",
  frequency: "monthly",
  startDate: new Date().toISOString().split("T")[0],
  endDate: "",
};

function RecDialog({
  open,
  onClose,
  editing,
  categories,
  wallets,
  members,
}: {
  open: boolean;
  onClose: () => void;
  editing: RecurringTransactionWithDetails | null;
  categories: Category[];
  wallets: Wallet[];
  members: FamilyMember[];
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<RecFormData>(() =>
    editing
      ? {
          type: editing.type as any,
          amount: editing.amount,
          categoryId: String(editing.categoryId),
          walletId: String(editing.walletId),
          toWalletId: editing.toWalletId != null ? String(editing.toWalletId) : "",
          memberId: String(editing.memberId),
          note: editing.note || "",
          frequency: editing.frequency as any,
          startDate: editing.startDate,
          endDate: editing.endDate || "",
        }
      : defaultForm
  );

  const filteredCats = categories.filter(c => c.type === form.type || form.type === "transfer");

  const createMut = useMutation({
    mutationFn: (data: Partial<InsertRecurringTransaction>) =>
      apiRequest("POST", "/api/recurring", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring"] });
      toast({ title: "Đã thêm giao dịch định kỳ" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<InsertRecurringTransaction>) =>
      apiRequest("PATCH", `/api/recurring/${editing?.id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring"] });
      toast({ title: "Đã cập nhật giao dịch định kỳ" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || form.amount <= 0) {
      toast({ title: "Nhập số tiền lớn hơn 0", variant: "destructive" });
      return;
    }
    if (!form.categoryId || !form.walletId || !form.memberId) {
      toast({ title: "Vui lòng điền đầy đủ thông tin", variant: "destructive" });
      return;
    }
    if (form.type === "transfer") {
      if (!form.toWalletId) {
        toast({ title: "Vui lòng chọn ví đến", variant: "destructive" });
        return;
      }
      if (form.toWalletId === form.walletId) {
        toast({ title: "Ví nguồn và ví đích phải khác nhau", variant: "destructive" });
        return;
      }
    }
    const payload: Partial<InsertRecurringTransaction> = {
      type: form.type,
      amount: form.amount,
      categoryId: parseInt(form.categoryId),
      walletId: parseInt(form.walletId),
      toWalletId: form.type === "transfer" ? parseInt(form.toWalletId) : null,
      memberId: parseInt(form.memberId),
      note: form.note || null,
      frequency: form.frequency,
      startDate: form.startDate,
      nextDueDate: form.startDate,
      endDate: form.endDate || null,
      isActive: true,
    };
    editing ? updateMut.mutate(payload) : createMut.mutate(payload);
  };

  const set = <K extends keyof RecFormData>(k: K, v: RecFormData[K]) =>
    setForm(f => ({ ...f, [k]: v }));
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={editing ? "Sửa giao dịch định kỳ" : "Thêm giao dịch định kỳ"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type */}
        <div className="grid grid-cols-3 gap-2">
          {(["expense", "income", "transfer"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => { set("type", t); set("categoryId", ""); }}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors",
                form.type === t
                  ? t === "income" ? "bg-green-600 text-white border-green-600"
                    : t === "expense" ? "bg-red-500 text-white border-red-500"
                    : "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              {t === "income" ? <TrendingUp className="w-3.5 h-3.5" /> : t === "expense" ? <TrendingDown className="w-3.5 h-3.5" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
              {t === "income" ? "Thu" : t === "expense" ? "Chi" : "Chuyển"}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <Label htmlFor="rec-amount">Số tiền (VND)</Label>
          <MoneyInput
            inputId="rec-amount"
            testId="input-rec-amount"
            value={form.amount}
            onChange={(v) => set("amount", v)}
          />
        </div>

        {/* Category */}
        {form.type !== "transfer" && (
          <div className="space-y-1.5">
            <Label>Danh mục</Label>
            <div className="grid grid-cols-4 gap-2">
              {filteredCats.map(c => {
                const active = String(c.id) === form.categoryId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => set("categoryId", String(c.id))}
                    className={cn(
                      "flex flex-col items-center gap-1 px-1 py-2 rounded-lg border transition-colors text-center",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <span className="text-xl leading-none">{c.icon}</span>
                    <span className="text-[11px] font-medium leading-tight line-clamp-2">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Wallet + Member */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{form.type === "transfer" ? "Ví đi" : "Ví tiền"}</Label>
            <Select value={form.walletId} onValueChange={v => set("walletId", v)}>
              <SelectTrigger><SelectValue placeholder="Chọn ví" /></SelectTrigger>
              <SelectContent>
                {wallets.map(w => (
                  <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.type === "transfer" ? (
            <div className="space-y-1.5">
              <Label>Ví đến</Label>
              <Select value={form.toWalletId} onValueChange={v => set("toWalletId", v)}>
                <SelectTrigger><SelectValue placeholder="Chọn ví đến" /></SelectTrigger>
                <SelectContent>
                  {wallets.filter(w => String(w.id) !== form.walletId).map(w => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Thành viên</Label>
              <Select value={form.memberId} onValueChange={v => set("memberId", v)}>
                <SelectTrigger><SelectValue placeholder="Chọn người" /></SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {form.type === "transfer" && (
          <div className="space-y-1.5">
            <Label>Thành viên thực hiện</Label>
            <Select value={form.memberId} onValueChange={v => set("memberId", v)}>
              <SelectTrigger><SelectValue placeholder="Chọn người" /></SelectTrigger>
              <SelectContent>
                {members.map(m => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Frequency + Start Date */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tần suất</Label>
            <Select value={form.frequency} onValueChange={v => set("frequency", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Hàng ngày</SelectItem>
                <SelectItem value="weekly">Hàng tuần</SelectItem>
                <SelectItem value="monthly">Hàng tháng</SelectItem>
                <SelectItem value="yearly">Hàng năm</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ngày bắt đầu</Label>
            <Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} />
          </div>
        </div>

        {/* End Date + Note */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Ngày kết thúc (tùy chọn)</Label>
            <Input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ghi chú</Label>
            <Input placeholder="Tùy chọn" value={form.note} onChange={e => set("note", e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="sm:w-auto">Hủy</Button>
          <Button type="submit" disabled={isPending} className="sm:w-auto">
            {isPending ? "Đang lưu..." : editing ? "Cập nhật" : "Thêm"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

export default function Recurring() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTransactionWithDetails | null>(null);
  const { toast } = useToast();

  const { data: items = [], isLoading } = useQuery<RecurringTransactionWithDetails[]>({
    queryKey: ["/api/recurring"],
    queryFn: () => apiRequest("GET", "/api/recurring").then(r => r.json()),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: () => apiRequest("GET", "/api/categories").then(r => r.json()),
  });

  const { data: wallets = [] } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
    queryFn: () => apiRequest("GET", "/api/wallets").then(r => r.json()),
  });

  const { data: members = [] } = useQuery<FamilyMember[]>({
    queryKey: ["/api/members"],
    queryFn: () => apiRequest("GET", "/api/members").then(r => r.json()),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/recurring/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring"] });
      toast({ title: "Đã xóa giao dịch định kỳ" });
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/recurring/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring"] });
      toast({ title: "Đã cập nhật trạng thái" });
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const processMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/recurring/process").then(r => r.json()),
    onSuccess: (data: { processed: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: data.processed > 0 ? `Đã tạo ${data.processed} giao dịch` : "Không có giao dịch nào đến hạn" });
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (item: RecurringTransactionWithDetails) => { setEditing(item); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const activeItems = items.filter(i => i.isActive);
  const pausedItems = items.filter(i => !i.isActive);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Giao dịch định kỳ</h1>
          <p className="text-sm text-muted-foreground">Quản lý thu chi tự động lặp lại</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => processMut.mutate()}
            disabled={processMut.isPending}
          >
            <RefreshCw className={cn("w-4 h-4 mr-1", processMut.isPending && "animate-spin")} />
            Xử lý
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" />
            Thêm
          </Button>
        </div>
      </div>

      {/* Active Items */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarClock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground mb-4">Chưa có giao dịch định kỳ nào</p>
            <Button onClick={openCreate}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Thêm giao dịch định kỳ đầu tiên
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {activeItems.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Đang hoạt động ({activeItems.length})
              </h2>
              {activeItems.map(item => (
                <RecurringCard
                  key={item.id}
                  item={item}
                  onEdit={openEdit}
                  onDelete={(id) => deleteMut.mutate(id)}
                  onToggle={(id, active) => toggleMut.mutate({ id, isActive: active })}
                />
              ))}
            </div>
          )}
          {pausedItems.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Tạm dừng ({pausedItems.length})
              </h2>
              {pausedItems.map(item => (
                <RecurringCard
                  key={item.id}
                  item={item}
                  onEdit={openEdit}
                  onDelete={(id) => deleteMut.mutate(id)}
                  onToggle={(id, active) => toggleMut.mutate({ id, isActive: active })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Mobile FAB */}
      <button
        onClick={openCreate}
        className="fixed bottom-20 right-4 md:hidden w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center z-40"
      >
        <Plus className="w-6 h-6" />
      </button>

      {dialogOpen && (
        <RecDialog
          open={dialogOpen}
          onClose={closeDialog}
          editing={editing}
          categories={categories}
          wallets={wallets}
          members={members}
        />
      )}
    </div>
  );
}

function RecurringCard({
  item,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: RecurringTransactionWithDetails;
  onEdit: (item: RecurringTransactionWithDetails) => void;
  onDelete: (id: number) => void;
  onToggle: (id: number, active: boolean) => void;
}) {
  const amountColor = item.type === "income" ? "text-green-600" : item.type === "expense" ? "text-red-500" : "text-foreground";

  return (
    <Card className={cn(!item.isActive && "opacity-60")}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="text-2xl mt-0.5">{item.category?.icon ?? "📋"}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground truncate">
                  {item.category?.name ?? "—"}
                </span>
                <TxTypeBadge type={item.type} />
                <Badge variant="outline" className="text-xs">
                  <CalendarClock className="w-3 h-3 mr-1" />
                  {FREQ_LABELS[item.frequency] ?? item.frequency}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                <div>{item.member?.name} · {item.wallet?.name}</div>
                {item.note && <div className="italic">{item.note}</div>}
                <div className="text-xs">
                  Tiếp theo: <span className="font-medium">{formatDate(item.nextDueDate)}</span>
                  {item.endDate && <> · Kết thúc: {formatDate(item.endDate)}</>}
                </div>
              </div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={cn("text-lg font-bold", amountColor)}>
              {item.type === "expense" ? "-" : item.type === "income" ? "+" : ""}
              {formatCurrency(item.amount)}
            </p>
            <div className="flex items-center gap-1 mt-2 justify-end">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onToggle(item.id, !item.isActive)}
                title={item.isActive ? "Tạm dừng" : "Kích hoạt"}
              >
                {item.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(item)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <ConfirmButton
                title="Xóa giao dịch định kỳ?"
                description="Thao tác này không thể hoàn tác. Các giao dịch đã tạo trước đó sẽ không bị ảnh hưởng."
                onConfirm={() => onDelete(item.id)}
              >
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </ConfirmButton>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
