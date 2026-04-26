import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/background")({
  component: BackgroundPage,
});

type Edu = {
  id: string;
  institution: string;
  degree: string | null;
  field: string | null;
  start_year: number | null;
  end_year: number | null;
};
type Exp = {
  id: string;
  employer: string;
  role: string | null;
  description: string | null;
  start_year: number | null;
  end_year: number | null;
};

function BackgroundPage() {
  const { user } = useAuth();
  const [edu, setEdu] = useState<Edu[]>([]);
  const [exp, setExp] = useState<Exp[]>([]);

  const refresh = async () => {
    if (!user) return;
    const [{ data: e }, { data: x }] = await Promise.all([
      supabase.from("education").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("experience").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    setEdu((e ?? []) as Edu[]);
    setExp((x ?? []) as Exp[]);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const addEdu = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("education").insert({
      user_id: user.id,
      institution: String(fd.get("institution") || "").slice(0, 200),
      degree: String(fd.get("degree") || "").slice(0, 120) || null,
      field: String(fd.get("field") || "").slice(0, 120) || null,
      start_year: fd.get("start") ? Number(fd.get("start")) : null,
      end_year: fd.get("end") ? Number(fd.get("end")) : null,
    });
    if (error) return toast.error(error.message);
    (e.currentTarget as HTMLFormElement).reset();
    toast.success("Education added");
    refresh();
  };

  const addExp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("experience").insert({
      user_id: user.id,
      employer: String(fd.get("employer") || "").slice(0, 200),
      role: String(fd.get("role") || "").slice(0, 120) || null,
      description: String(fd.get("desc") || "").slice(0, 1000) || null,
      start_year: fd.get("start") ? Number(fd.get("start")) : null,
      end_year: fd.get("end") ? Number(fd.get("end")) : null,
    });
    if (error) return toast.error(error.message);
    (e.currentTarget as HTMLFormElement).reset();
    toast.success("Experience added");
    refresh();
  };

  const del = async (table: "education" | "experience", id: string) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Education</h2>
        <form onSubmit={addEdu} className="space-y-3 rounded-2xl border bg-card p-5">
          <div>
            <Label>Institution</Label>
            <Input name="institution" required maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Degree</Label>
              <Input name="degree" maxLength={120} />
            </div>
            <div>
              <Label>Field</Label>
              <Input name="field" maxLength={120} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start year</Label>
              <Input name="start" type="number" min={1900} max={2100} />
            </div>
            <div>
              <Label>End year</Label>
              <Input name="end" type="number" min={1900} max={2100} />
            </div>
          </div>
          <Button type="submit">Add education</Button>
        </form>
        <ul className="space-y-2">
          {edu.map((e) => (
            <li key={e.id} className="flex items-start justify-between rounded-xl border bg-card p-4">
              <div>
                <div className="font-medium">{e.institution}</div>
                <div className="text-sm text-muted-foreground">
                  {[e.degree, e.field].filter(Boolean).join(" · ")}
                  {(e.start_year || e.end_year) && ` (${e.start_year ?? "?"}–${e.end_year ?? "?"})`}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => del("education", e.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Experience</h2>
        <form onSubmit={addExp} className="space-y-3 rounded-2xl border bg-card p-5">
          <div>
            <Label>Employer</Label>
            <Input name="employer" required maxLength={200} />
          </div>
          <div>
            <Label>Role</Label>
            <Input name="role" maxLength={120} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea name="desc" maxLength={1000} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start year</Label>
              <Input name="start" type="number" min={1900} max={2100} />
            </div>
            <div>
              <Label>End year</Label>
              <Input name="end" type="number" min={1900} max={2100} />
            </div>
          </div>
          <Button type="submit">Add experience</Button>
        </form>
        <ul className="space-y-2">
          {exp.map((x) => (
            <li key={x.id} className="flex items-start justify-between rounded-xl border bg-card p-4">
              <div>
                <div className="font-medium">{x.employer}</div>
                <div className="text-sm text-muted-foreground">
                  {x.role}
                  {(x.start_year || x.end_year) && ` (${x.start_year ?? "?"}–${x.end_year ?? "?"})`}
                </div>
                {x.description && <div className="mt-1 text-sm">{x.description}</div>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => del("experience", x.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
