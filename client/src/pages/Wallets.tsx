import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, getWalletTypeLabel } from "@/lib/utils";
import type { Wallet, InsertWallet } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Wallet as WalletIcon, PlusCircle, Pencil, Trash2, Banknote, Building2, CreditCard, PiggyBank } from "lucide-react";

const walletIcons: Record<string, any> = {
  cash: Banknote,
  bank: Building2,
  credit: CreditCard,
  savings: PiggyBank,
};

const walletColors: Record<string, string> = {
  cash: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  bank: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  credit: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  savings: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

interface WalletFormData {
  name: string;
  type: "cash" | "bank" | "credit" | "savings";
  balance: string;
}

function WalletDialog({
  open, onClose, editing
}: { open: boolean; onClose: () => void; editing: Wallet | null }) {
  const { toast } = useToast();
  const [form, setForm] = useState<WalletFormData>(() =>
    editing
      ? { name: editing.name, type: editing.type as any, balance: String(editing.balance) }
      : { name: "", type: "cash", balance: "0" }
  );

  const createMut = useMutation({
    mutationFn: (data: Partial<InsertWallet>) => apiRequest("POST", "/api/wallets", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "Đã tạo ví" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<InsertWallet>) => apiRequest("PATCH", `/api/wallets/${editing?.id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "Đã cập nhật ví" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return toast({ title: "Nhập tên ví", variant: "destructive" });
    if (editing) {
      // Balance is derived from transactions and cannot be edited directly.
      updateMut.mutate({ name: form.name, type: form.type });
    } else {
      createMut.mutate({
        name: form.name,
        type: form.type,
        balance: parseFloat(form.balance) || 0,
      });
    }
  };

  const set = (k: keyof WalletFormData, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={editing ? "Sửa ví" : "Thêm ví mới"}
      desktopWidthClassName="sm:max-w-sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tên ví</Label>
            <Input placeholder="VD: Tiền mặt, VCB..." value={form.name} onChange={e => set("name", e.target.value)} data-testid="input-wallet-name" />
          </div>
          <div className="space-y-1.5">
            <Label>Loại ví</Label>
            <Select value={form.type} onValueChange={v => set("type", v)}>
              <SelectTrigger data-testid="select-wallet-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">💵 Tiền mặt</SelectItem>
                <SelectItem value="bank">🏦 Ngân hàng</SelectItem>
                <SelectItem value="credit">💳 Thẻ tín dụng</SelectItem>
                <SelectItem value="savings">🐷 Tiết kiệm</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {editing ? (
            <div className="space-y-1.5">
              <Label>Số dư hiện tại</Label>
              <Input value={String(editing.balance)} readOnly disabled />
              <p className="text-xs text-muted-foreground">
                Số dư được tính từ giao dịch — muốn điều chỉnh, hãy tạo một giao dịch “Khác” (Thu/Chi).
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Số dư ban đầu (VND)</Label>
              <Input type="number" min={0} value={form.balance} onChange={e => set("balance", e.target.value)} data-testid="input-wallet-balance" />
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={isPending} data-testid="btn-submit-wallet">
              {isPending ? "Đang lưu..." : editing ? "Cập nhật" : "Tạo ví"}
            </Button>
          </div>
        </form>
    </ResponsiveDialog>
  );
}

export default function Wallets() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Wallet | null>(null);
  const { toast } = useToast();

  const { data: wallets = [], isLoading } = useQuery<Wallet[]>({
    queryKey: ["/api/wallets"],
    queryFn: () => apiRequest("GET", "/api/wallets").then(r => r.json()),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/wallets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
      toast({ title: "Đã xóa ví" });
    },
    onError: (err: Error) => toast({ title: "Không thể xóa ví", description: err.message, variant: "destructive" }),
  });

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Ví tiền</h1>
          <p className="text-sm text-muted-foreground">Quản lý tài khoản và ví của gia đình</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} data-testid="btn-add-wallet">
          <PlusCircle className="w-4 h-4 mr-1.5" />
          Thêm ví
        </Button>
      </div>

      {/* Total balance card */}
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="pt-5 pb-4">
          <p className="text-sm opacity-80">Tổng số dư</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalBalance)}</p>
          <p className="text-xs opacity-60 mt-1">{wallets.length} ví · VND</p>
        </CardContent>
      </Card>

      {/* Wallet list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : wallets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <WalletIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground mb-3">Chưa có ví nào</p>
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              <PlusCircle className="w-4 h-4 mr-1.5" />
              Tạo ví đầu tiên
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {wallets.map(w => {
            const Icon = walletIcons[w.type] || WalletIcon;
            const colorClass = walletColors[w.type] || "bg-muted text-muted-foreground";
            return (
              <Card key={w.id} data-testid={`wallet-item-${w.id}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{w.name}</p>
                      <p className="text-xs text-muted-foreground">{getWalletTypeLabel(w.type)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-lg">{formatCurrency(w.balance)}</p>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditing(w); setDialogOpen(true); }}
                      data-testid={`btn-edit-wallet-${w.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <ConfirmButton
                      title={`Xóa ví “${w.name}”?`}
                      description="Ví sẽ không xóa được nếu đang có giao dịch liên quan."
                      onConfirm={() => deleteMut.mutate(w.id)}
                    >
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        data-testid={`btn-delete-wallet-${w.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </ConfirmButton>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* `key` forces a fresh form state every time we switch between editing
          a different wallet vs. creating a new one — without it the
          useState initializer captures the first `editing` value forever. */}
      <WalletDialog
        key={dialogOpen ? (editing?.id ?? "new") : "closed"}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        editing={editing}
      />
    </div>
  );
}
