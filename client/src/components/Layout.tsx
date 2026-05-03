import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ArrowLeftRight, Wallet, Users,
  TrendingUp, Sun, Moon, LogOut
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/transactions", label: "Giao dịch", icon: ArrowLeftRight },
  { href: "/wallets", label: "Ví tiền", icon: Wallet },
  { href: "/members", label: "Thành viên", icon: Users },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
        <TrendingUp className="w-4 h-4 text-primary-foreground" />
      </div>
      <div>
        <div className="text-sm font-bold leading-none text-foreground">Family</div>
        <div className="text-xs text-muted-foreground leading-none mt-0.5">Finance</div>
      </div>
    </div>
  );
}

function SidebarNavLink({ href, label, icon: Icon }: { href: string; label: string; icon: any }) {
  const [location] = useLocation();
  const isActive = location === href;
  return (
    <Link href={href}>
      <a
        data-testid={`nav-${href.replace("/", "") || "dashboard"}`}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        {label}
      </a>
    </Link>
  );
}

function BottomNavLink({ href, label, icon: Icon }: { href: string; label: string; icon: any }) {
  const [location] = useLocation();
  const isActive = location === href;
  return (
    <Link href={href}>
      <a
        data-testid={`bottom-nav-${href.replace("/", "") || "dashboard"}`}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 text-[11px] font-medium transition-colors",
          isActive
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Icon className={cn("w-5 h-5", isActive && "stroke-[2.25]")} />
        <span>{label}</span>
      </a>
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const { user, logout, isLoggingOut } = useAuth();

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-border bg-card">
        <nav className="flex flex-col gap-1 p-3 h-full">
          <div className="mb-4 px-1">
            <Logo />
          </div>
          <div className="flex-1 space-y-0.5">
            {navItems.map(item => (
              <SidebarNavLink key={item.href} {...item} />
            ))}
          </div>
          <div className="pt-3 border-t border-border space-y-0.5">
            {user && (
              <div className="px-3 py-1.5 text-xs text-muted-foreground truncate" data-testid="text-current-user">
                Đăng nhập: <span className="font-medium text-foreground">{user.username}</span>
              </div>
            )}
            <button
              onClick={toggleTheme}
              data-testid="btn-toggle-theme"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {dark ? "Chế độ sáng" : "Chế độ tối"}
            </button>
            <button
              onClick={() => logout()}
              disabled={isLoggingOut}
              data-testid="btn-logout"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
              {isLoggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
            </button>
          </div>
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <Logo />
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              data-testid="btn-toggle-theme-mobile"
              className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => logout()}
              disabled={isLoggingOut}
              data-testid="btn-logout-mobile"
              className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
              aria-label="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page content. Bottom padding leaves room for the mobile tab bar. */}
        <main className="flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
          data-testid="bottom-nav"
        >
          <div className="flex items-stretch">
            {navItems.map(item => (
              <BottomNavLink key={item.href} {...item} />
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
