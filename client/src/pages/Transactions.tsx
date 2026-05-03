import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDate, getCurrentMonth, getMonthLabel } from "@/lib/utils";
import type { TransactionWithDetails, Category, Wallet, FamilyMember, InsertTransaction } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  PlusCircle, Pencil, Trash2, ChevronLeft, ChevronRight,
  Filter, TrendingUp, TrendingDown, ArrowLeftRight
} from "lucide-react";

function TxTypeBadge({ type }: { type: string }) {
  if (type === "income") return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100 text-xs">Thu</Badge>;
  if (type === "expense") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 text-xs">Chi</Badge>;
  return <Badge variant="secondary" className="text-xs">Chuyển</Badge>;
}

interface TxFormData {
  type: "income" | "expense" | "transfer";
  amount: string;
  categoryId: string;
  walletId: string;
  toWalletId: string;
  memberId: string;
  note: string;
  date: string;
}

const defaultForm: TxFormData = {
  type: "expense",
  amount: "",
  categoryId: "",
  walletId: "",
  toWalletId: "",
  memberId: "",
  note: "",
  date: new Date().toISOString().split("T")[0],
};

function TxDialog({
  open,
  onClose,
  editing,
  categories,
  wallets,
  members,
}: {
  open: boolean;
  onClose: () => void;
  editing: TransactionWithDetails | null;
  categories: Category[];
  wallets: Wallet[];
  members: FamilyMember[];
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<TxFormData>(() =>
    editing
      ? {
          type: editing.type as any,
          amount: String(editing.amount),
          categoryId: String(editing.categoryId),
          walletId: String(editing.walletId),
          toWalletId: editing.toWalletId != null ? String(editing.toWalletId) : "",
          memberId: String(editing.memberId),
          note: editing.note || "",
          date: editing.date,
        }
      : defaultForm
  );

  const filteredCats = categories.filter(c => c.type === form.type || form.type === "transfer");

  const createMut = useMutation({
    mutationFn: (data: Partial<InsertTransaction>) => apiRequest("POST", "/api/transactions", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "Đã thêm giao dịch" });
      onClose();
    },
    onError: () => toast({ title: "Lỗi", description: "Không thể thêm giao dịch", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<InsertTransaction>) => apiRequest("PATCH", `/api/transactions/${editing?.id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "Đã cập nhật giao dịch" });
      onClose();
    },
    onError: () => toast({ title: "Lỗi", description: "Không thể cập nhật", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !form.categoryId || !form.walletId || !form.memberId) {
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
    const payload: Partial<InsertTransaction> = {
      type: form.type,
      amount: parseFloat(form.amount),
      categoryId: parseInt(form.categoryId),
      walletId: parseInt(form.walletId),
      toWalletId: form.type === "transfer" ? parseInt(form.toWalletId) : null,
      memberId: parseInt(form.memberId),
      note: form.note || null,
      date: form.date,
    };
    editing ? updateMut.mutate(payload) : createMut.mutate(payload);
  };

  const set = (k: keyof TxFormData, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Sửa giao dịch" : "Thêm giao dịch"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type */}
          <div className="grid grid-cols-3 gap-2">
            {(["expense", "income", "transfer"] as const).map(t => (
              <button
                key={t}
                type="button"
                data-testid={`type-${t}`}
                onClick={() => { set("type", t); set("categoryId", ""); }}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  form.type === t
                    ? t === "income" ? "bg-green-600 text-white border-green-600"
                      : t === "expense" ? "bg-red-500 text-white border-red-500"
                      : "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {t === "income" ? <TrendingUp className="w-3.5 h-3.5" /> : t === "expense" ? <TrendingDown className="w-3.5 h-3.5" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
                {t === "income" ? "Thu" : t === "expense" ? "Chi" : "Chuyển"}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="amount">Số tiền (VND)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="0"
              value={form.amount}
              onChange={e => set("amount", e.target.value)}
              data-testid="input-amount"
              min={0}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Danh mục</Label>
            <Select value={form.categoryId} onValueChange={v => set("categoryId", v)}>
              <SelectTrigger data-testid="select-category">
                <SelectValue placeholder="Chọn danh mục" />
              </SelectTrigger>
              <SelectContent>
                {filteredCats.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="flex items-center gap-2">
                      <span>{c.icon}</span>
                      <span>{c.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Wallet + Member */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{form.type === "transfer" ? "Ví đi" : "Ví tiền"}</Label>
              <Select value={form.walletId} onValueChange={v => set("walletId", v)}>
                <SelectTrigger data-testid="select-wallet">
                  <SelectValue placeholder="Chọn ví" />
                </SelectTrigger>
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
                  <SelectTrigger data-testid="select-to-wallet">
                    <SelectValue placeholder="Chọn ví đến" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets
                      .filter(w => String(w.id) !== form.walletId)
                      .map(w => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Thành viên</Label>
                <Select value={form.memberId} onValueChange={v => set("memberId", v)}>
                  <SelectTrigger data-testid="select-member">
                    <SelectValue placeholder="Chọn người" />
                  </SelectTrigger>
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
                <SelectTrigger data-testid="select-member-transfer">
                  <SelectValue placeholder="Chọn người" />
                </SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date + Note */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ngày</Label>
              <Input
                type="date"
                value={form.date}
                onChange={e => set("date", e.target.value)}
                data-testid="input-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ghi chú</Label>
              <Input
                placeholder="Tùy chọn"
                value={form.note}
                onChange={e => set("note", e.target.value)}
                data-testid="input-note"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={isPending} data-testid="btn-submit-tx">
              {isPending ? "Đang lưu..." : editing ? "Cập nhật" : "Thêm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Transactions() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [typeFilter, setTypeFilter] = useState("all");
  const [memberFilter, setMemberFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionWithDetails | null>(null);
  const { toast } = useToast();

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

  const params = new URLSearchParams({ month });
  if (typeFilter !== "all") params.set("type", typeFilter);
  if (memberFilter !== "all") params.set("memberId", memberFilter);

  const { data: transactions = [], isLoading } = useQuery<TransactionWithDetails[]>({
    queryKey: ["/api/transactions", { month, typeFilter, memberFilter }],
    queryFn: () => apiRequest("GET", `/api/transactions?${params}`).then(r => r.json()),
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
    mutationFn: (id: number) => apiRequest("DELETE", `/api/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "Đã xóa giao dịch" });
    },
    onError: (err: Error) => toast({ title: "Không thể xóa", description: err.message, variant: "destructive" }),
  });

  const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Giao dịch</h1>
          <p className="text-sm text-muted-foreground">Quản lý thu chi gia đình</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} data-testid="btn-add-tx">
          <PlusCircle className="w-4 h-4 mr-1.5" />
          Thêm giao dịch
        </Button>
      </div>

      {/* Month picker */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-secondary rounded-lg px-2 py-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium px-1 min-w-28 text-center">{getMonthLabel(month)}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Mini summary */}
        <div className="hidden sm:flex items-center gap-4 text-sm">
          <span className="text-green-600 dark:text-green-400 font-medium">+{formatCurrency(totalIncome)}</span>
          <span className="text-red-500 dark:text-red-400 font-medium">-{formatCurrency(totalExpense)}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="filter-type">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại</SelectItem>
            <SelectItem value="income">Thu nhập</SelectItem>
            <SelectItem value="expense">Chi tiêu</SelectItem>
            <SelectItem value="transfer">Chuyển khoản</SelectItem>
          </SelectContent>
        </Select>

        <Select value={memberFilter} onValueChange={setMemberFilter}>
          <SelectTrigger className="w-40 h-8 text-sm" data-testid="filter-member">
            <SelectValue placeholder="Thành viên" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả thành viên</SelectItem>
            {members.map(m => (
              <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Transaction list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center">
              <ArrowLeftRight className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground">Không có giao dịch nào</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>
                <PlusCircle className="w-4 h-4 mr-1.5" />
                Thêm giao dịch đầu tiên
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transactions.map(t => (
                <div key={t.id} data-testid={`tx-item-${t.id}`} className="flex items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-lg flex-shrink-0">
                      {t.category?.icon || "💰"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{t.category?.name}</p>
                        <TxTypeBadge type={t.type} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {t.member?.name} · {formatDate(t.date)}
                        {t.note && ` · ${t.note}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                    <span className={`text-sm font-semibold ${
                      t.type === "income" ? "text-green-600 dark:text-green-400" :
                      t.type === "expense" ? "text-red-500 dark:text-red-400" : "text-foreground"
                    }`}>
                      {t.type === "income" ? "+" : t.type === "expense" ? "-" : ""}{formatCurrency(t.amount)}
                    </span>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditing(t); setDialogOpen(true); }}
                      data-testid={`btn-edit-${t.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMut.mutate(t.id)}
                      data-testid={`btn-delete-${t.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TxDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        editing={editing}
        categories={categories}
        wallets={wallets}
        members={members}
      />
    </div>
  );
}
