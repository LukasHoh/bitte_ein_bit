import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [language, setLanguage] = useState("en");
  const [bio, setBio] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [sex, setSex] = useState("");
  const [salaryImportance, setSalaryImportance] = useState<number>(5);
  const [age, setAge] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const response = await supabase
        .from("profiles")
        .select("full_name, language, bio, region, country, sex, salary_importance, age")
        .eq("id", user.id)
        .maybeSingle();
      let data = response.data;
      let error = response.error;

      // Backward-compatible fallback if new profile columns are not in schema cache yet.
      if (error && String(error.message).includes("schema cache")) {
        const fallback = await supabase
          .from("profiles")
          .select("full_name, language, bio")
          .eq("id", user.id)
          .maybeSingle();
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data) {
        setFullName(data.full_name ?? "");
        setLanguage(data.language ?? "en");
        setBio(data.bio ?? "");
        setRegion((data as any).region ?? "");
        setCountry((data as any).country ?? "");
        setSex((data as any).sex ?? "");
        setSalaryImportance((data as any).salary_importance ?? 5);
        setAge((data as any).age ?? "");
      }
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const fullPayload = {
      full_name: fullName,
      language,
      bio,
      region: region || null,
      country: country || null,
      sex: sex || null,
      salary_importance: salaryImportance,
      age: age === "" ? null : age,
    };
    const fallbackPayload = {
      full_name: fullName,
      language,
      bio,
    };

    let { error } = await supabase
      .from("profiles")
      .update(fullPayload)
      .eq("id", user.id);

    // Backward-compatible fallback if new profile columns are not in schema cache yet.
    if (error && String(error.message).includes("schema cache")) {
      const retry = await supabase.from("profiles").update(fallbackPayload).eq("id", user.id);
      error = retry.error;
    }

    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">Profile</h1>
      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <div>
          <Label htmlFor="full">Full name</Label>
          <Input id="full" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
        </div>
        <div>
          <Label htmlFor="lang">Language</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="lang">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="fr">Français</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="bio">Short bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={4}
          />
        </div>
        <div>
          <Label htmlFor="region">Region</Label>
          <Input id="region" value={region} onChange={(e) => setRegion(e.target.value)} maxLength={120} />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={120} />
        </div>
        <div>
          <Label htmlFor="sex">Sex</Label>
          <Select value={sex || "unspecified"} onValueChange={(value) => setSex(value === "unspecified" ? "" : value)}>
            <SelectTrigger id="sex">
              <SelectValue placeholder="Select sex" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unspecified">Prefer not to say</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="diverse">Diverse</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="salary-importance">How important is salary? (1-10)</Label>
          <Input
            id="salary-importance"
            type="number"
            min={1}
            max={10}
            value={salaryImportance}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isNaN(next)) return;
              setSalaryImportance(Math.max(1, Math.min(10, next)));
            }}
          />
        </div>
        <div>
          <Label htmlFor="age">Age</Label>
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
          />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
