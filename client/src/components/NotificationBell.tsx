import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Bell, Check, CheckCheck, Trash2, X } from "lucide-react";
import type { Notification } from "@shared/schema";

const typeIcons: Record<string, string> = {
  budget_warning: "⚠️",
  budget_exceeded: "🚨",
  savings_milestone: "🎯",
  savings_completed: "🎉",
  recurring_processed: "🔄",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(dateStr).toLocaleDateString("vi-VN");
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: () => apiRequest("GET", "/api/notifications/unread-count").then(r => r.json()),
    refetchInterval: 30_000,
  });
  const unread = countData?.count ?? 0;

  const { data: items = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    queryFn: () => apiRequest("GET", "/api/notifications").then(r => r.json()),
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    qc.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
  };

  const markRead = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: invalidate,
  });

  const deleteOne = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: invalidate,
  });

  const clearAll = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/notifications"),
    onSuccess: () => {
      invalidate();
      setOpen(false);
    },
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        data-testid="btn-notifications"
        className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent relative"
        aria-label="Thông báo"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notification-panel"
          className="absolute right-0 top-11 w-80 max-h-[70vh] bg-card border border-border rounded-xl shadow-lg z-50 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Thông báo</h3>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                  data-testid="btn-mark-all-read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Đọc hết
                </button>
              )}
              {items.length > 0 && (
                <button
                  onClick={() => clearAll.mutate()}
                  className="text-xs text-muted-foreground hover:text-red-500 ml-2 flex items-center gap-1"
                  data-testid="btn-clear-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa hết
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                Không có thông báo
              </div>
            ) : (
              items.map(n => (
                <div
                  key={n.id}
                  data-testid={`notification-${n.id}`}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 border-b border-border/50 hover:bg-accent/50 transition-colors group",
                    !n.isRead && "bg-primary/5"
                  )}
                >
                  <span className="text-lg leading-none mt-0.5 flex-shrink-0">
                    {typeIcons[n.type] ?? "🔔"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm leading-snug", !n.isRead && "font-semibold")}>
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {!n.isRead && (
                      <button
                        onClick={() => markRead.mutate(n.id)}
                        className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-accent"
                        title="Đánh dấu đã đọc"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteOne.mutate(n.id)}
                      className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-accent"
                      title="Xóa"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
