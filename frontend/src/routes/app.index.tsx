import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const [skillsCount, setSkillsCount] = useState(0);
  const [eduCount, setEduCount] = useState(0);
  const [expCount, setExpCount] = useState(0);
  const [name, setName] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<
    { id: string; name: string; proficiency: string | null; source: string | null; user_quote: string | null }[]
  >([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const formatSkillName = (name: string) =>
    name
      .replace(/[_-]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

  const formatTagValue = (value: string | null) =>
    value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : null;

  const deleteUserSkill = async (userSkillId: string) => {
    if (actionBusyId) return;
    setActionBusyId(userSkillId);
    try {
      const { error } = await supabase.from("user_skills").delete().eq("id", userSkillId);
      if (error) throw error;
      setSelectedSkills((prev) => prev.filter((skill) => skill.id !== userSkillId));
      setSkillsCount((prev) => Math.max(0, prev - 1));
      toast.success("Skill removed.");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to remove skill.");
    } finally {
      setActionBusyId(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ count: s }, { count: e }, { count: x }, { data: prof }, userSkillsResponse] =
        await Promise.all([
        supabase.from("user_skills").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("education").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("experience").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        supabase
          .from("user_skills")
          .select("id, proficiency, source, user_quote, skills(name)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

      let userSkills = userSkillsResponse.data;
      // Backward-compatible fallback when optional columns are not available yet.
      if (
        userSkillsResponse.error &&
        (String(userSkillsResponse.error.message).includes("schema cache") ||
          String(userSkillsResponse.error.message).includes("does not exist"))
      ) {
        const fallback = await supabase
          .from("user_skills")
          .select("id, proficiency, source, skills(name)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(12);
        if (!fallback.error) {
          userSkills = fallback.data;
        }
      }

      setSkillsCount(s ?? 0);
      setEduCount(e ?? 0);
      setExpCount(x ?? 0);
      setName(prof?.full_name ?? "");
      setSelectedSkills(
        (userSkills ?? []).map((row: any) => ({
          id: row.id,
          name: row.skills?.name ?? "Unknown skill",
          proficiency: row.proficiency ?? null,
          source: row.source ?? null,
          user_quote: row.user_quote ?? null,
        })),
      );
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

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">My selected skills</h2>
          <Button asChild size="sm" variant="outline">
            <Link to="/app/skills">Add skills</Link>
          </Button>
        </div>
        {selectedSkills.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No selected skills yet. Use Skills chat to add and accept skills.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {selectedSkills.map((skill) => (
              <li key={skill.id} className="rounded-md border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{formatSkillName(skill.name)}</Badge>
                    {skill.proficiency ? (
                      <span className="text-xs text-muted-foreground">
                        Level: {formatTagValue(skill.proficiency)}
                      </span>
                    ) : null}
                    {skill.source ? (
                      <span className="text-xs text-muted-foreground">
                        Source: {formatTagValue(skill.source)}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteUserSkill(skill.id)}
                    disabled={actionBusyId === skill.id}
                  >
                    {actionBusyId === skill.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
                {skill.user_quote ? (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    "{skill.user_quote}"
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
