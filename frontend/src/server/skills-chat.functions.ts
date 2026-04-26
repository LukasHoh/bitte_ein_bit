import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { execute, queryOne } from "@/integrations/db/client.server";
import { requireAuth } from "@/integrations/db/session.server";

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
  const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => [
    k,
    String(v ?? ""),
  ]);
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
                    user_quote: typeof skill.user_quote === "string" ? skill.user_quote.trim() : "",
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

function buildRunJsonBody(
  assistantId: string,
  languageCode: string | null,
  userId: string,
  userMessage: string,
) {
  return {
    assistant_id: assistantId,
    input: {
      messages: [
        {
          role: "system" as const,
          content: languageCode
            ? `Always respond in language code "${languageCode}".`
            : "Respond in the same language as the user.",
        },
        { role: "user" as const, content: userMessage },
      ],
    },
    metadata: {
      user_id: userId,
      language: languageCode,
    },
  };
}

/** Best-effort assistant text from various LangGraph stream chunk shapes. */
function collectCandidateRepliesForChunk(streamChunk: unknown): string {
  const candidates: unknown[] = [streamChunk];
  if (Array.isArray(streamChunk) && streamChunk.length >= 2) {
    candidates.push(streamChunk[1]);
  }
  if (streamChunk && typeof streamChunk === "object") {
    const o = streamChunk as Record<string, unknown>;
    if (o.data != null) candidates.push(o.data);
  }
  let best = "";
  for (const c of candidates) {
    const t = extractAssistantReply(c);
    if (t.length > best.length) best = t;
  }
  return best;
}

async function* readNdjsonLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      const rest = buffer.trim();
      if (rest) yield rest;
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield line;
    }
  }
}

async function* readSseJsonData(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      if (buffer.trim()) {
        const blocks = buffer.split("\n\n");
        for (const block of blocks) {
          for (const line of block.split("\n")) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const payload = t.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              yield JSON.parse(payload);
            } catch {
              /* ignore */
            }
          }
        }
      }
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const block of parts) {
      for (const line of block.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          yield JSON.parse(payload);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

/**
 * Looks up the caller's preferred language and ensures a `chat_conversations`
 * row exists for the given `conversationId`. Returns the resolved language +
 * conversation id.
 */
async function ensureConversation(
  userId: string,
  conversationId: string | null,
): Promise<{ convId: string; languageCode: string | null }> {
  const profile = await queryOne<{ language: string | null }>(
    "SELECT language FROM profiles WHERE id = $id",
    { id: userId },
  );
  const languageCode = profile?.language ?? null;

  let convId = conversationId;
  if (!convId) {
    convId = crypto.randomUUID();
    await execute(
      "INSERT INTO chat_conversations (id, user_id, title) VALUES ($id, $user_id, $title)",
      { id: convId, user_id: userId, title: "Chat" },
    );
  } else {
    const existing = await queryOne<{ user_id: string }>(
      "SELECT user_id FROM chat_conversations WHERE id = $id",
      { id: convId },
    );
    if (!existing) {
      await execute(
        "INSERT INTO chat_conversations (id, user_id, title) VALUES ($id, $user_id, $title)",
        { id: convId, user_id: userId, title: "Chat" },
      );
    } else if (existing.user_id !== userId) {
      throw new Response("Forbidden", { status: 403 });
    }
  }

  return { convId, languageCode };
}

async function appendChatMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  await execute(
    `INSERT INTO chat_messages (id, conversation_id, role, content)
     VALUES ($id, $conv, $role, $content)`,
    { id: crypto.randomUUID(), conv: conversationId, role, content },
  );
}

export const sendSkillsChat = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { convId, languageCode } = await ensureConversation(userId, data.conversationId);
    const assistantId = resolveAssistantId(languageCode);

    await appendChatMessage(convId, "user", data.message);
    await ensureLangGraphThread(convId, userId);

    const runRes = await fetch(`${LANGGRAPH_BASE_URL}/threads/${convId}/runs/wait`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildRunJsonBody(assistantId, languageCode, userId, data.message)),
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

    await appendChatMessage(convId, "assistant", visibleReply);

    return {
      conversationId: convId,
      reply: visibleReply,
      newSkills: selectedSkills.map((s) => s.skill_id),
      selectedSkills,
      error: null as string | null,
    };
  });

