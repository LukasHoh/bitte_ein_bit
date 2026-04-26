import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { searchManualSkills, streamSkillsChat } from "@/server/skills-chat.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, Mic, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ChatMarkdown } from "@/components/chat-markdown";
import { cn } from "@/lib/utils";

/** Matches chat + skills column height (large screens). */
const SKILLS_STACK_HEIGHT =
  "h-[min(76dvh,80svh)] min-h-[28rem] max-h-[min(92dvh,56rem)]";

const SKILLS_STATUS_KEYS = [
  "skills.status.1",
  "skills.status.2",
  "skills.status.3",
  "skills.status.4",
] as const;


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
  description: string | null;
};
type ManualSkillCandidate = {
  skill_id: string;
  skill_label: string;
  description: string;
  concept_uri: string;
  full_metadata: Record<string, string>;
};

const PROFICIENCY_PRESETS = ["beginner", "intermediate", "advanced", "expert"] as const;
type Preset = (typeof PROFICIENCY_PRESETS)[number];

function levelPresetFromDb(proficiency: string | null, llm: string | null): Preset {
  const raw = (llm || proficiency || "intermediate").toLowerCase().trim();
  if (raw === "low") return "beginner";
  if (raw === "high") return "advanced";
  if (raw === "medium") return "intermediate";
  if (PROFICIENCY_PRESETS.includes(raw as Preset)) return raw as Preset;
  return "intermediate";
}

const STARTER_MESSAGES: Record<string, string> = {
  en: "Hi! I'll help map out your skills through a short chat. To start: what kind of work or activity do you enjoy doing the most?",
  de: "Hi! Ich helfe dir in einem kurzen Chat, deine Fähigkeiten zu erfassen. Zum Start: Welche Arbeit oder Tätigkeit machst du am liebsten?",
  fr: "Salut ! Je vais t'aider a identifier tes competences avec un court chat. Pour commencer : quel type de travail ou d'activite prefères-tu ?",
  es: "Hola! Te ayudare a identificar tus habilidades con un chat corto. Para empezar: que tipo de trabajo o actividad disfrutas mas?",
};

export type SkillsWorkspaceProps = {
  onUserSkillsMutated?: () => void;
  showBackLink?: boolean;
};

