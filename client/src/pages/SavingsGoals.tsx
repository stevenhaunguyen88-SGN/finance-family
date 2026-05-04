import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { SavingsGoal } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MoneyInput } from "@/components/MoneyInput";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  Target, PlusCircle, Pencil, Trash2, Plus, Minus,
  Trophy, Clock, CheckCircle2,
} from "lucide-react";

const ICON_PICKER = [
  "🎯", "🏠", "🚗", "✈️", "📱", "💻", "🎓", "💍",
  "👶", "🏋️", "🎵", "📚", "🏥", "🐾", "🎮", "☕",
  "🏖️", "🎄", "🎁", "💼", "🔧", "🌐", "🏦", "💎",
];

const COLOR_PICKER = [
  "#01696F", "#437a22", "#964219", "#7a39bb", "#a12c7b",
  "#da7101", "#006494", "#a13544", "#d19900", "#374151",
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c",
];

interface GoalFormData {
  name: string;
  icon: string;
  color: string;
  targetAmount: number;
  deadline: string;
  note: string;
}

function GoalDialog({
  open, onClose, editing,
}: { open: boolean; onClose: () => void; editing: SavingsGoal | null }) {
  const { toast } = useToast();
  const [form, setForm] = useState<GoalFormData>(() =>
    editing
      ? {
          name: editing.name,
          icon: editing.icon,
          color: editing.color,
          targetAmount: editing.targetAmount,
          deadline: editing.deadline ?? "",
          note: editing.note ?? "",
        }
      : { name: "", icon: "🎯", color: COLOR_PICKER[0], targetAmount: 0, deadline: "", note: "" }
  );

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/savings-goals", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      toast({ title: "Đã tạo mục tiêu" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/savings-goals/${editing?.id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      toast({ title: "Đã cập nhật" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast({ title: "Nhập tên mục tiêu", variant: "destructive" });
    if (form.targetAmount <= 0) return toast({ title: "Số tiền mục tiêu phải lớn hơn 0", variant: "destructive" });

    const payload = {
      name: form.name.trim(),
      icon: form.icon,
      color: form.color,
      targetAmount: form.targetAmount,
      deadline: form.deadline || null,
      note: form.note.trim() || null,
    };

    if (editing) {
      updateMut.mutate(payload);
    } else {
      createMut.mutate(payload);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={editing ? "Sửa mục tiêu" : "Thêm mục tiêu tiết kiệm"}
      desktopWidthClassName="sm:max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Preview */}
        <div className="flex justify-center">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: form.color + "20" }}
          >
            {form.icon}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Tên mục tiêu</Label>
          <Input
            placeholder="VD: Mua nhà, Du lịch Đà Lạt..."
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Số tiền mục tiêu</Label>
          <MoneyInput
            value={form.targetAmount}
            onChange={v => setForm(f => ({ ...f, targetAmount: v }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Hạn chót (tùy chọn)</Label>
          <Input
            type="date"
            value={form.deadline}
            onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Ghi chú (tùy chọn)</Label>
          <Input
            placeholder="Ghi chú thêm..."
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Biểu tượng</Label>
          <div className="flex flex-wrap gap-1.5">
            {ICON_PICKER.map(icon => (
              <button
                key={icon}
                type="button"
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-transform ${
                  form.icon === icon
                    ? "ring-2 ring-primary ring-offset-1 scale-110 bg-primary/10"
                    : "hover:bg-accent hover:scale-105"
                }`}
                onClick={() => setForm(f => ({ ...f, icon }))}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Màu sắc</Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_PICKER.map(c => (
              <button
                key={c}
                type="button"
                className={`w-7 h-7 rounded-full transition-transform ${
                  form.color === c
                    ? "ring-2 ring-offset-2 ring-foreground scale-110"
                    : "hover:scale-105"
                }`}
                style={{ backgroundColor: c }}
                onClick={() => setForm(f => ({ ...f, color: c }))}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Đang lưu..." : editing ? "Cập nhật" : "Tạo mục tiêu"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

function ContributeDialog({
  open, onClose, goal,
}: { open: boolean; onClose: () => void; goal: SavingsGoal }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState(0);
  const [isWithdraw, setIsWithdraw] = useState(false);

  const contributeMut = useMutation({
    mutationFn: (amt: number) =>
      apiRequest("POST", `/api/savings-goals/${goal.id}/contribute`, { amount: amt }).then(r => r.json()),
    onSuccess: (data: SavingsGoal) => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      if (data.isCompleted) {
        toast({ title: "Chúc mừng! Mục tiêu đã hoàn thành!" });
      } else {
        toast({ title: isWithdraw ? "Đã rút tiền" : "Đã thêm tiền" });
      }
      onClose();
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return toast({ title: "Nhập số tiền hợp lệ", variant: "destructive" });
    contributeMut.mutate(isWithdraw ? -amount : amount);
  };

  const remaining = goal.targetAmount - goal.currentAmount;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={`${goal.icon} ${goal.name}`}
      desktopWidthClassName="sm:max-w-sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">
            Đã tiết kiệm: <span className="font-semibold text-foreground">{formatCurrency(goal.currentAmount)}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Còn thiếu: <span className="font-semibold text-foreground">{formatCurrency(Math.max(0, remaining))}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={!isWithdraw ? "default" : "outline"}
            className="flex-1"
            onClick={() => setIsWithdraw(false)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Thêm tiền
          </Button>
          <Button
            type="button"
            variant={isWithdraw ? "default" : "outline"}
            className="flex-1"
            onClick={() => setIsWithdraw(true)}
          >
            <Minus className="w-4 h-4 mr-1" />
            Rút tiền
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>Số tiền</Label>
          <MoneyInput value={amount} onChange={setAmount} />
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={contributeMut.isPending}>
            {contributeMut.isPending ? "Đang xử lý..." : isWithdraw ? "Rút" : "Thêm"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

export default function SavingsGoals() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [contributing, setContributing] = useState<SavingsGoal | null>(null);
  const { toast } = useToast();

  const { data: goals = [], isLoading } = useQuery<SavingsGoal[]>({
    queryKey: ["/api/savings-goals"],
    queryFn: () => apiRequest("GET", "/api/savings-goals").then(r => r.json()),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/savings-goals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      toast({ title: "Đã xóa mục tiêu" });
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const activeGoals = goals.filter(g => !g.isCompleted);
  const completedGoals = goals.filter(g => g.isCompleted);

  const totalTarget = activeGoals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = activeGoals.reduce((s, g) => s + g.currentAmount, 0);

  const renderGoalCard = (g: SavingsGoal) => {
    const percent = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
    const isOverdue = g.deadline && new Date(g.deadline) < new Date() && !g.isCompleted;

    return (
      <Card key={g.id} className={g.isCompleted ? "opacity-75" : ""}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{ backgroundColor: g.color + "20" }}
              >
                {g.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{g.name}</p>
                  {g.isCompleted && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">
                      <CheckCircle2 className="w-3 h-3 mr-0.5" />
                      Hoàn thành
                    </Badge>
                  )}
                  {isOverdue && (
                    <Badge variant="destructive" className="text-[10px]">
                      <Clock className="w-3 h-3 mr-0.5" />
                      Quá hạn
                    </Badge>
                  )}
                </div>
                {g.deadline && (
                  <p className="text-xs text-muted-foreground">
                    Hạn: {formatDate(g.deadline)}
                  </p>
                )}
                {g.note && (
                  <p className="text-xs text-muted-foreground mt-0.5">{g.note}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!g.isCompleted && (
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setContributing(g)}
                  title="Thêm/rút tiền"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => { setEditing(g); setDialogOpen(true); }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <ConfirmButton
                title="Xóa mục tiêu?"
                description={`Xóa "${g.name}" vĩnh viễn. Thao tác này không thể hoàn tác.`}
                onConfirm={() => deleteMut.mutate(g.id)}
              >
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </ConfirmButton>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {formatCurrency(g.currentAmount)}
              </span>
              <span className="font-medium">{percent}%</span>
              <span className="text-muted-foreground">
                {formatCurrency(g.targetAmount)}
              </span>
            </div>
            <Progress
              value={Math.min(percent, 100)}
              className={g.isCompleted ? "[&>div]:bg-green-500" : percent >= 80 ? "[&>div]:bg-amber-500" : ""}
            />
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Mục tiêu tiết kiệm
          </h1>
          <p className="text-sm text-muted-foreground">Theo dõi tiến độ tiết kiệm gia đình</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <PlusCircle className="w-4 h-4 mr-1.5" />
          Thêm
        </Button>
      </div>

      {/* Summary stats */}
      {activeGoals.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Đã tiết kiệm</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">
                {formatCurrency(totalSaved)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Còn thiếu</p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {formatCurrency(Math.max(0, totalTarget - totalSaved))}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Goal list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : goals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground mb-3">Chưa có mục tiêu tiết kiệm nào</p>
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              <PlusCircle className="w-4 h-4 mr-1.5" />
              Tạo mục tiêu đầu tiên
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Active goals */}
          {activeGoals.length > 0 && (
            <div className="space-y-2.5">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Đang thực hiện ({activeGoals.length})
              </h2>
              {activeGoals.map(renderGoalCard)}
            </div>
          )}

          {/* Completed goals */}
          {completedGoals.length > 0 && (
            <div className="space-y-2.5">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" />
                Đã hoàn thành ({completedGoals.length})
              </h2>
              {completedGoals.map(renderGoalCard)}
            </div>
          )}
        </>
      )}

      <GoalDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        editing={editing}
      />

      {contributing && (
        <ContributeDialog
          key={`contribute-${contributing.id}`}
          open={!!contributing}
          onClose={() => setContributing(null)}
          goal={contributing}
        />
      )}
    </div>
  );
}
