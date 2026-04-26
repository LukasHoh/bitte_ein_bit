import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { getProfileRegion } from "@/server/profile.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Briefcase,
  TrendingUp,
  Clock,
  AlertTriangle,
  Banknote,
  BarChart2,
  RefreshCw,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { runMatching, type OccupationResult, type MatchingRunResult } from "@/server/matching.functions";

export const Route = createFileRoute("/app/matching")({
  component: MatchingPage,
});

// ISO 3166-1 alpha-3 lookup by country name (matching ILOSTAT codes)
const REGION_TO_ISO3: Record<string, string> = {
  "Afghanistan": "AFG", "Albania": "ALB", "Angola": "AGO", "Argentina": "ARG",
  "Armenia": "ARM", "Australia": "AUS", "Austria": "AUT", "Azerbaijan": "AZE",
  "Bahamas": "BHS", "Bangladesh": "BGD", "Barbados": "BRB", "Belarus": "BLR",
  "Belgium": "BEL", "Belize": "BLZ", "Benin": "BEN", "Bhutan": "BTN",
  "Bolivia (Plurinational State of)": "BOL", "Bosnia and Herzegovina": "BIH",
  "Botswana": "BWA", "Brazil": "BRA", "Bulgaria": "BGR", "Burkina Faso": "BFA",
  "Burundi": "BDI", "Cabo Verde": "CPV", "Cambodia": "KHM", "Chad": "TCD",
  "Chile": "CHL", "Colombia": "COL", "Comoros": "COM",
  "Congo, Democratic Republic of the": "COD", "Cook Islands": "COK",
  "Costa Rica": "CRI", "Croatia": "HRV", "Curaçao": "CUW", "Cyprus": "CYP",
  "Czechia": "CZE", "Côte d'Ivoire": "CIV", "Denmark": "DNK", "Djibouti": "DJI",
  "Dominican Republic": "DOM", "Ecuador": "ECU", "Egypt": "EGY",
  "El Salvador": "SLV", "Estonia": "EST", "Eswatini": "SWZ", "Ethiopia": "ETH",
  "Fiji": "FJI", "Finland": "FIN", "France": "FRA", "Gambia": "GMB",
  "Georgia": "GEO", "Germany": "DEU", "Ghana": "GHA", "Gibraltar": "GIB",
  "Greece": "GRC", "Guatemala": "GTM", "Guinea": "GIN", "Guinea-Bissau": "GNB",
  "Guyana": "GUY", "Honduras": "HND", "Hong Kong, China": "HKG",
  "Hungary": "HUN", "Iceland": "ISL", "India": "IND", "Indonesia": "IDN",
  "Ireland": "IRL", "Israel": "ISR", "Italy": "ITA", "Jordan": "JOR",
  "Kazakhstan": "KAZ", "Kenya": "KEN", "Kiribati": "KIR",
  "Lao People's Democratic Republic": "LAO", "Latvia": "LVA", "Lebanon": "LBN",
  "Lesotho": "LSO", "Liberia": "LBR", "Lithuania": "LTU", "Luxembourg": "LUX",
  "Macao, China": "MAC", "Madagascar": "MDG", "Malaysia": "MYS",
  "Maldives": "MDV", "Mali": "MLI", "Malta": "MLT", "Marshall Islands": "MHL",
  "Mauritius": "MUS", "Mexico": "MEX", "Mongolia": "MNG", "Mozambique": "MOZ",
  "Myanmar": "MMR", "Namibia": "NAM", "Nepal": "NPL", "Netherlands": "NLD",
  "Niger": "NER", "Nigeria": "NGA", "Norway": "NOR", "Pakistan": "PAK",
  "Palau": "PLW", "Palestine (State of)": "PSE", "Panama": "PAN",
  "Paraguay": "PRY", "Peru": "PER", "Philippines": "PHL", "Poland": "POL",
  "Portugal": "PRT", "Puerto Rico": "PRI", "Qatar": "QAT",
  "Republic of Korea": "KOR", "Republic of Moldova": "MDA", "Romania": "ROU",
  "Russian Federation": "RUS", "Rwanda": "RWA", "Samoa": "WSM",
  "Sao Tome and Principe": "STP", "Saudi Arabia": "SAU", "Senegal": "SEN",
  "Serbia": "SRB", "Seychelles": "SYC", "Sierra Leone": "SLE",
  "Singapore": "SGP", "Slovakia": "SVK", "Slovenia": "SVN",
  "South Africa": "ZAF", "Spain": "ESP", "Sri Lanka": "LKA", "Sudan": "SDN",
  "Suriname": "SUR", "Sweden": "SWE", "Switzerland": "CHE",
  "Tanzania, United Republic of": "TZA", "Thailand": "THA", "Timor-Leste": "TLS",
  "Togo": "TGO", "Tokelau": "TKL", "Tonga": "TON", "Trinidad and Tobago": "TTO",
  "Tunisia": "TUN", "Türkiye": "TUR", "Uganda": "UGA", "Ukraine": "UKR",
  "United Kingdom of Great Britain and Northern Ireland": "GBR",
  "United States of America": "USA", "Uruguay": "URY", "Uzbekistan": "UZB",
  "Venezuela (Bolivarian Republic of)": "VEN", "Viet Nam": "VNM",
  "Wallis and Futuna": "WLF", "Zambia": "ZMB", "Zimbabwe": "ZWE",
};