export function SkillsWorkspace({
  onUserSkillsMutated,
  showBackLink = true,
}: SkillsWorkspaceProps) {
  const { t } = useI18n();
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
  const [manualPickLevel, setManualPickLevel] = useState<Record<string, string>>({});
  const [levelUpdateBusyId, setLevelUpdateBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [profileLanguage, setProfileLanguage] = useState<string>("en");
  const [streamStatusIdx, setStreamStatusIdx] = useState(0);
  const [pendingOpen, setPendingOpen] = useState(true);
  const [yourSkillsOpen, setYourSkillsOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** name → description populated at accept/add time; fills the gap since the skills DB table has no description column */
  const descriptionCacheRef = useRef<Map<string, string>>(new Map());

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
      data = fallback.data as typeof data;
      error = fallback.error;
    }

    if (error) {
      toast.error(error.message);
      return;
    }
    const cache = descriptionCacheRef.current;
    setAcceptedSkills(
      (data ?? []).map(
        (row: {
          id: string;
          proficiency: string | null;
          llm_level: string | null;
          user_quote: string | null;
          skills: { name: string } | null;
        }) => {
          const name = row.skills?.name ?? t("skills.unknown");
          return {
            id: row.id,
            name,
            proficiency: row.proficiency ?? null,
            llm_level: row.llm_level ?? null,
            user_quote: row.user_quote ?? null,
            description: cache.get(name) ?? null,
          };
        },
      ),
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
    const el = scrollRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!busy) {
      setStreamStatusIdx(0);
      return;
    }
    const t = window.setInterval(() => {
      setStreamStatusIdx((i) => (i + 1) % 4);
    }, 1700);
    return () => clearInterval(t);
  }, [busy]);

  const updateLastAssistantText = (text: string) => {
    setMessages((m) => {
      const next = m.slice();
      for (let j = next.length - 1; j >= 0; j--) {
        if (next[j].role === "assistant") {
          next[j] = { ...next[j], content: text };
          break;
        }
      }
      return next;
    });
  };

  const applyEndEvent = (row: Record<string, unknown>) => {
    if (typeof row.conversationId === "string") setConvId(row.conversationId);
    if (row.error === "credits")
      toast.error("AI credits exhausted — add credits in Lovable Cloud.");
    else if (row.error === "rate_limit")
      toast.warning("Rate limited — try again shortly.");
    else if (row.error === "chat_backend_error") toast.error("Chat backend error.");
    else if (row.error === "stream_error") {
      if (!row.reply) toast.error("The reply could not be streamed.");
    } else if (row.error) toast.error("AI error");
    const selected = row.selectedSkills;
    if (Array.isArray(selected) && selected.length > 0) {
      const acceptedNames = new Set(acceptedSkills.map((s) => normalizeSkillLabel(s.name)));
      const visibleNewSkills = (selected as SelectedSkill[]).filter(
        (skill) =>
          !hiddenSkillKeys.includes(`id:${skill.skill_id}`) &&
          !hiddenSkillKeys.includes(
            `label:${normalizeSkillLabel(skill.skill_label || skill.skill_id)}`,
          ) &&
          !acceptedNames.has(normalizeSkillLabel(skill.skill_label || skill.skill_id)),
      );
      if (visibleNewSkills.length > 0) {
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
    }
  };

  const send = async () => {
    if (!input.trim() || busy || !session) return;
    const text = input.trim().slice(0, 2000);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await streamSkillsChat({
        data: { conversationId: convId, message: text },
        headers: { Authorization: `Bearer ${session.access_token}` },
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

      if (!(res instanceof Response) || !res.body) {
        toast.error("Invalid response from chat.");
        setMessages((m) => m.slice(0, -2));
        return;
      }
      if (!res.ok) {
        toast.error(`Request failed: ${res.status}`);
        setMessages((m) => m.slice(0, -2));
        return;
      }

      const parseLine = (line: string) => {
        const t = line.trim();
        if (!t) return;
        let row: Record<string, unknown>;
        try {
          row = JSON.parse(t) as Record<string, unknown>;
        } catch {
          return;
        }
        if (row.type === "text" && typeof row.text === "string") {
          updateLastAssistantText(row.text);
        } else if (row.type === "error" && typeof row.error === "string") {
          toast.error(row.error);
        } else if (row.type === "end") {
          if (typeof row.reply === "string" && row.reply.trim() !== "") {
            updateLastAssistantText(row.reply);
          }
          applyEndEvent(row);
        }
      };

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) parseLine(line);
      }
      if (buf.trim()) parseLine(buf);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Request failed");
      setMessages((m) => {
        if (m.length < 2) return m;
        const u = m[m.length - 2];
        const a = m[m.length - 1];
        if (u?.role === "user" && a?.role === "assistant" && !a.content) {
          return m.slice(0, -2);
        }
        return m;
      });
    } finally {
      setBusy(false);
    }
  };

  const toProficiency = (level: string): "beginner" | "intermediate" | "advanced" | "expert" => {
    const l = (level || "").toLowerCase().trim();
    if (l === "low" || l === "beginner") return "beginner";
    if (l === "high" || l === "advanced") return "advanced";
    if (l === "expert") return "expert";
    if (l === "intermediate" || l === "medium") return "intermediate";
    return "intermediate";
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

  const runManualSearch = async () => {
    if (!session || !manualQuery.trim() || manualBusy) return;
    setManualBusy(true);
    try {
      const result = await searchManualSkills({
        data: { query: manualQuery.trim(), limit: 5 },
        headers: { Authorization: `Bearer ${session.access_token}` },
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      setManualResults((result.candidates ?? []) as ManualSkillCandidate[]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Manual search failed");
    } finally {
      setManualBusy(false);
    }
  };

  const persistUserSkill = async (
    skill: SelectedSkill,
    options: { source: "chat" | "manual"; onLinked?: (hadExisting: boolean) => void },
  ) => {
    if (!user) {
      toast.error("You need to be signed in.");
      return;
    }
    if (actionBusy) return;
    setActionBusy(true);
    setActiveSkillId(skill.skill_id);
    let hadExistingLink = false;
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

      if (existingLink) {
        hadExistingLink = true;
        const updatePayload = {
          proficiency: toProficiency(skill.level),
          llm_level: skill.level,
        };
        let { error: upError } = await supabase
          .from("user_skills")
          .update(updatePayload)
          .eq("id", existingLink.id);
        if (
          upError &&
          (String(upError.message).includes("schema cache") ||
            String(upError.message).includes("does not exist"))
        ) {
          const retry = await supabase
            .from("user_skills")
            .update({ proficiency: toProficiency(skill.level) })
            .eq("id", existingLink.id);
          upError = retry.error;
        }
        if (upError) throw upError;
      } else {
        const baseInsertPayload = {
          user_id: user.id,
          skill_id: dbSkillId,
          source: options.source,
          proficiency: toProficiency(skill.level),
        };
        const extendedInsertPayload = {
          ...baseInsertPayload,
          llm_level: skill.level,
          user_quote: skill.user_quote || null,
        };

        let { error: createLinkError } = await supabase
          .from("user_skills")
          .insert(extendedInsertPayload);

        if (createLinkError && String(createLinkError.message).includes("schema cache")) {
          const retry = await supabase.from("user_skills").insert(baseInsertPayload);
          createLinkError = retry.error;
        }

        if (createLinkError) throw createLinkError;
      }

      options.onLinked?.(hadExistingLink);
      const desc = skill.description || skill.summary || null;
      if (desc) descriptionCacheRef.current.set(formatSkillName(normalizedName), desc);
      await loadAcceptedSkills();
      onUserSkillsMutated?.();
      if (options.source === "manual") {
        if (hadExistingLink) {
          toast.success(`${t("skills.levelUpdated")}: ${formattedName}`);
        } else {
          toast.success(`${t("skills.manual.added")}: ${formattedName}`);
        }
      } else {
        toast.success(`Saved: ${formattedName}`);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save skill");
    } finally {
      setActionBusy(false);
      setActiveSkillId(null);
    }
  };

  const acceptSkill = async (skill: SelectedSkill) => {
    await persistUserSkill(skill, {
      source: "chat",
      onLinked: () => removeSuggestion(skill),
    });
  };

  const addManualSkill = async (candidate: ManualSkillCandidate) => {
    if (!user) {
      toast.error("You need to be signed in.");
      return;
    }
    if (actionBusy) return;
    const level = manualPickLevel[candidate.skill_id] ?? "intermediate";
    const selected: SelectedSkill = {
      skill_id: candidate.skill_id,
      skill_label: candidate.skill_label,
      summary: candidate.description || "",
      description: candidate.description || "",
      concept_uri: candidate.concept_uri || "",
      full_metadata: candidate.full_metadata || {},
      level,
      user_quote: "",
    };
    await persistUserSkill(selected, { source: "manual" });
  };

  const updateAcceptedSkillLevel = async (userSkillId: string, newLevel: string) => {
    if (!user) return;
    setLevelUpdateBusyId(userSkillId);
    try {
      const ext = { proficiency: toProficiency(newLevel), llm_level: newLevel };
      let { error } = await supabase.from("user_skills").update(ext).eq("id", userSkillId);
      if (
        error &&
        (String(error.message).includes("schema cache") ||
          String(error.message).includes("does not exist"))
      ) {
        const r = await supabase
          .from("user_skills")
          .update({ proficiency: toProficiency(newLevel) })
          .eq("id", userSkillId);
        error = r.error;
      }
      if (error) throw error;
      await loadAcceptedSkills();
      toast.success(t("skills.levelUpdated"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setLevelUpdateBusyId(null);
    }
  };

  const deleteAcceptedSkill = async (userSkillId: string) => {
    if (deleteBusyId) return;
    setDeleteBusyId(userSkillId);
    try {
      const { error } = await supabase.from("user_skills").delete().eq("id", userSkillId);
      if (error) throw error;
      await loadAcceptedSkills();
      onUserSkillsMutated?.();
      toast.success(t("dash.removed"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("dash.removeError"));
    } finally {
      setDeleteBusyId(null);
    }
  };

  return (
    <div
      id="skills-workspace"
      className="scroll-mt-28 grid min-h-0 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch"
    >
      <section
        className={cn(
          "flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/90 shadow-lg shadow-primary/5 backdrop-blur-sm",
          SKILLS_STACK_HEIGHT,
        )}
        aria-label={t("skills.title")}
      >
        <div className="relative border-b border-border/50 bg-gradient-to-b from-muted/50 to-transparent px-5 py-5 sm:px-6">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
            aria-hidden
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("skills.title")}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("skills.subtitle")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="animate-in fade-in zoom-in-95 rounded-full border border-border/50"
              >
                {messages.length} {t("skills.messages")}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={startNewChatSession}
                disabled={busy}
              >
                {t("skills.newSession")}
              </Button>
            </div>
          </div>
        </div>
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          className="chat-scroll flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-background/30 to-background/60 px-5 py-5 sm:px-6"
        >
          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const showStreamCursor =
              m.role === "assistant" && busy && isLast && m.content.length > 0;
            const showStatusLine =
              m.role === "assistant" && !m.content && busy && isLast;
            return (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm transition duration-300 sm:max-w-[82%]",
                    m.role === "user"
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-md shadow-primary/20"
                      : "border border-border/60 bg-card text-foreground",
                    showStatusLine && "min-h-[3rem]",
                  )}
                >
                  {showStatusLine ? (
                    <p className="text-muted-foreground transition-[opacity] duration-300" aria-live="polite">
                      {t(SKILLS_STATUS_KEYS[streamStatusIdx] ?? "skills.status.1")}
                    </p>
                  ) : (
                    <>
                      {m.role === "assistant" ? (
                        <ChatMarkdown>{m.content}</ChatMarkdown>
                      ) : (
                        m.content
                      )}
                      {showStreamCursor ? (
                        <span
                          className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-sm bg-primary/80 align-middle"
                          aria-hidden
                        />
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2 border-t border-border/50 bg-card/80 px-3 py-3 backdrop-blur-sm sm:px-4"
          aria-label={t("skills.title")}
        >
          <div
            className="flex shrink-0 items-center gap-1 pb-0.5"
            role="group"
            aria-label={t("skills.composerActionsLabel")}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-2xl text-muted-foreground transition hover:text-foreground"
              disabled={busy}
              title={t("skills.documentSoon")}
              aria-label={t("skills.documentSoon")}
            >
              <Paperclip className="h-7 w-7" strokeWidth={2.25} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-12 w-12 rounded-2xl text-muted-foreground transition hover:text-foreground"
              disabled={busy}
              title={t("skills.voiceSoon")}
              aria-label={t("skills.voiceSoon")}
            >
              <Mic className="h-7 w-7" strokeWidth={2.25} />
            </Button>
          </div>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("skills.placeholder")}
            maxLength={2000}
            disabled={busy}
            rows={2}
            className="min-h-[44px] flex-1 resize-none rounded-2xl border-border/60 bg-background/80 transition focus-visible:ring-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!busy && input.trim()) {
                  send();
                }
              }
            }}
          />
          <Button
            type="submit"
            disabled={busy || !input.trim()}
            className="min-w-20 shrink-0 self-end rounded-2xl shadow-md shadow-primary/15 sm:min-w-24"
          >
            {busy ? t("skills.sending") : t("skills.send")}
          </Button>
        </form>
        <div className="px-4 pb-3 text-right text-xs text-muted-foreground">{t("skills.hint")}</div>
      </section>

      <aside
        className={cn("flex min-h-0 min-w-0 flex-col gap-3", SKILLS_STACK_HEIGHT)}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain rounded-3xl border border-border/60 bg-card/90 shadow-lg shadow-primary/5 backdrop-blur-sm [scrollbar-gutter:stable]">

          {/* ── Manually add skills (always open) ── */}
          <section className="border-b border-border/50 px-5 py-4 sm:px-6">
            <h3 className="mb-3 text-sm font-semibold">{t("skills.manual.title")}</h3>
            <div className="space-y-2">
              <Textarea
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                rows={2}
                className="min-h-[44px] resize-none"
                placeholder={t("skills.manual.placeholder")}
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
                {manualBusy ? t("skills.manual.searching") : t("skills.manual.search")}
              </Button>
              {manualResults.length > 0 ? (
                <ul className="space-y-3">
                  {manualResults.map((candidate) => (
                    <li
                      key={candidate.skill_id}
                      className="overflow-hidden rounded-xl border border-border/60 bg-card/80"
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-3.5">
                        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere] break-words pr-1">
                          {formatSkillName(candidate.skill_label || candidate.skill_id)}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => addManualSkill(candidate)}
                          disabled={actionBusy}
                          className="mt-0.5 shrink-0"
                        >
                          {actionBusy && activeSkillId === candidate.skill_id
                            ? t("skills.saving")
                            : t("skills.manual.add")}
                        </Button>
                      </div>
                      {candidate.description ? (
                        <div className="max-h-96 overflow-y-auto border-b border-border/50 bg-muted/10 px-4 py-3.5 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                          {candidate.description}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                          {t("skills.level")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Select
                            value={manualPickLevel[candidate.skill_id] ?? "intermediate"}
                            onValueChange={(v) =>
                              setManualPickLevel((m) => ({ ...m, [candidate.skill_id]: v }))
                            }
                            disabled={actionBusy}
                          >
                            <SelectTrigger className="h-9 w-full max-w-full text-xs sm:max-w-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROFICIENCY_PRESETS.map((p) => (
                                <SelectItem key={p} value={p}>
                                  {t(`skills.proficiency.${p}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>

          {/* ── Pending suggestions (collapsible) ── */}
          <section className="border-b border-border/50">
            <button
              type="button"
              className="flex w-full items-center justify-between px-5 py-4 text-left sm:px-6"
              onClick={() => setPendingOpen((o) => !o)}
              aria-expanded={pendingOpen}
            >
              <span className="text-sm font-semibold">
                {t("skills.panel.pending")}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">({selectedByLlm.length})</span>
              </span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", pendingOpen && "rotate-180")}
                aria-hidden
              />
            </button>
            {pendingOpen && (
              <div className="px-5 pb-4 sm:px-6">
                {selectedByLlm.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    {t("skills.panel.nonePending")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedByLlm.map((skillId) => (
                      <li key={skillId.skill_id} className="rounded-xl border bg-background px-4 py-4">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold leading-snug text-foreground break-words [overflow-wrap:anywhere]">
                            {formatSkillName(skillId.skill_label || skillId.skill_id)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("skills.level")}: {formatTagValue(skillId.level)}
                          </p>
                        </div>
                        {skillId.description ? (
                          <div className="mt-2 max-h-96 overflow-y-auto rounded-md border border-border/40 bg-muted/15 p-3 text-sm text-foreground whitespace-pre-wrap break-words">
                            {skillId.description}
                          </div>
                        ) : null}
                        {skillId.summary && !skillId.description ? (
                          <div className="mt-2 max-h-96 overflow-y-auto rounded-md border border-border/40 bg-muted/15 p-3 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                            {skillId.summary}
                          </div>
                        ) : null}
                        {skillId.user_quote ? (
                          <div className="mt-2 max-h-96 overflow-y-auto rounded-md border border-border/40 bg-muted/15 p-3 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                            &quot;{skillId.user_quote}&quot;
                          </div>
                        ) : null}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => acceptSkill(skillId)}
                            disabled={actionBusy || busy}
                          >
                            {actionBusy && activeSkillId === skillId.skill_id
                              ? t("skills.saving")
                              : t("skills.accept")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => removeSuggestion(skillId)}
                            disabled={actionBusy || busy}
                          >
                            {t("skills.reject")}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* ── Your skills (collapsible) ── */}
          <section>
            <button
              type="button"
              className="flex w-full items-center justify-between px-5 py-4 text-left sm:px-6"
              onClick={() => setYourSkillsOpen((o) => !o)}
              aria-expanded={yourSkillsOpen}
            >
              <span className="text-sm font-semibold">
                {t("skills.panel.title")}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">({acceptedSkills.length})</span>
              </span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", yourSkillsOpen && "rotate-180")}
                aria-hidden
              />
            </button>
            {yourSkillsOpen && (
              <div className="px-5 pb-4 sm:px-6">
                {acceptedSkills.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    {t("skills.panel.noneAccepted")}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {acceptedSkills.map((skill) => {
                      const levelDisabled =
                        levelUpdateBusyId === skill.id || deleteBusyId === skill.id || actionBusy;
                      return (
                        <li
                          key={skill.id}
                          className="overflow-hidden rounded-xl border border-border/60 bg-card/80"
                        >
                          <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-3.5">
                            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere] break-words pr-1">
                              {formatSkillName(skill.name)}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void deleteAcceptedSkill(skill.id)}
                              disabled={!!deleteBusyId || levelUpdateBusyId === skill.id || actionBusy}
                              className="mt-0.5 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              {deleteBusyId === skill.id ? (
                                t("dash.deleting")
                              ) : (
                                <span className="inline-flex items-center gap-1.5">
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                  {t("dash.delete")}
                                </span>
                              )}
                            </Button>
                          </div>
                          {skill.description ? (
                            <div className="max-h-40 overflow-y-auto border-b border-border/50 bg-muted/10 px-4 py-3.5 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                              {skill.description}
                            </div>
                          ) : null}
                          {skill.user_quote ? (
                            <div className="max-h-32 overflow-y-auto border-b border-border/50 bg-muted/10 px-4 py-3.5 text-xs leading-relaxed text-muted-foreground italic [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                              &quot;{skill.user_quote}&quot;
                            </div>
                          ) : null}
                          <div className="flex items-center gap-3 px-4 py-3.5">
                            <span className="shrink-0 text-xs font-medium text-muted-foreground">
                              {t("skills.level")}
                            </span>
                            <div className="min-w-0 flex-1">
                              <Select
                                value={levelPresetFromDb(skill.proficiency, skill.llm_level)}
                                onValueChange={(v) => void updateAcceptedSkillLevel(skill.id, v)}
                                disabled={levelDisabled}
                              >
                                <SelectTrigger className="h-9 w-full max-w-full text-xs sm:max-w-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {PROFICIENCY_PRESETS.map((p) => (
                                    <SelectItem key={p} value={p}>
                                      {t(`skills.proficiency.${p}`)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
        {showBackLink ? (
          <Link
            to="/app"
            className="shrink-0 text-sm text-muted-foreground transition hover:text-foreground"
          >
            ← {t("skills.back")}
          </Link>
        ) : null}
      </aside>
    </div>
  );
}
