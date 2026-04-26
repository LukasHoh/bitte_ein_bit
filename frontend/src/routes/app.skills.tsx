import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { searchManualSkills, sendSkillsChat } from "@/server/skills-chat.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/app/skills")({
  component: SkillsChatPage,
});

type Msg = { role: "user" | "assistant"; content: string };
type SelectedSkill = {
  skill_id: string;
  skill_label: string;
  summary: string;
  description: string;
  concept_uri: string;
  full_metadata: Record<string, string>;
  level: string;
  user_quote: string;
};
type AcceptedSkill = {
  id: string;
  name: string;
  proficiency: string | null;
  llm_level: string | null;
  user_quote: string | null;
};
type ManualSkillCandidate = {
  skill_id: string;
  skill_label: string;
  description: string;
  concept_uri: string;
  full_metadata: Record<string, string>;
};

const STARTER_MESSAGES: Record<string, string> = {
  en: "Hi! I'll help map out your skills through a short chat. To start: what kind of work or activity do you enjoy doing the most?",
  de: "Hi! Ich helfe dir in einem kurzen Chat, deine Fähigkeiten zu erfassen. Zum Start: Welche Arbeit oder Tätigkeit machst du am liebsten?",
  fr: "Salut ! Je vais t'aider a identifier tes competences avec un court chat. Pour commencer : quel type de travail ou d'activite prefères-tu ?",
  es: "Hola! Te ayudare a identificar tus habilidades con un chat corto. Para empezar: que tipo de trabajo o actividad disfrutas mas?",
};

