import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SYSTEM_PROMPT = `You are a friendly skills coach for the UNMAPPED platform.
Your goal: through a short, warm conversation, surface the user's professional skills.

Rules:
- Ask ONE focused question at a time. Keep replies under 4 sentences.
- After every user message, also output a hidden JSON line at the very end of your reply, on its own line, in this EXACT format:
  <<SKILLS>>{"skills":["skill name 1","skill name 2"]}<<END>>
- "skills" is a list of NEW skills you just inferred from the latest user message (lowercase, short, generic terms like "project management", "python", "stakeholder communication"). Use [] if none.
- Never mention the JSON to the user. Speak naturally above it.
- When you feel you have a solid picture (5–10 skills), invite them to view their saved skills.`;

const InputSchema = z.object({
  conversationId: z.string().uuid().nullable(),
  message: z.string().trim().min(1).max(2000),
});

export const sendSkillsChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

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

    // load history
    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    // store user msg
    await supabase
      .from("chat_messages")
      .insert({ conversation_id: convId, role: "user", content: data.message });

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(history ?? []).map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: data.message },
    ];

    // Call Lovable AI Gateway
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { conversationId: convId, reply: "AI is not configured.", newSkills: [] as string[], error: "missing_key" };
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
    });

    if (res.status === 429) {
      return { conversationId: convId, reply: "Rate limit reached, please try again shortly.", newSkills: [], error: "rate_limit" };
    }
    if (res.status === 402) {
      return { conversationId: convId, reply: "AI credits exhausted. Please add credits in Lovable Cloud.", newSkills: [], error: "credits" };
    }
    if (!res.ok) {
      const txt = await res.text();
      console.error("AI error", res.status, txt);
      return { conversationId: convId, reply: "AI service error.", newSkills: [], error: "ai_error" };
    }

    const json = await res.json();
    const fullReply: string = json?.choices?.[0]?.message?.content ?? "";

    // Extract <<SKILLS>>...<<END>>
    let newSkills: string[] = [];
    let visibleReply = fullReply;
    const m = fullReply.match(/<<SKILLS>>(\{[\s\S]*?\})<<END>>/);
    if (m) {
      try {
        const parsed = JSON.parse(m[1]);
        if (Array.isArray(parsed.skills)) {
          newSkills = parsed.skills
            .map((s: unknown) => String(s).trim().toLowerCase())
            .filter((s: string) => s.length > 1 && s.length <= 80);
        }
      } catch {
        // ignore
      }
      visibleReply = fullReply.replace(/<<SKILLS>>[\s\S]*?<<END>>/, "").trim();
    }

    // Persist assistant message (visible part only)
    await supabase
      .from("chat_messages")
      .insert({ conversation_id: convId, role: "assistant", content: visibleReply });

    // Upsert skills + link to user
    const linked: string[] = [];
    for (const name of newSkills) {
      const { data: existing } = await supabase
        .from("skills")
        .select("id")
        .eq("name", name)
        .maybeSingle();
      let skillId = existing?.id;
      if (!skillId) {
        const { data: created, error: createErr } = await supabase
          .from("skills")
          .insert({ name })
          .select("id")
          .single();
        if (createErr) continue;
        skillId = created.id;
      }
      const { error: linkErr } = await supabase
        .from("user_skills")
        .insert({ user_id: userId, skill_id: skillId, source: "chat" });
      if (!linkErr) linked.push(name);
    }

    return { conversationId: convId, reply: visibleReply, newSkills: linked, error: null as string | null };
  });
