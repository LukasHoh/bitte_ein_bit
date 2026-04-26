import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { getProfile, listRegions, upsertProfile } from "@/server/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [language, setLanguage] = useState("en");
  const [regionId, setRegionId] = useState("");
  const [regions, setRegions] = useState<Array<{ id: string; name: string }>>([]);
  const [sex, setSex] = useState("");
  const [salaryImportance, setSalaryImportance] = useState<number>(5);
  const [age, setAge] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [regionRows, profile] = await Promise.all([listRegions(), getProfile()]);
        setRegions(regionRows.map((item) => ({ id: item.id, name: item.name })));
        setFullName(profile.full_name ?? "");
        setLanguage(profile.language ?? "en");
        setRegionId(profile.region_id ?? "");
        setSex(profile.sex ?? "");
        setSalaryImportance(profile.salary_importance ?? 5);
        setAge(profile.age ?? "");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load profile");
      }
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const sexValue = sex === "" ? null : (sex as "male" | "female" | "diverse");
      const payload = {
        full_name: fullName,
        language,
        region_id: regionId || null,
        sex: sexValue,
        salary_importance: salaryImportance,
        age: age === "" ? null : age,
      };
      const updated = await upsertProfile({ data: payload });
      setFullName(updated.full_name ?? "");
      setLanguage(updated.language ?? "en");
      setRegionId(updated.region_id ?? "");
      setSex(updated.sex ?? "");
      setSalaryImportance(updated.salary_importance ?? 5);
      setAge(updated.age ?? "");
      toast.success(t("profile.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <User className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("profile.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("profile.lead")}</p>
        </div>
      </div>

      <div className="space-y-5 rounded-2xl border border-border/60 bg-card/90 p-6 shadow-sm backdrop-blur-sm md:p-8">
        <div className="space-y-2">
          <Label htmlFor="full">{t("profile.fullName")}</Label>
          <Input
            id="full"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={120}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lang">{t("profile.language")}</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="lang" className="h-11 rounded-xl">
              <SelectValue placeholder={t("profile.selectLanguage")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="fr">Français</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="region">{t("profile.region")}</Label>
          <Select
            value={regionId || "unspecified"}
            onValueChange={(value) => setRegionId(value === "unspecified" ? "" : value)}
          >
            <SelectTrigger id="region" className="h-11 rounded-xl">
              <SelectValue placeholder={t("profile.selectRegion")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unspecified">{t("profile.preferNotSay")}</SelectItem>
              {regions.map((region) => (
                <SelectItem key={region.id} value={region.id}>
                  {region.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sex">{t("profile.sex")}</Label>
          <Select
            value={sex || "unspecified"}
            onValueChange={(value) => setSex(value === "unspecified" ? "" : value)}
          >
            <SelectTrigger id="sex" className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unspecified">{t("profile.preferNotSay")}</SelectItem>
              <SelectItem value="female">{t("profile.sex.female")}</SelectItem>
              <SelectItem value="male">{t("profile.sex.male")}</SelectItem>
              <SelectItem value="diverse">{t("profile.sex.diverse")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="salary-importance">
            {t("profile.salary")}: {salaryImportance}
          </Label>
          <Input
            id="salary-importance"
            type="range"
            min={1}
            max={10}
            step={1}
            value={salaryImportance}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isNaN(next)) return;
              setSalaryImportance(Math.max(1, Math.min(10, next)));
            }}
            className="h-2 cursor-pointer accent-primary"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="age">{t("profile.age")}</Label>
          <Input
            id="age"
            type="number"
            min={0}
            max={120}
            value={age}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                setAge("");
                return;
              }
              const next = Number(raw);
              if (Number.isNaN(next)) return;
              setAge(Math.max(0, Math.min(120, next)));
            }}
            className="h-11 rounded-xl"
          />
        </div>
        <Button
          onClick={save}
          disabled={saving}
          className="h-11 rounded-full px-8 shadow-md shadow-primary/15"
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