function SkillsChatPage() {
  const { user, session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [selectedByLlm, setSelectedByLlm] = useState<SelectedSkill[]>([]);
  const [hiddenSkillKeys, setHiddenSkillKeys] = useState<string[]>([]);
  const [acceptedSkills, setAcceptedSkills] = useState<AcceptedSkill[]>([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualResults, setManualResults] = useState<ManualSkillCandidate[]>([]);
  const [profileLanguage, setProfileLanguage] = useState<string>("en");
  const scrollRef = useRef<HTMLDivElement>(null);

  const normalizeSkillLabel = (label: string) => label.trim().toLowerCase();
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

  const loadAcceptedSkills = async () => {
    if (!user) return;
    const response = await supabase
      .from("user_skills")
      .select("id, proficiency, llm_level, user_quote, skills(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    let data = response.data;
    let error = response.error;

    // Backward-compatible fallback until llm_level/user_quote columns exist in DB.
    if (error && String(error.message).includes("does not exist")) {
      const fallback = await supabase
        .from("user_skills")
        .select("id, proficiency, skills(name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      toast.error(error.message);
      return;
    }
    setAcceptedSkills(
      (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.skills?.name ?? "Unknown",
        proficiency: row.proficiency ?? null,
        llm_level: row.llm_level ?? null,
        user_quote: row.user_quote ?? null,
      })),
    );
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("language")
        .eq("id", user.id)
        .maybeSingle();
      const resolvedLanguage = String(profile?.language ?? "en").toLowerCase();
      setProfileLanguage(resolvedLanguage);

      // Start a fresh language-aligned session to avoid old-thread language carryover.
      setConvId(null);
      const starter =
        STARTER_MESSAGES[resolvedLanguage] ||
        STARTER_MESSAGES[resolvedLanguage.split("-")[0]] ||
        STARTER_MESSAGES.en;
      setMessages([{ role: "assistant", content: starter }]);
      loadAcceptedSkills();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || busy || !session) return;
    const text = input.trim().slice(0, 2000);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const result = await sendSkillsChat({
        data: { conversationId: convId, message: text },
        headers: { Authorization: `Bearer ${session.access_token}` },
      } as any);
      setConvId(result.conversationId);
      setMessages((m) => [...m, { role: "assistant", content: result.reply }]);
      if (result.error === "credits") toast.error("AI credits exhausted — add credits in Lovable Cloud.");
      else if (result.error === "rate_limit") toast.warning("Rate limited — try again shortly.");
      else if (result.error) toast.error("AI error");
      if (Array.isArray(result.selectedSkills) && result.selectedSkills.length > 0) {
        const acceptedNames = new Set(acceptedSkills.map((s) => normalizeSkillLabel(s.name)));
        const visibleNewSkills = (result.selectedSkills as SelectedSkill[]).filter(
          (skill) =>
            !hiddenSkillKeys.includes(`id:${skill.skill_id}`) &&
            !hiddenSkillKeys.includes(`label:${normalizeSkillLabel(skill.skill_label || skill.skill_id)}`) &&
            !acceptedNames.has(normalizeSkillLabel(skill.skill_label || skill.skill_id)),
        );
        if (visibleNewSkills.length === 0) {
          return;
        }
        setSelectedByLlm((prev) => {
          const merged = new Map(prev.map((s) => [s.skill_id, s]));
          for (const skill of visibleNewSkills) {
            merged.set(skill.skill_id, skill);
          }
          return [...merged.values()];
        });
        toast.success(
          `Selected: ${visibleNewSkills.map((s) => formatSkillName(s.skill_label)).join(", ")}`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const startNewChatSession = () => {
    if (busy) return;
    setConvId(null);
    setInput("");
    setSelectedByLlm([]);
    setHiddenSkillKeys([]);
    const starter =
      STARTER_MESSAGES[profileLanguage] ||
      STARTER_MESSAGES[profileLanguage.split("-")[0]] ||
      STARTER_MESSAGES.en;
    setMessages([{ role: "assistant", content: starter }]);
  };

  const toProficiency = (level: string): "beginner" | "intermediate" | "advanced" | "expert" => {
    if (level === "low") return "beginner";
    if (level === "high") return "advanced";
    return "intermediate";
  };

  const removeSuggestion = (skill: SelectedSkill) => {
    const normalizedLabel = normalizeSkillLabel(skill.skill_label || skill.skill_id);
    setHiddenSkillKeys((prev) => {
      const next = new Set(prev);
      next.add(`id:${skill.skill_id}`);
      next.add(`label:${normalizedLabel}`);
      return [...next];
    });
    setSelectedByLlm((prev) => prev.filter((s) => s.skill_id !== skill.skill_id));
  };

  const addManualCandidate = (candidate: ManualSkillCandidate) => {
    const normalizedLabel = normalizeSkillLabel(candidate.skill_label || candidate.skill_id);
    const acceptedNames = new Set(acceptedSkills.map((s) => normalizeSkillLabel(s.name)));
    if (
      hiddenSkillKeys.includes(`id:${candidate.skill_id}`) ||
      hiddenSkillKeys.includes(`label:${normalizedLabel}`) ||
      acceptedNames.has(normalizedLabel)
    ) {
      return;
    }

    const manualSuggestion: SelectedSkill = {
      skill_id: candidate.skill_id,
      skill_label: candidate.skill_label,
      summary: candidate.description || "",
      description: candidate.description || "",
      concept_uri: candidate.concept_uri || "",
      full_metadata: candidate.full_metadata || {},
      level: "medium",
      user_quote: "",
    };

    setSelectedByLlm((prev) => {
      const merged = new Map(prev.map((s) => [s.skill_id, s]));
      merged.set(manualSuggestion.skill_id, manualSuggestion);
      return [...merged.values()];
    });
    toast.success(`Added suggestion: ${formatSkillName(candidate.skill_label)}`);
  };

  const runManualSearch = async () => {
    if (!session || !manualQuery.trim() || manualBusy) return;
    setManualBusy(true);
    try {
      const result = await searchManualSkills({
        data: { query: manualQuery.trim(), limit: 5 },
        headers: { Authorization: `Bearer ${session.access_token}` },
      } as any);
      setManualResults((result.candidates ?? []) as ManualSkillCandidate[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Manual search failed");
    } finally {
      setManualBusy(false);
    }
  };

  const acceptSkill = async (skill: SelectedSkill) => {
    if (!user) {
      toast.error("You need to be signed in.");
      return;
    }
    if (actionBusy) return;
    setActionBusy(true);
    setActiveSkillId(skill.skill_id);
    try {
      const normalizedName = (skill.skill_label || "").trim();
      if (!normalizedName) throw new Error("Missing skill name.");
      const formattedName = formatSkillName(normalizedName);

      let dbSkillId: string | null = null;
      const { data: existingSkill, error: findSkillError } = await supabase
        .from("skills")
        .select("id")
        .eq("name", normalizedName)
        .limit(1)
        .maybeSingle();
      if (findSkillError) throw findSkillError;
      dbSkillId = existingSkill?.id ?? null;

      if (!dbSkillId) {
        const { data: createdSkill, error: createSkillError } = await supabase
          .from("skills")
          .insert({ name: formattedName, category: "chat" })
          .select("id")
          .single();
        if (createSkillError) throw createSkillError;
        dbSkillId = createdSkill.id;
      }
      if (!dbSkillId) throw new Error("Could not resolve saved skill id.");

      const { data: existingLink, error: findLinkError } = await supabase
        .from("user_skills")
        .select("id")
        .eq("user_id", user.id)
        .eq("skill_id", dbSkillId)
        .limit(1)
        .maybeSingle();
      if (findLinkError) throw findLinkError;

      if (!existingLink) {
        const baseInsertPayload = {
          user_id: user.id,
          skill_id: dbSkillId,
          source: "chat",
          proficiency: toProficiency(skill.level),
        };
        const extendedInsertPayload = {
          ...baseInsertPayload,
          llm_level: skill.level,
          user_quote: skill.user_quote || null,
        };

        let { error: createLinkError } = await supabase.from("user_skills").insert(extendedInsertPayload);

        // Backward-compatible fallback if DB migration has not been applied yet.
        if (createLinkError && String(createLinkError.message).includes("schema cache")) {
          const retry = await supabase.from("user_skills").insert(baseInsertPayload);
          createLinkError = retry.error;
        }

        if (createLinkError) throw createLinkError;
      }

      removeSuggestion(skill);
      await loadAcceptedSkills();
      toast.success(`Saved: ${formattedName}`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save skill");
    } finally {
      setActionBusy(false);
      setActiveSkillId(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex h-[76vh] min-h-[620px] flex-col overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="border-b bg-muted/30 px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Skills chat</h1>
              <p className="text-sm text-muted-foreground">
                Chat naturally — I'll detect skills and add them to your profile.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{messages.length} messages</Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startNewChatSession}
                disabled={busy}
              >
                New chat session
              </Button>
            </div>
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-background/40 px-6 py-5">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border bg-background text-foreground"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl border bg-background px-4 py-2 text-sm text-muted-foreground">
                Thinking...
              </div>
            </div>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2 border-t bg-background px-4 py-3"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your reply…"
            maxLength={2000}
            disabled={busy}
            rows={2}
            className="min-h-[44px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!busy && input.trim()) {
                  send();
                }
              }
            }}
          />
          <Button type="submit" disabled={busy || !input.trim()} className="min-w-24 self-end">
            {busy ? "Sending..." : "Send"}
          </Button>
        </form>
        <div className="px-4 pb-3 text-right text-xs text-muted-foreground">
          Enter to send • Shift+Enter for a new line
        </div>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
        <div className="rounded-3xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Your Skills</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Accepted skills: {acceptedSkills.length}
          </p>
          {acceptedSkills.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              No accepted skills yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {acceptedSkills.map((skill) => (
                <li key={skill.id} className="rounded-xl border bg-muted/30 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="max-w-full truncate">
                      {formatSkillName(skill.name)}
                    </Badge>
                    {skill.proficiency ? (
                      <span className="text-xs text-muted-foreground">
                        Level: {formatTagValue(skill.proficiency)}
                      </span>
                    ) : null}
                    {skill.llm_level ? (
                      <span className="text-xs text-muted-foreground">
                        LLM: {formatTagValue(skill.llm_level)}
                      </span>
                    ) : null}
                  </div>
                  {skill.user_quote ? (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      "{skill.user_quote}"
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-5 text-sm font-semibold">Pending suggestions ({selectedByLlm.length})</h3>
          {selectedByLlm.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              No pending suggestions.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {selectedByLlm.map((skillId) => (
                <li key={skillId.skill_id} className="rounded-xl border bg-background px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="max-w-full truncate">
                      {formatSkillName(skillId.skill_label || skillId.skill_id)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Level: {formatTagValue(skillId.level)}
                    </span>
                  </div>
                  {skillId.description ? (
                    <p className="mt-2 line-clamp-5 text-sm text-foreground">
                      {skillId.description}
                    </p>
                  ) : skillId.summary ? (
                    <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">
                      {skillId.summary}
                    </p>
                  ) : null}
                  {skillId.user_quote ? (
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      "{skillId.user_quote}"
                    </p>
                  ) : null}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => acceptSkill(skillId)}
                      disabled={actionBusy || busy}
                    >
                      {actionBusy && activeSkillId === skillId.skill_id ? "Saving..." : "Accept"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => removeSuggestion(skillId)}
                      disabled={actionBusy || busy}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-5 text-sm font-semibold">Manually add skills</h3>
          <div className="mt-2 space-y-2">
            <Textarea
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              rows={2}
              className="min-h-[44px] resize-none"
              placeholder="Search skill manually (e.g. project management, welding, excel)"
              disabled={manualBusy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  runManualSearch();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={runManualSearch}
              disabled={manualBusy || !manualQuery.trim()}
            >
              {manualBusy ? "Searching..." : "Search skills"}
            </Button>
            {manualResults.length > 0 ? (
              <ul className="space-y-2">
                {manualResults.map((candidate) => (
                  <li key={candidate.skill_id} className="rounded-xl border bg-background px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="max-w-[70%] truncate">
                        {formatSkillName(candidate.skill_label || candidate.skill_id)}
                      </Badge>
                      <Button type="button" size="sm" onClick={() => addManualCandidate(candidate)}>
                        Add
                      </Button>
                    </div>
                    {candidate.description ? (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        {candidate.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <Link to="/app" className="block text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>
      </aside>
    </div>
  );
}
