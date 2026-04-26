import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, type AppRole } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { AmbientBackground } from "@/components/ambient-background";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function destinationFor(roles: AppRole[]): "/ngo" | "/app" {
  return roles.includes("ngo") ? "/ngo" : "/app";
}

function AuthPage() {
  const { t } = useI18n();
  const { user, roles, signIn, signUp, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [signupRole, setSignupRole] = useState<"seeker" | "ngo">("seeker");

  // Render the actual form only after the client mounts. The reason: password
  // managers (Dashlane, 1Password, LastPass…) inject icon overlays as extra
  // child nodes next to <input type="email|password"> *between* SSR and
  // hydration, which makes React 19 throw "Hydration failed". Skipping SSR for
  // the form leaves the extension nothing to attach to until after hydration
  // is already complete. `suppressHydrationWarning` alone doesn't help here
  // because it doesn't suppress mismatches caused by *extra* DOM children.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && user) navigate({ to: destinationFor(roles) });
  }, [user, roles, loading, navigate]);

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await signIn(String(fd.get("email")), String(fd.get("password")));
    setBusy(false);
    if (error) toast.error(error);
    // navigation happens via the useEffect once roles are loaded
  };

  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await signUp(
      String(fd.get("email")),
      String(fd.get("password")),
      String(fd.get("fullName")),
      signupRole,
    );

    setBusy(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success("Account created — you're signed in.");
    navigate({ to: signupRole === "ngo" ? "/ngo" : "/app" });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <AmbientBackground />
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <div className="flex items-center gap-1 rounded-full border border-border/50 bg-card/80 p-0.5 shadow-sm backdrop-blur-md">
          <ThemeToggle />
          <LanguageSwitcher variant="ghost" />
        </div>
      </div>
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
        <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/90 shadow-2xl shadow-primary/5 backdrop-blur-xl">
          <div
            className="h-1.5 w-full animate-gradient"
            style={{
              background:
                "linear-gradient(90deg, oklch(0.55 0.18 220), oklch(0.70 0.15 200), oklch(0.55 0.18 220))",
              backgroundSize: "200% 100%",
            }}
            aria-hidden
          />
          <div className="p-8 sm:p-10">
            <Link
              to="/"
              className="mb-6 inline-flex text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              ← {t("common.back")}
            </Link>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("auth.welcome")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

            {mounted ? (
              <Tabs defaultValue="signin" className="mt-8">
                <TabsList className="grid h-11 w-full grid-cols-2 rounded-full bg-muted/50 p-1">
                  <TabsTrigger value="signin" className="rounded-full data-[state=active]:shadow-sm">
                    {t("common.signIn")}
                  </TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-full data-[state=active]:shadow-sm">
                    {t("common.signUp")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="signin">
                  <form onSubmit={onSignIn} className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="si-email">{t("common.email")}</Label>
                      <Input
                        id="si-email"
                        name="email"
                        type="email"
                        required
                        className="h-11 rounded-xl transition focus-visible:ring-2"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="si-pw">{t("common.password")}</Label>
                      <Input
                        id="si-pw"
                        name="password"
                        type="password"
                        required
                        minLength={6}
                        className="h-11 rounded-xl transition focus-visible:ring-2"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="h-11 w-full rounded-full shadow-md shadow-primary/20 transition duration-300 hover:shadow-lg"
                      disabled={busy}
                    >
                      {busy ? t("auth.signingIn") : t("common.signIn")}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  <form onSubmit={onSignUp} className="mt-6 space-y-4">
                    <div>
                      <Label>{t("auth.role.label")}</Label>
                      <RadioGroup
                        value={signupRole}
                        onValueChange={(v) => setSignupRole(v as "seeker" | "ngo")}
                        className="mt-2 grid grid-cols-2 gap-2"
                      >
                        <Label
                          htmlFor="role-seeker"
                          className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition duration-200 hover:border-primary/40 ${
                            signupRole === "seeker"
                              ? "border-primary bg-primary/8 shadow-sm"
                              : "border-border/80"
                          }`}
                        >
                          <RadioGroupItem id="role-seeker" value="seeker" />
                          {t("auth.role.seeker")}
                        </Label>
                        <Label
                          htmlFor="role-ngo"
                          className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm transition duration-200 hover:border-primary/40 ${
                            signupRole === "ngo"
                              ? "border-primary bg-primary/8 shadow-sm"
                              : "border-border/80"
                          }`}
                        >
                          <RadioGroupItem id="role-ngo" value="ngo" />
                          {t("auth.role.ngo")}
                        </Label>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-name">
                        {signupRole === "ngo" ? t("auth.orgName") : t("auth.fullName")}
                      </Label>
                      <Input
                        id="su-name"
                        name="fullName"
                        required
                        maxLength={120}
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-email">{t("common.email")}</Label>
                      <Input
                        id="su-email"
                        name="email"
                        type="email"
                        required
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-pw">{t("common.password")}</Label>
                      <Input
                        id="su-pw"
                        name="password"
                        type="password"
                        required
                        minLength={6}
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="h-11 w-full rounded-full shadow-md shadow-primary/20"
                      disabled={busy}
                    >
                      {busy ? t("auth.creating") : t("auth.create")}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            ) : (
              <AuthFormSkeleton />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Stable, input-free placeholder rendered during SSR + first client render.
// Keeps the auth card the same height as the real form so there is no layout
// shift when `mounted` flips and the actual <Tabs> mount client-side.
function AuthFormSkeleton() {
  return (
    <div className="mt-8 space-y-4" aria-hidden>
      <Skeleton className="h-11 w-full rounded-full" />
      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
    </div>
  );
}
