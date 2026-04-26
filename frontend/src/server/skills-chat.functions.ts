import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  conversationId: z.string().uuid().nullable(),
  message: z.string().trim().min(1).max(2000),
});

const LANGGRAPH_BASE_URL =
  process.env.SKILL_BACKEND_URL || process.env.VITE_SKILL_BACKEND_URL || "http://localhost:2024";
const LANGGRAPH_ASSISTANT_ID = process.env.LANGGRAPH_ASSISTANT_ID || "agent";

type LangGraphMessage = {
  role?: string;
  type?: string;
  content?: unknown;
  tool_calls?: unknown;
};

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

function resolveAssistantId(languageCode: string | null | undefined): string {
  const normalized = String(languageCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_");
  if (!normalized) return LANGGRAPH_ASSISTANT_ID;

  const envKey = `LANGGRAPH_ASSISTANT_ID_${normalized}`;
  return process.env[envKey] || LANGGRAPH_ASSISTANT_ID;
}

const ManualSkillSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(5),
});

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const maybeText = (part as { text?: unknown }).text;
          return typeof maybeText === "string" ? maybeText : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function extractAssistantReply(payload: unknown): string {
  const queue: unknown[] = [payload];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    const obj = current as Record<string, unknown>;

    const messagesCandidate = obj.messages;
    if (Array.isArray(messagesCandidate)) {
      const messages = messagesCandidate as LangGraphMessage[];
      const assistantMessages = messages.filter(
        (m) => (m.role === "assistant" || m.type === "ai") && m.content !== undefined,
      );
      for (let i = assistantMessages.length - 1; i >= 0; i--) {
        const text = extractText(assistantMessages[i].content);
        if (text) return text;
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  if (payload && typeof payload === "object") {
    const maybeOutput = (payload as Record<string, unknown>).output;
    const outputText = extractText(maybeOutput);
    if (outputText) return outputText;
  }
  return "";
}

function toSerializableMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]);
  return Object.fromEntries(entries);
}