/**
 * Streams LangGraph output as NDJSON lines: { type: "text", text }, then { type: "end", ... }.
 * Falls back to /runs/wait when /runs/stream is unavailable.
 */
export const streamSkillsChat = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { convId, languageCode } = await ensureConversation(userId, data.conversationId);
    const assistantId = resolveAssistantId(languageCode);

    await appendChatMessage(convId, "user", data.message);
    await ensureLangGraphThread(convId, userId);

    const runBody = buildRunJsonBody(assistantId, languageCode, userId, data.message);
    const streamUrl = `${LANGGRAPH_BASE_URL}/threads/${convId}/runs/stream`;

    const streamRes = await fetch(streamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson, application/json, text/event-stream",
      },
      body: JSON.stringify({ ...runBody, stream_mode: "values" }),
    });

    if (!streamRes.ok) {
      const waitRes = await fetch(`${LANGGRAPH_BASE_URL}/threads/${convId}/runs/wait`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runBody),
      });
      if (!waitRes.ok) {
        const txt = await waitRes.text();
        console.error("LangGraph error (stream + wait)", waitRes.status, txt);
        return new Response(
          JSON.stringify({
            type: "end",
            conversationId: convId,
            reply: "Chat backend error.",
            selectedSkills: [] as SelectedSkill[],
            newSkills: [] as string[],
            error: "chat_backend_error",
          }) + "\n",
          {
            status: 200,
            headers: {
              "Content-Type": "application/x-ndjson; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        );
      }
      const runOutput = await waitRes.json();
      const visibleReply = extractAssistantReply(runOutput) || "I could not generate a reply.";
      const selectedSkills = extractSelectedSkills(runOutput);
      await appendChatMessage(convId, "assistant", visibleReply);

      const out =
        JSON.stringify({ type: "text", text: visibleReply }) +
        "\n" +
        JSON.stringify({
          type: "end",
          conversationId: convId,
          reply: visibleReply,
          selectedSkills,
          newSkills: selectedSkills.map((s) => s.skill_id),
          error: null,
        }) +
        "\n";
      return new Response(out, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const enc = new TextEncoder();
    let lastChunk: unknown;
    let lastText = "";

    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            const ct = streamRes.headers.get("content-type") || "";
            const body = streamRes.body;
            if (!body) {
              throw new Error("Empty response body from LangGraph stream");
            }

            if (ct.includes("text/event-stream")) {
              for await (const ev of readSseJsonData(body)) {
                lastChunk = ev;
                const t = collectCandidateRepliesForChunk(ev);
                if (t && t !== lastText) {
                  lastText = t;
                  controller.enqueue(enc.encode(JSON.stringify({ type: "text", text: t }) + "\n"));
                }
              }
            } else {
              for await (const line of readNdjsonLines(body)) {
                let parsed: unknown;
                try {
                  parsed = JSON.parse(line);
                } catch {
                  continue;
                }
                lastChunk = parsed;
                const t = collectCandidateRepliesForChunk(parsed);
                if (t && t !== lastText) {
                  lastText = t;
                  controller.enqueue(enc.encode(JSON.stringify({ type: "text", text: t }) + "\n"));
                }
              }
            }

            const finalReply =
              extractAssistantReply(lastChunk ?? {}) || lastText || "I could not generate a reply.";
            const selectedSkills = extractSelectedSkills(lastChunk ?? {});

            await appendChatMessage(convId, "assistant", finalReply);

            controller.enqueue(
              enc.encode(
                JSON.stringify({
                  type: "end",
                  conversationId: convId,
                  reply: finalReply,
                  selectedSkills,
                  newSkills: selectedSkills.map((s) => s.skill_id),
                  error: null,
                }) + "\n",
              ),
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Stream failed";
            controller.enqueue(enc.encode(JSON.stringify({ type: "error", error: msg }) + "\n"));
            controller.enqueue(
              enc.encode(
                JSON.stringify({
                  type: "end",
                  conversationId: convId,
                  reply: "",
                  selectedSkills: [] as SelectedSkill[],
                  newSkills: [] as string[],
                  error: "stream_error",
                }) + "\n",
              ),
            );
          } finally {
            controller.close();
          }
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  });

export const searchManualSkills = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
