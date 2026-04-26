import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { AmbientBackground } from "@/components/ambient-background";
import { useI18n } from "@/lib/i18n";
import { Sparkles, ArrowRight, Building2, UserRound } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { t } = useI18n();
  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="group flex items-center gap-2.5">
            <div
              className="relative h-9 w-9 overflow-hidden rounded-xl shadow-lg shadow-primary/20 transition duration-500 group-hover:scale-105"
              style={{ background: "var(--gradient-hero)" }}
            />
            <span className="text-lg font-semibold tracking-tight">UNMAPPED</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
            <Link to="/auth">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                {t("common.signIn")}
              </Button>
            </Link>
            <Link to="/auth">
              <Button
                size="sm"
                className="group/btn gap-1.5 rounded-full shadow-md shadow-primary/20 transition duration-300 hover:shadow-lg hover:shadow-primary/30"
              >
                {t("common.getStarted")}
                <ArrowRight className="h-3.5 w-3.5 transition group-hover/btn:translate-x-0.5" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="container relative mx-auto px-4 pb-16 pt-20 text-center sm:px-6 md:pt-24 md:pb-20">
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-700">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Open skills layer
            </span>
          </div>
          <h1 className="mt-6 animate-in fade-in slide-in-from-bottom-4 fill-mode-both text-4xl font-extrabold leading-[1.08] tracking-tight delay-100 duration-700 sm:text-5xl md:text-6xl md:delay-75">
            {t("landing.title.a")}{" "}
            <span className="text-gradient-hero animate-gradient bg-[length:200%_auto]">
              {t("landing.title.b")}
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-in fade-in slide-in-from-bottom-3 fill-mode-both text-balance text-base text-muted-foreground delay-200 duration-700 md:text-lg md:delay-100">
            {t("landing.subtitle")}
          </p>
        </section>

        <section className="container mx-auto grid max-w-5xl gap-5 px-4 pb-24 sm:px-6 md:grid-cols-2 md:gap-6">
          <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-8 shadow-sm backdrop-blur-sm transition duration-500 hover:-translate-y-1 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition duration-500 group-hover:scale-110 group-hover:bg-primary/15">
              <UserRound className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">{t("landing.seeker.title")}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
              {t("landing.seeker.desc")}
            </p>
            <Link to="/auth" className="group/cta mt-8">
              <Button
                size="lg"
                className="w-full gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary/85 py-6 text-base font-semibold shadow-lg shadow-primary/25 transition duration-300 hover:scale-[1.02] hover:shadow-xl"
              >
                {t("landing.seeker.cta")}
                <ArrowRight className="h-4 w-4 transition group-hover/cta:translate-x-0.5" />
              </Button>
            </Link>
          </article>

          <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-8 shadow-sm backdrop-blur-sm transition duration-500 hover:-translate-y-1 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground transition duration-500 group-hover:scale-110">
              <Building2 className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">{t("landing.ngo.title")}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
              {t("landing.ngo.desc")}
            </p>
            <Link to="/auth" className="mt-8">
              <Button
                size="lg"
                variant="outline"
                className="w-full rounded-2xl border-2 py-6 text-base font-semibold transition duration-300 hover:scale-[1.02] hover:border-primary/40 hover:bg-primary/5"
              >
                {t("landing.ngo.cta")}
              </Button>
            </Link>
          </article>
        </section>
      </main>

      <footer className="border-t border-border/50 bg-card/30 py-10 backdrop-blur-sm">
        <div className="container mx-auto px-4 text-center sm:px-6">
          <p className="text-sm text-muted-foreground">{t("landing.footer")}</p>
        </div>
      </footer>
    </div>
  );
}