function extractSelectedSkills(payload: unknown): SelectedSkill[] {
  const queue: unknown[] = [payload];
  const selectedById = new Map<string, SelectedSkill>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    const obj = current as Record<string, unknown>;

    const messagesCandidate = obj.messages;
    if (Array.isArray(messagesCandidate)) {
      const messages = messagesCandidate as LangGraphMessage[];
      for (const message of messages) {
        // First, parse tool response messages from save_skill().
        if ((message.type === "tool" || message.role === "tool") && message.content !== undefined) {
          const text = extractText(message.content);
          if (text) {
            try {
              const parsed = JSON.parse(text) as {
                status?: string;
                selected_skill?: Partial<SelectedSkill>;
              };
              if (parsed?.status === "saved" && parsed.selected_skill?.skill_id) {
                const skill = parsed.selected_skill;
                const skillId = String(skill.skill_id).trim();
                if (skillId) {
                  selectedById.set(skillId, {
                    skill_id: skillId,
                    skill_label:
                      typeof skill.skill_label === "string" && skill.skill_label.trim()
                        ? skill.skill_label.trim()
                        : skillId,
                    summary:
                      typeof skill.summary === "string" && skill.summary.trim()
                        ? skill.summary.trim()
                        : "",
                    description:
                      typeof skill.description === "string" && skill.description.trim()
                        ? skill.description.trim()
                        : "",
                    concept_uri:
                      typeof skill.concept_uri === "string" && skill.concept_uri.trim()
                        ? skill.concept_uri.trim()
                        : "",
                    full_metadata:
                      skill.full_metadata && typeof skill.full_metadata === "object"
                        ? toSerializableMetadata(skill.full_metadata)
                        : {},
                    level:
                      typeof skill.level === "string" && skill.level.trim()
                        ? skill.level.trim()
                        : "medium",
                    user_quote:
                      typeof skill.user_quote === "string" ? skill.user_quote.trim() : "",
                  });
                }
              }
            } catch {
              // Ignore non-JSON tool content.
            }
          }
        }

        // Fallback: parse save_skill tool call args if tool response is unavailable.
        const toolCalls = message.tool_calls;
        if (!Array.isArray(toolCalls)) continue;

        for (const rawCall of toolCalls) {
          if (!rawCall || typeof rawCall !== "object") continue;
          const call = rawCall as Record<string, unknown>;

          let toolName = "";
          let argsRaw: unknown;

          if (typeof call.name === "string") {
            toolName = call.name;
            argsRaw = call.args;
          } else if (call.function && typeof call.function === "object") {
            const fn = call.function as Record<string, unknown>;
            toolName = typeof fn.name === "string" ? fn.name : "";
            argsRaw = fn.arguments;
          }

          if (toolName !== "save_skill") continue;

          let args: Record<string, unknown> = {};
          if (typeof argsRaw === "string") {
            try {
              const parsed = JSON.parse(argsRaw);
              if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
            } catch {
              // Ignore malformed tool arguments.
            }
          } else if (argsRaw && typeof argsRaw === "object") {
            args = argsRaw as Record<string, unknown>;
          }

          const skillId = args.skill_id;
          if (typeof skillId === "string" && skillId.trim()) {
            const normalizedSkillId = skillId.trim();
            const levelRaw = args.level;
            const quoteRaw = args.user_quote;
            const selected: SelectedSkill = {
              skill_id: normalizedSkillId,
              skill_label: normalizedSkillId,
              summary: "",
              description: "",
              concept_uri: "",
              full_metadata: {},
              level: typeof levelRaw === "string" && levelRaw.trim() ? levelRaw.trim() : "medium",
              user_quote: typeof quoteRaw === "string" ? quoteRaw.trim() : "",
            };
            selectedById.set(normalizedSkillId, selected);
          }
        }
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return [...selectedById.values()];
}

async function ensureLangGraphThread(threadId: string, userId: string): Promise<void> {
  const createThreadRes = await fetch(`${LANGGRAPH_BASE_URL}/threads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      thread_id: threadId,
      if_exists: "do_nothing",
      metadata: {
        user_id: userId,
      },
    }),
  });
  if (!createThreadRes.ok) {
    const txt = await createThreadRes.text();
    throw new Error(`Failed to ensure chat thread: ${createThreadRes.status} ${txt}`);
  }
}

export const sendSkillsChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: profile } = await supabase
      .from("profiles")
      .select("language")
      .eq("id", userId)
      .maybeSingle();
    const languageCode = (profile?.language as string | null | undefined) ?? null;
    const assistantId = resolveAssistantId(languageCode);

    // ensure conversation
    let convId = data.conversationId;
    if (!convId) {
      const { data: conv, error } = await supabase
        .from("chat_conversations")
        .insert({ user_id: userId, title: "Skills chat" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      convId = conv.id;
    }
    if (!convId) {
      throw new Error("Failed to create conversation.");
    }

    // store user msg
    await supabase
      .from("chat_messages")
      .insert({ conversation_id: convId, role: "user", content: data.message });

    await ensureLangGraphThread(convId, userId);

    const runRes = await fetch(`${LANGGRAPH_BASE_URL}/threads/${convId}/runs/wait`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assistant_id: assistantId,
        input: {
          messages: [
            {
              role: "system",
              content: languageCode
                ? `Always respond in language code "${languageCode}".`
                : "Respond in the same language as the user.",
            },
            { role: "user", content: data.message },
          ],
        },
        metadata: {
          user_id: userId,
          language: languageCode,
        },
      }),
    });

    if (!runRes.ok) {
      const txt = await runRes.text();
      console.error("LangGraph error", runRes.status, txt);
      return {
        conversationId: convId,
        reply: "Chat backend error.",
        newSkills: [] as string[],
        error: "chat_backend_error",
      };
    }

    const runOutput = await runRes.json();
    const visibleReply = extractAssistantReply(runOutput) || "I could not generate a reply.";
    const selectedSkills = extractSelectedSkills(runOutput);

    // Persist assistant message (visible part only)
    await supabase
      .from("chat_messages")
      .insert({ conversation_id: convId, role: "assistant", content: visibleReply });

    return {
      conversationId: convId,
      reply: visibleReply,
      // surfaced to frontend so selected skills can be shown immediately
      newSkills: selectedSkills.map((s) => s.skill_id),
      selectedSkills,
      error: null as string | null,
    };
  });

export const searchManualSkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ManualSkillSearchInputSchema.parse(input))
  .handler(async ({ data }) => {
    const response = await fetch(`${LANGGRAPH_BASE_URL}/skills/manual-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Manual skill search failed: ${response.status} ${txt}`);
    }

    const json = await response.json();
    const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
    return { query: String(json?.query ?? data.query), candidates };
  });
