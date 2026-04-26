import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const [skillsCount, setSkillsCount] = useState(0);
  const [eduCount, setEduCount] = useState(0);
  const [expCount, setExpCount] = useState(0);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ count: s }, { count: e }, { count: x }, { data: prof }] = await Promise.all([
        supabase.from("user_skills").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("education").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("experience").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      ]);
      setSkillsCount(s ?? 0);
      setEduCount(e ?? 0);
      setExpCount(x ?? 0);
      setName(prof?.full_name ?? "");
    })();
  }, [user]);

  const stats = [
    { label: "Skills", value: skillsCount, hint: "Add via Skills chat" },
    { label: "Education entries", value: eduCount, hint: "Education & Experience" },
    { label: "Experience entries", value: expCount, hint: "Education & Experience" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Welcome{name ? `, ${name}` : ""} 👋</h1>
        <p className="mt-1 text-muted-foreground">
          Build your profile so we can match you to the right trainings.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-4xl font-bold">{s.value}</div>
            <div className="mt-2 text-xs text-muted-foreground">{s.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
