import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SkillsWorkspace } from "@/components/skills-workspace";

export const Route = createFileRoute("/app/")({
  component: SkillsHomePage,
});

function SkillsHomePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [skillsCount, setSkillsCount] = useState(0);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDashboardStats = useCallback(async () => {
    if (!user) return;
    const [{ count: s }, { data: prof }] = await Promise.all([
      supabase
        .from("user_skills")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    ]);
    setSkillsCount(s ?? 0);
    setName(prof?.full_name ?? "");
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      await loadDashboardStats();
      setLoading(false);
    })();
  }, [user, loadDashboardStats]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="rounded-3xl border border-border/50 bg-gradient-to-br from-primary/[0.07] to-card/80 p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 shrink-0 rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full max-w-sm" />
              </div>
            </div>
            <div className="shrink-0 sm:text-end">
              <Skeleton className="h-12 w-20 sm:ms-auto" />
              <Skeleton className="mt-1 h-3 w-24 sm:ms-auto" />
            </div>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[min(76dvh,32rem)] min-h-64 rounded-3xl" />
          <Skeleton className="h-96 min-h-64 rounded-3xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section
        className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-primary/[0.08] via-card/95 to-card/80 shadow-sm shadow-primary/[0.03] ring-1 ring-border/30 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-500"
        aria-label={t("dash.heroTitle")}
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_50%_at_20%_0%,hsl(var(--primary)/0.12),transparent)]" />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-8">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-inner shadow-primary/5"
              aria-hidden
            >
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-lg font-semibold leading-snug text-foreground sm:text-xl">
                {t("dash.heroTitle")}
              </h2>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground sm:max-w-lg">
                {skillsCount === 0 ? t("dash.heroEmpty") : t("dash.heroWithSkills")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end sm:text-end">
            <div>
              <p className="text-4xl font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-5xl">
                {skillsCount}
              </p>
              <p className="mt-1.5 text-xs font-medium leading-snug text-muted-foreground sm:max-w-[10rem] sm:text-end">
                {skillsCount === 0
                  ? t("dash.tallySubZero")
                  : skillsCount === 1
                    ? t("dash.tallySubOne")
                    : t("dash.tallySubMany")}
              </p>
            </div>
            <Button
              asChild
              size="sm"
              className="w-full rounded-full shadow-md shadow-primary/10 sm:w-auto"
            >
              <a href="#skills-workspace">{t("dash.addSkillsCta")}</a>
            </Button>
          </div>
        </div>
      </section>

      <SkillsWorkspace onUserSkillsMutated={loadDashboardStats} showBackLink={false} />
    </div>
  );
}
