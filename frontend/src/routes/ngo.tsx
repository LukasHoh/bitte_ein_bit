import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { AmbientBackground } from "@/components/ambient-background";
import { Upload, FileText, BarChart3, Users, Building2, LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/ngo")({
  component: NgoDashboard,
});

function NgoDashboard() {
  const { user, loading, signOut } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center">
        <AmbientBackground />
        <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card/80 px-8 py-5 shadow-lg backdrop-blur-md">
          <div className="h-2 w-2 animate-ping rounded-full bg-primary" />
          <span className="text-sm font-medium text-muted-foreground">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
      toast.info(t("ngo.upload.todo"));
    }
  };

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <header className="sticky top-0 z-50 border-b border-border/40 bg-card/70 backdrop-blur-xl">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <Link to="/ngo" className="group flex min-w-0 items-center gap-2.5">
            <div
              className="h-8 w-8 shrink-0 rounded-lg shadow-md shadow-primary/20 transition group-hover:scale-105"
              style={{ background: "var(--gradient-hero)" }}
            />
            <span className="truncate font-semibold tracking-tight">UNMAPPED — NGO Portal</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <ThemeToggle />
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/" });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t("common.signOut")}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Hero / intro */}
        <div className="mb-8 flex flex-col gap-2">
          <Badge variant="secondary" className="w-fit">
            <Building2 className="mr-1 h-3 w-3" />
            {t("ngo.badge")}
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">{t("ngo.welcome")}</h1>
          <p className="text-muted-foreground">{t("ngo.subtitle")}</p>
        </div>

        {/* Stats grid */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("ngo.stats.policies")}</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">{t("ngo.stats.policiesEmpty")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("ngo.stats.users")}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">{t("ngo.stats.usersEmpty")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("ngo.stats.signals")}</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">{t("ngo.stats.signalsEmpty")}</p>
            </CardContent>
          </Card>
        </div>

        {/* Upload card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("ngo.upload.title")}</CardTitle>
            <CardDescription>{t("ngo.upload.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-muted/30 px-6 py-12 text-center">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: "var(--gradient-hero)" }}
              >
                <Upload className="h-7 w-7 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold">{t("ngo.upload.drop")}</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("ngo.upload.hint")}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={handleFileSelected}
              />
              <Button onClick={handleUploadClick} className="mt-6" size="lg">
                <Upload className="mr-2 h-4 w-4" />
                {t("ngo.upload.button")}
              </Button>
              {selectedFileName && (
                <p className="mt-4 text-sm text-muted-foreground">
                  {t("ngo.upload.selected")}{" "}
                  <span className="font-medium text-foreground">{selectedFileName}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent / empty state */}
        <Card>
          <CardHeader>
            <CardTitle>{t("ngo.recent.title")}</CardTitle>
            <CardDescription>{t("ngo.recent.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <FileText className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">{t("ngo.recent.empty")}</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