function regionNameToIso(name: string | null | undefined): string {
  if (!name) return "";
  return REGION_TO_ISO3[name.trim()] ?? "";
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function fmt(value: number | null | undefined, unit = ""): string {
  if (value == null) return "—";
  return `${Math.round(value * 10) / 10}${unit}`;
}

function scoreColor(score: number): string {
  if (score >= 0.7) return "text-emerald-500";
  if (score >= 0.4) return "text-amber-500";
  return "text-muted-foreground";
}

function ScorePill({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium text-foreground">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function OccupationCard({
  result,
  rank,
  t,
}: {
  result: OccupationResult;
  rank: number;
  t: (key: string) => string;
}) {
  const label =
    result.occupation_label ?? result.occupation_uri.split("/").pop() ?? "Unknown";

  const shortUri = (uri: string) => {
    const parts = uri.split("/");
    return parts[parts.length - 1] ?? uri;
  };

  return (
    <div className="group rounded-2xl border border-border/50 bg-card/90 shadow-sm backdrop-blur-sm transition hover:border-primary/30 hover:shadow-md hover:shadow-primary/5">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-5">
        {/* Rank badge */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
          {rank}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {/* Title row */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-semibold leading-snug text-foreground">{label}</h3>
            <Badge
              variant="secondary"
              className={cn(
                "shrink-0 text-xs font-semibold",
                result.base_skill_score >= 0.7
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : result.base_skill_score >= 0.4
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {pct(result.base_skill_score)} {t("match.skillScore")}
            </Badge>
          </div>

          {/* Skill coverage bars */}
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("match.essentialCoverage")}</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    scoreColor(result.essential_coverage),
                  )}
                >
                  {result.matched_essential_count}/{result.total_essential_count}
                </span>
              </div>
              <Progress value={result.essential_coverage * 100} className="h-1.5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("match.optionalCoverage")}</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    scoreColor(result.optional_coverage),
                  )}
                >
                  {result.matched_optional_count}/{result.total_optional_count}
                </span>
              </div>
              <Progress value={result.optional_coverage * 100} className="h-1.5" />
            </div>
          </div>

          {/* Signal chips */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {result.earnings_value_local != null && (
              <ScorePill
                icon={Banknote}
                label={t("match.earnings")}
                value={fmt(result.earnings_value_local)}
              />
            )}
            {result.occupation_demand_level != null && (
              <ScorePill
                icon={TrendingUp}
                label={t("match.demand")}
                value={pct(result.occupation_demand_level)}
              />
            )}
            {result.occupation_unemployment_risk != null && (
              <ScorePill
                icon={AlertTriangle}
                label={t("match.unemploymentRisk")}
                value={pct(result.occupation_unemployment_risk)}
              />
            )}
            {result.hours_worked != null && (
              <ScorePill
                icon={Clock}
                label={t("match.hoursWorked")}
                value={fmt(result.hours_worked, "h")}
              />
            )}
            {result.informality_rate != null && (
              <ScorePill
                icon={BarChart2}
                label={t("match.informalityRate")}
                value={pct(result.informality_rate)}
              />
            )}
          </div>

          {/* Expandable details */}
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="details" className="border-none">
              <AccordionTrigger className="py-1 text-xs text-muted-foreground hover:text-foreground [&>svg]:h-3.5 [&>svg]:w-3.5">
                {t("match.matchedSkills")} & {t("match.missingSkills")}
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  {result.matched_input_skills.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        {t("match.matchedSkills")}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {result.matched_input_skills.map((uri) => (
                          <Badge key={uri} variant="outline" className="text-xs font-normal">
                            {shortUri(uri)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.missing_essential_skills.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                        {t("match.missingSkills")}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {result.missing_essential_skills.map((uri) => (
                          <Badge
                            key={uri}
                            variant="outline"
                            className="border-rose-200 text-xs font-normal text-rose-600 dark:border-rose-800 dark:text-rose-400"
                          >
                            {shortUri(uri)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
}

type ProfileData = {
  country: string;
  sex: "" | "male" | "female" | "total";
  referenceYear: number | null;
};

function MatchingPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  // Profile-derived values (auto-filled from DuckDB profile + region)
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileData, setProfileData] = useState<ProfileData>({
    country: "",
    sex: "",
    referenceYear: null,
  });

  const [result, setResult] = useState<MatchingRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAutoRun = useRef(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const data = await getProfileRegion();

      const rawSex = data.sex;
      const mappedSex: ProfileData["sex"] =
        rawSex === "male" ? "male" : rawSex === "female" ? "female" : "";

      const region = data.region;
      const countryCode =
        region?.country_code?.trim().toUpperCase() || regionNameToIso(region?.name);

      const currentYear = new Date().getFullYear();
      setProfileData({ country: countryCode, sex: mappedSex, referenceYear: currentYear });
    } catch {
      // ignore — page renders an empty-country state when profile can't be loaded
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleRun = useCallback(async () => {
    const trimmed = profileData.country.trim().toUpperCase();
    if (!trimmed || trimmed.length < 2) {
      toast.error(t("match.noCountry"));
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const res = await runMatching({
        data: {
          country: trimmed,
          sex: profileData.sex || null,
          region: null,
          reference_year: profileData.referenceYear,
          top_k: 20,
          include_hierarchy: true,
          hierarchy_decay: 0.6,
          related_decay: 0.5,
        },
      });
      if (res.profile_skill_count === 0) {
        toast.warning(t("match.noSkills"));
      } else if (res.skill_count === 0) {
        toast.info(t("match.skillsMappingFailed"));
      }
      setResult(res as MatchingRunResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Matching failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  }, [profileData, t]);

  // Auto-run once profile is loaded and country is available
  useEffect(() => {
    if (profileLoading || hasAutoRun.current) return;
    if (!profileData.country) return;
    hasAutoRun.current = true;
    handleRun();
  }, [profileLoading, profileData.country, handleRun]);

  const noCountryInProfile = !profileLoading && !profileData.country;

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Briefcase className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{t("match.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("match.lead")}</p>
        </div>
      </div>

      {/* No-country warning */}
      {noCountryInProfile && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/20">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {t("match.noCountry")}{" "}
            <Link to="/app/profile" className="font-medium underline underline-offset-2">
              {t("nav.profile")}
            </Link>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{t("match.fromProfile")}</Badge>
          <Badge variant="secondary">{profileData.country || "—"}</Badge>
          <Badge variant="secondary">{profileData.sex || t("match.sexAny")}</Badge>
          <Badge variant="secondary">{String(profileData.referenceYear ?? "—")}</Badge>
        </div>
        <Button
          onClick={handleRun}
          disabled={running || !profileData.country.trim()}
          className="h-10 rounded-full px-5 shadow-md shadow-primary/15"
        >
          {running ? (
            <>
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
              {t("match.running")}
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("match.runBtn")}
            </>
          )}
        </Button>
      </div>

      <section className="min-w-0 space-y-4">
          {running && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          )}

          {!running && result && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <h2 className="text-lg font-semibold">{t("match.resultsTitle")}</h2>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Info className="h-3 w-3" />
                    {result.skill_count}/{result.profile_skill_count}{" "}
                    {t("match.skillsLoaded")} · {result.context.country}
                    {result.context.sex ? ` · ${result.context.sex}` : ""}
                    {result.context.reference_year
                      ? ` · ${result.context.reference_year}`
                      : ""}
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {result.occupations.length}{" "}
                  {result.occupations.length === 1 ? "match" : "matches"}
                </Badge>
              </div>

              {result.occupations.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 py-16 text-center">
                  <Briefcase className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{t("match.emptyResults")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {result.occupations.map((occ, idx) => (
                    <OccupationCard
                      key={occ.occupation_uri}
                      result={occ}
                      rank={idx + 1}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {!running && !result && !error && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/50 bg-card/40 py-20 text-center">
              {profileLoading ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                </>
              ) : (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8 text-primary">
                    <Briefcase className="h-8 w-8" />
                  </div>
                  <p className="max-w-xs text-sm text-muted-foreground">{t("match.lead")}</p>
                </>
              )}
            </div>
          )}

          {!running && error && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/50 py-16 text-center dark:border-rose-900 dark:bg-rose-950/20">
              <AlertTriangle className="h-8 w-8 text-rose-500" />
              <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
            </div>
          )}
      </section>
    </div>
  );
}
