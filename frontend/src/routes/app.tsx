import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { AmbientBackground } from "@/components/ambient-background";
import { LayoutDashboard, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AppNavPillTab = { to: string; label: string; icon: LucideIcon };

function AppNavPill({ tab, path, className }: { tab: AppNavPillTab; path: string; className?: string }) {
  const active = path === tab.to;
  const Icon = tab.icon;
  return (
    <Link
      to={tab.to}
      className={cn(
        "group relative flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition duration-300",
        active
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
          : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
        className,
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition duration-300",
          active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      {tab.label}
      {active ? <span className="absolute inset-0 -z-10 rounded-full ring-1 ring-primary/20" /> : null}
    </Link>
  );
}

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center">
        <AmbientBackground />
        <div
          className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card/80 px-8 py-5 shadow-lg backdrop-blur-md animate-in fade-in zoom-in-95 duration-500"
          role="status"
        >
          <div className="h-5 w-5 animate-pulse rounded-full bg-primary" />
          <span className="text-sm font-medium text-muted-foreground">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  const homeTab = { to: "/app" as const, label: t("nav.dashboard"), icon: LayoutDashboard };
  const profileTab = { to: "/app/profile" as const, label: t("nav.profile"), icon: User };

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <header className="sticky top-0 z-50 border-b border-border/40 bg-card/70 backdrop-blur-xl supports-[backdrop-filter]:bg-card/50">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <Link
            to="/app"
            className="group flex min-w-0 items-center gap-2.5 transition active:scale-[0.98] sm:gap-3"
          >
            <div
              className="h-8 w-8 shrink-0 rounded-lg shadow-md shadow-primary/20 transition group-hover:scale-105"
              style={{ background: "var(--gradient-hero)" }}
            />
            <span className="truncate text-base font-semibold tracking-tight">UNMAPPED</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={async () => {
                await signOut();
                navigate({ to: "/" });
              }}
            >
              {t("common.signOut")}
            </Button>
          </div>
        </div>
        <nav className="container mx-auto flex items-center justify-between gap-2 px-4 pb-3 sm:px-6 sm:pb-3.5">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <AppNavPill path={path} tab={homeTab} />
          </div>
          <AppNavPill path={path} tab={profileTab} className="shrink-0" />
        </nav>
      </header>
      <main className="container relative mx-auto px-4 py-8 sm:px-6">
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
