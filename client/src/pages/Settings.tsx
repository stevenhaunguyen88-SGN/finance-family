import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { User, Lock, Info, Shield } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePwMut = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/auth/change-password", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Đã đổi mật khẩu thành công" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: Error) => {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    },
  });

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast({ title: "Vui lòng nhập đầy đủ mật khẩu", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Mật khẩu mới phải có ít nhất 6 ký tự", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Mật khẩu xác nhận không khớp", variant: "destructive" });
      return;
    }
    changePwMut.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">Quản lý tài khoản và thông tin ứng dụng</p>
      </div>

      {/* User Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" />
            Thông tin tài khoản
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">{user?.username ?? "—"}</p>
              <p className="text-sm text-muted-foreground">ID: {user?.id ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Đổi mật khẩu
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-pw">Mật khẩu hiện tại</Label>
              <Input
                id="current-pw"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">Mật khẩu mới</Label>
              <Input
                id="new-pw"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Xác nhận mật khẩu mới</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={changePwMut.isPending}>
              {changePwMut.isPending ? "Đang xử lý..." : "Đổi mật khẩu"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* App Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4" />
            Thông tin ứng dụng
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Ứng dụng</dt>
            <dd className="font-medium text-foreground">Family Finance</dd>
            <dt className="text-muted-foreground">Phiên bản</dt>
            <dd className="font-medium text-foreground">1.0.0</dd>
            <dt className="text-muted-foreground">Stack</dt>
            <dd className="font-medium text-foreground">React + Express + SQLite</dd>
            <dt className="text-muted-foreground">Ngôn ngữ</dt>
            <dd className="font-medium text-foreground">Tiếng Việt</dd>
          </dl>
        </CardContent>
      </Card>

      {/* Security Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Bảo mật
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            <li>Mật khẩu được mã hóa bằng bcrypt trước khi lưu trữ</li>
            <li>Phiên đăng nhập được bảo vệ bằng cookie httpOnly + sameSite</li>
            <li>Giới hạn số lần đăng nhập sai (rate-limit)</li>
            <li>Header bảo mật được thiết lập bởi Helmet</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
