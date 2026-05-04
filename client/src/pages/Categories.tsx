import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Category } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Tag, PlusCircle, Pencil, Trash2, TrendingUp, TrendingDown, Lock } from "lucide-react";

const ICON_PICKER = [
  "💰", "🎁", "📈", "➕", "🍜", "🚗", "📚", "🏥",
  "💡", "🛒", "🏠", "🎮", "💸", "☕", "🎵", "✈️",
  "📱", "👶", "🐾", "💼", "🎯", "🏋️", "💳", "🔧",
  "🎓", "💊", "🌐", "🎬", "🍕", "🚌", "💇", "🎶",
];

const COLOR_PICKER = [
  "#01696F", "#437a22", "#964219", "#7a39bb", "#a12c7b",
  "#da7101", "#006494", "#a13544", "#d19900", "#374151",
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c",
];

interface CatFormData {
  name: string;
  icon: string;
  type: "income" | "expense";
  color: string;
}

function CategoryDialog({
  open, onClose, editing, defaultType,
}: {
  open: boolean;
  onClose: () => void;
  editing: Category | null;
  defaultType: "income" | "expense";
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<CatFormData>(() =>
    editing
      ? { name: editing.name, icon: editing.icon, type: editing.type as "income" | "expense", color: editing.color }
      : { name: "", icon: "💰", type: defaultType, color: COLOR_PICKER[0] }
  );

  const createMut = useMutation({
    mutationFn: (data: CatFormData) =>
      apiRequest("POST", "/api/categories", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Đã thêm danh mục" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<CatFormData>) =>
      apiRequest("PATCH", `/api/categories/${editing?.id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Đã cập nhật danh mục" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Lỗi", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast({ title: "Nhập tên danh mục", variant: "destructive" });
    if (editing) {
      updateMut.mutate({ name: form.name.trim(), icon: form.icon, color: form.color });
    } else {
      createMut.mutate({ ...form, name: form.name.trim() });
    }
  };

  const set = <K extends keyof CatFormData>(k: K, v: CatFormData[K]) =>
    setForm(f => ({ ...f, [k]: v }));
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={editing ? "Sửa danh mục" : "Thêm danh mục"}
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
          <Label>Tên danh mục</Label>
          <Input
            placeholder="VD: Tiền điện, Học thêm..."
            value={form.name}
            onChange={e => set("name", e.target.value)}
          />
        </div>

        {!editing && (
          <div className="space-y-1.5">
            <Label>Loại</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={form.type === "expense" ? "default" : "outline"}
                className="flex-1"
                onClick={() => set("type", "expense")}
              >
                <TrendingDown className="w-4 h-4 mr-1.5" />
                Chi tiêu
              </Button>
              <Button
                type="button"
                variant={form.type === "income" ? "default" : "outline"}
                className="flex-1"
                onClick={() => set("type", "income")}
              >
                <TrendingUp className="w-4 h-4 mr-1.5" />
                Thu nhập
              </Button>
            </div>
          </div>
        )}

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
                onClick={() => set("icon", icon)}
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
                onClick={() => set("color", c)}
              />
            ))}
          </div>
        </div>

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

export default function Categories() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [activeTab, setActiveTab] = useState<"expense" | "income">("expense");
  const { toast } = useToast();

  const { data: allCategories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: () => apiRequest("GET", "/api/categories").then(r => r.json()),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Đã xóa danh mục" });
    },
    onError: (err: Error) => toast({ title: "Không thể xóa", description: err.message, variant: "destructive" }),
  });

  const expenseCategories = allCategories.filter(c => c.type === "expense");
  const incomeCategories = allCategories.filter(c => c.type === "income");

  const renderCategoryList = (cats: Category[]) => {
    if (isLoading) {
      return (
        <div className="space-y-2.5">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      );
    }
    if (cats.length === 0) {
      return (
        <Card>
          <CardContent className="py-10 text-center">
            <Tag className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground mb-3">Chưa có danh mục nào</p>
            <Button variant="outline" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <PlusCircle className="w-4 h-4 mr-1.5" />
              Thêm danh mục
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-2">
        {cats.map(c => (
          <Card key={c.id}>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                  style={{ backgroundColor: c.color + "20" }}
                >
                  {c.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{c.name}</p>
                    {c.isDefault && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Lock className="w-3 h-3" />
                        Mặc định
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {!c.isDefault && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => { setEditing(c); setDialogOpen(true); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <ConfirmButton
                    title="Xóa danh mục?"
                    description={`Xóa "${c.name}" vĩnh viễn. Danh mục đang có giao dịch không thể xóa.`}
                    onConfirm={() => deleteMut.mutate(c.id)}
                  >
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </ConfirmButton>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            Danh mục
          </h1>
          <p className="text-sm text-muted-foreground">Quản lý danh mục thu nhập và chi tiêu</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <PlusCircle className="w-4 h-4 mr-1.5" />
          Thêm
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "expense" | "income")}>
        <TabsList className="w-full">
          <TabsTrigger value="expense" className="flex-1">
            <TrendingDown className="w-4 h-4 mr-1.5" />
            Chi tiêu
            <Badge variant="secondary" className="ml-1.5 text-xs">{expenseCategories.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="income" className="flex-1">
            <TrendingUp className="w-4 h-4 mr-1.5" />
            Thu nhập
            <Badge variant="secondary" className="ml-1.5 text-xs">{incomeCategories.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="expense" className="mt-3">
          {renderCategoryList(expenseCategories)}
        </TabsContent>
        <TabsContent value="income" className="mt-3">
          {renderCategoryList(incomeCategories)}
        </TabsContent>
      </Tabs>

      <CategoryDialog
        key={editing?.id ?? `new-${activeTab}`}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        editing={editing}
        defaultType={activeTab}
      />
    </div>
  );
}
