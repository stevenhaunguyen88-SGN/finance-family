import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getRoleLabel } from "@/lib/utils";
import type { FamilyMember, InsertMember } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Users, PlusCircle, Pencil, Trash2, ShieldCheck, User, Baby } from "lucide-react";

const roleColors: Record<string, string> = {
  admin: "bg-primary/10 text-primary",
  member: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  child: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const roleIcons: Record<string, any> = {
  admin: ShieldCheck,
  member: User,
  child: Baby,
};

const avatarColors = [
  "#01696F", "#437a22", "#964219", "#7a39bb", "#a12c7b",
  "#da7101", "#006494", "#a13544", "#d19900", "#437a22",
];

interface MemberFormData {
  name: string;
  role: "admin" | "member" | "child";
  avatarColor: string;
}

function MemberDialog({
  open, onClose, editing
}: { open: boolean; onClose: () => void; editing: FamilyMember | null }) {
  const { toast } = useToast();
  const [form, setForm] = useState<MemberFormData>(() =>
    editing
      ? { name: editing.name, role: editing.role as any, avatarColor: editing.avatarColor }
      : { name: "", role: "member", avatarColor: avatarColors[0] }
  );

  const createMut = useMutation({
    mutationFn: (data: Partial<InsertMember>) => apiRequest("POST", "/api/members", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Đã thêm thành viên" });
      onClose();
    },
    onError: () => toast({ title: "Lỗi", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<InsertMember>) => apiRequest("PATCH", `/api/members/${editing?.id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Đã cập nhật" });
      onClose();
    },
    onError: () => toast({ title: "Lỗi", variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return toast({ title: "Nhập tên thành viên", variant: "destructive" });
    editing ? updateMut.mutate(form) : createMut.mutate(form);
  };

  const set = (k: keyof MemberFormData, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isPending = createMut.isPending || updateMut.isPending;

  // Avatar initials
  const initials = form.name ? form.name.split(" ").slice(-2).map(w => w[0]).join("").toUpperCase() : "?";

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Sửa thành viên" : "Thêm thành viên"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Preview avatar */}
          <div className="flex justify-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold"
              style={{ backgroundColor: form.avatarColor }}
            >
              {initials}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Họ tên</Label>
            <Input placeholder="VD: Nguyễn Văn A" value={form.name} onChange={e => set("name", e.target.value)} data-testid="input-member-name" />
          </div>

          <div className="space-y-1.5">
            <Label>Vai trò</Label>
            <Select value={form.role} onValueChange={v => set("role", v)}>
              <SelectTrigger data-testid="select-member-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">👑 Quản trị (Admin)</SelectItem>
                <SelectItem value="member">👤 Thành viên</SelectItem>
                <SelectItem value="child">👶 Con nhỏ</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Màu avatar</Label>
            <div className="flex flex-wrap gap-2">
              {avatarColors.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`w-7 h-7 rounded-full transition-transform ${form.avatarColor === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : "hover:scale-105"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => set("avatarColor", c)}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={isPending} data-testid="btn-submit-member">
              {isPending ? "Đang lưu..." : editing ? "Cập nhật" : "Thêm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Members() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FamilyMember | null>(null);
  const { toast } = useToast();

  const { data: members = [], isLoading } = useQuery<FamilyMember[]>({
    queryKey: ["/api/members"],
    queryFn: () => apiRequest("GET", "/api/members").then(r => r.json()),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/members/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Đã xóa thành viên" });
    },
    onError: (err: Error) => toast({ title: "Không thể xóa", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Thành viên</h1>
          <p className="text-sm text-muted-foreground">Quản lý thành viên gia đình và phân quyền</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} data-testid="btn-add-member">
          <PlusCircle className="w-4 h-4 mr-1.5" />
          Thêm thành viên
        </Button>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { role: "admin", desc: "Toàn quyền quản lý" },
          { role: "member", desc: "Xem & thêm giao dịch" },
          { role: "child", desc: "Xem mục tiêu cá nhân" },
        ].map(({ role, desc }) => {
          const Icon = roleIcons[role];
          return (
            <div key={role} className={`p-3 rounded-lg ${roleColors[role]} bg-opacity-50`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">{getRoleLabel(role)}</span>
              </div>
              <p className="text-xs opacity-75">{desc}</p>
            </div>
          );
        })}
      </div>

      {/* Member list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : members.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground mb-3">Chưa có thành viên nào</p>
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              <PlusCircle className="w-4 h-4 mr-1.5" />
              Thêm thành viên đầu tiên
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {members.map(m => {
            const Icon = roleIcons[m.role] || User;
            const initials = m.name.split(" ").slice(-2).map((w: string) => w[0]).join("").toUpperCase();
            return (
              <Card key={m.id} data-testid={`member-item-${m.id}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: m.avatarColor }}
                    >
                      {initials}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{m.name}</p>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[m.role]}`}>
                          <Icon className="w-3 h-3" />
                          {getRoleLabel(m.role)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {m.role === "admin" ? "Quản trị viên gia đình" : m.role === "member" ? "Thành viên gia đình" : "Con nhỏ"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditing(m); setDialogOpen(true); }}
                      data-testid={`btn-edit-member-${m.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMut.mutate(m.id)}
                      data-testid={`btn-delete-member-${m.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <MemberDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        editing={editing}
      />
    </div>
  );
}
