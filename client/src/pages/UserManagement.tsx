import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { ConfirmButton } from "@/components/ConfirmButton";
import { UserCog, PlusCircle, Pencil, Trash2, ShieldCheck, Key } from "lucide-react";

type SafeUser = { id: number; username: string; createdAt: string };

interface UserFormData {
  username: string;
  password: string;
  confirmPassword: string;
}

function UserDialog({
  open, onClose, editing,
}: { open: boolean; onClose: () => void; editing: SafeUser | null }) {
  const { toast } = useToast();
  const [form, setForm] = useState<UserFormData>(() =>
    editing
      ? { username: editing.username, password: "", confirmPassword: "" }
      : { username: "", password: "", confirmPassword: "" }
  );

  const createMut = useMutation({
    mutationFn: (data: { username: string; password: string }) =>
      apiRequest("POST", "/api/users", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Đã tạo tài khoản" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: { username?: string; password?: string }) =>
      apiRequest("PATCH", `/api/users/${editing?.id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Đã cập nhật" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim()) return toast({ title: "Nhập tên đăng nhập", variant: "destructive" });

    if (editing) {
      const updates: { username?: string; password?: string } = {};
      if (form.username.trim() !== editing.username) updates.username = form.username.trim();
      if (form.password) {
        if (form.password.length < 6) return toast({ title: "Mật khẩu phải ít nhất 6 ký tự", variant: "destructive" });
        if (form.password !== form.confirmPassword) return toast({ title: "Mật khẩu xác nhận không khớp", variant: "destructive" });
        updates.password = form.password;
      }
      if (Object.keys(updates).length === 0) return toast({ title: "Không có thay đổi", variant: "destructive" });
      updateMut.mutate(updates);
    } else {
      if (form.password.length < 6) return toast({ title: "Mật khẩu phải ít nhất 6 ký tự", variant: "destructive" });
      if (form.password !== form.confirmPassword) return toast({ title: "Mật khẩu xác nhận không khớp", variant: "destructive" });
      createMut.mutate({ username: form.username.trim(), password: form.password });
    }
  };

  const set = (k: keyof UserFormData, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={editing ? "Sửa tài khoản" : "Thêm tài khoản"}
      desktopWidthClassName="sm:max-w-sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Tên đăng nhập</Label>
          <Input
            placeholder="VD: alice, bob..."
            value={form.username}
            onChange={e => set("username", e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label>{editing ? "Mật khẩu mới (bỏ trống nếu không đổi)" : "Mật khẩu"}</Label>
          <Input
            type="password"
            placeholder={editing ? "Để trống nếu giữ nguyên" : "Ít nhất 6 ký tự"}
            value={form.password}
            onChange={e => set("password", e.target.value)}
            autoComplete="new-password"
          />
        </div>

        {(form.password || !editing) && (
          <div className="space-y-1.5">
            <Label>Xác nhận mật khẩu</Label>
            <Input
              type="password"
              placeholder="Nhập lại mật khẩu"
              value={form.confirmPassword}
              onChange={e => set("confirmPassword", e.target.value)}
              autoComplete="new-password"
            />
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Đang lưu..." : editing ? "Cập nhật" : "Thêm"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

export default function UserManagement() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SafeUser | null>(null);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const { data: userList = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users").then(r => r.json()),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Đã xóa tài khoản" });
    },
    onError: (err: Error) => toast({ title: "Không thể xóa", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <UserCog className="w-5 h-5 text-primary" />
            Quản lý tài khoản
          </h1>
          <p className="text-sm text-muted-foreground">Tạo, sửa, xóa tài khoản đăng nhập</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <PlusCircle className="w-4 h-4 mr-1.5" />
          Thêm
        </Button>
      </div>

      {/* User list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : userList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserCog className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground mb-3">Chưa có tài khoản nào</p>
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              <PlusCircle className="w-4 h-4 mr-1.5" />
              Tạo tài khoản đầu tiên
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {userList.map(u => {
            const isSelf = currentUser?.id === u.id;
            return (
              <Card key={u.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{u.username}</p>
                        {isSelf && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                            Bạn
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        ID: {u.id} · Tạo: {formatDate(u.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => { setEditing(u); setDialogOpen(true); }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {!isSelf && (
                      <ConfirmButton
                        title="Xóa tài khoản?"
                        description={`Xóa "${u.username}" vĩnh viễn. Thao tác này không thể hoàn tác.`}
                        onConfirm={() => deleteMut.mutate(u.id)}
                      >
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </ConfirmButton>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Info card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Key className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Mật khẩu được mã hóa bằng bcrypt trước khi lưu trữ.</p>
              <p>Không thể xóa tài khoản đang đăng nhập hoặc tài khoản cuối cùng.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <UserDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        editing={editing}
      />
    </div>
  );
}
