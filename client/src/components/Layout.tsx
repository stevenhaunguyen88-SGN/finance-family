import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ArrowLeftRight, Wallet, Users,
  Menu, X, TrendingUp, Sun, Moon, LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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

function NavLink({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: any; onClick?: () => void }) {
  const [location] = useLocation();
  const isActive = location === href;
  return (
    <Link href={href}>
      <a
        onClick={onClick}
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

export default function Layout({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const { user, logout, isLoggingOut } = useAuth();

  const Sidebar = ({ mobile = false }) => (
    <nav className={cn("flex flex-col gap-1 p-3", !mobile && "h-full")}>
      <div className="mb-4 px-1">
        <Logo />
      </div>
      <div className="flex-1 space-y-0.5">
        {navItems.map(item => (
          <NavLink key={item.href} {...item} onClick={() => setMobileOpen(false)} />
        ))}
      </div>
      <div className="pt-3 border-t border-border space-y-0.5">
        {user && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground truncate" data-testid="text-current-user">
            Đăng nhập: <span className="font-medium text-foreground">{user.username}</span>
          </div>
        )}
        {!mobile && (
          <button
            onClick={toggleTheme}
            data-testid="btn-toggle-theme"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {dark ? "Chế độ sáng" : "Chế độ tối"}
          </button>
        )}
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
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col border-r border-border bg-card">
        <Sidebar />
      </aside>

      {/* Mobile header + drawer */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <Logo />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="btn-mobile-menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-56 p-0">
                <Sidebar mobile />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
