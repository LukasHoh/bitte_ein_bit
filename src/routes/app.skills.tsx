import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { sendSkillsChat } from "@/server/skills-chat.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/skills")({
  component: SkillsChatPage,
});

type Msg = { role: "user" | "assistant"; content: string };
type Skill = { id: string; name: string; source: string };

function SkillsChatPage() {
  const { user, session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadSkills = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_skills")
      .select("id, source, skills(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setSkills(
      (data ?? []).map((r: any) => ({ id: r.id, name: r.skills?.name ?? "—", source: r.source })),
    );
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      // load most recent conversation
      const { data: conv } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (conv) {
        setConvId(conv.id);
        const { data: msgs } = await supabase
          .from("chat_messages")
          .select("role, content")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true });
        setMessages(
          (msgs ?? [])
            .filter((m: any) => m.role !== "system")
            .map((m: any) => ({ role: m.role, content: m.content })),
        );
      } else {
        setMessages([
          {
            role: "assistant",
            content:
              "Hi! I'll help map out your skills through a short chat. To start: what kind of work or activity do you enjoy doing the most?",
          },
        ]);
      }
      loadSkills();
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
      if (result.newSkills.length > 0) {
        toast.success(`Added: ${result.newSkills.join(", ")}`);
        loadSkills();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const removeSkill = async (id: string) => {
    const { error } = await supabase.from("user_skills").delete().eq("id", id);
    if (error) return toast.error(error.message);
    loadSkills();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex h-[70vh] flex-col rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <h1 className="text-xl font-semibold">Skills chat</h1>
          <p className="text-sm text-muted-foreground">
            Chat naturally — I'll detect skills and add them to your profile.
          </p>
        </div>
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
                thinking…
              </div>
            </div>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2 border-t p-3"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your reply…"
            maxLength={2000}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            Send
          </Button>
        </form>
      </div>

      <aside className="space-y-3">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Your skills ({skills.length})</h2>
          {skills.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No skills yet — chat to add some.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {skills.map((s) => (
                <li key={s.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{s.name}</Badge>
                    <span className="text-xs text-muted-foreground">{s.source}</span>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeSkill(s.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link to="/app" className="block text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>
      </aside>
    </div>
  );
}
