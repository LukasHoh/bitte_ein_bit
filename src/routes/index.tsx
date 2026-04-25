import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <header className="container mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg" style={{ background: "var(--gradient-hero)" }} />
          <span className="text-lg font-semibold">UNMAPPED</span>
        </div>
        <nav className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link to="/auth">
            <Button variant="ghost">{t("common.signIn")}</Button>
          </Link>
          <Link to="/auth">
            <Button>{t("common.getStarted")}</Button>
          </Link>
        </nav>
      </header>

      <main>
        <section className="container mx-auto px-6 py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-tight tracking-tight md:text-6xl">
            {t("landing.title.a")}{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-hero)" }}
            >
              {t("landing.title.b")}
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            {t("landing.subtitle")}
          </p>
        </section>

        <section className="container mx-auto grid gap-6 px-6 pb-24 md:grid-cols-2">
          <div className="flex flex-col rounded-2xl border bg-card p-8 shadow-sm transition hover:shadow-md">
            <h2 className="text-2xl font-bold">{t("landing.seeker.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("landing.seeker.desc")}</p>
            <Link to="/auth" className="mt-6">
              <Button size="lg" className="w-full shadow-lg">
                {t("landing.seeker.cta")}
              </Button>
            </Link>
          </div>

          <div className="flex flex-col rounded-2xl border bg-card p-8 shadow-sm transition hover:shadow-md">
            <h2 className="text-2xl font-bold">{t("landing.ngo.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("landing.ngo.desc")}</p>
            <Link to="/auth" className="mt-6">
              <Button size="lg" variant="outline" className="w-full">
                {t("landing.ngo.cta")}
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        {t("landing.footer")}
      </footer>
    </div>
  );
}
