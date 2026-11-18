import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Loader2, Send, Sparkles, User } from "lucide-react";
import { askAssistant, type AssistantTool } from "@/lib/assistant/assistant.functions";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "Assistant — DailyBrief" },
      {
        name: "description",
        content: "Posez une question sur votre activité : l'assistant lit vos données et répond.",
      },
      { property: "og:title", content: "Assistant — DailyBrief" },
      { property: "og:description", content: "Vos données, en une question." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

const TOOL_LABEL: Record<AssistantTool, string> = {
  rapports_recents: "rapports récents",
  actions_ouvertes: "actions ouvertes",
  objectifs: "objectifs",
  plannings: "plannings",
  membres_silencieux: "équipe",
  aucun: "réponse directe",
};

const SUGGESTIONS = [
  "Quels sont mes derniers rapports ?",
  "Combien d'actions ouvertes ai-je, et combien en retard ?",
  "Où en sont mes objectifs ?",
  "Qui n'a pas envoyé de rapport cette semaine ?",
  "Quels sont les plannings en cours ?",
];

type Message = { role: "user" | "assistant"; text: string; tool?: AssistantTool };

function AssistantPage() {
  const askFn = useServerFn(askAssistant);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;

    setMessages((current) => [...current, { role: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      const result = await askFn({ data: { message: question } });
      setMessages((current) => [
        ...current,
        { role: "assistant", text: result.answer, tool: result.tool },
      ]);
    } catch (e: any) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: e?.message ?? "Je n'ai pas pu répondre. Réessayez dans un instant.",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      }, 50);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] max-w-3xl flex-col px-4 py-6">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Assistant</h1>
        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          lit vos données
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Posez une question sur votre activité. L'assistant choisit la bonne donnée, la lit, puis
        répond avec les vrais chiffres.
      </p>

      <div ref={listRef} className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Essayez une de ces questions
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-full border px-3 py-1.5 text-left text-[13px] transition hover:bg-muted"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "assistant" && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.tool && (
                <p className="mt-1.5 text-[10px] uppercase tracking-wide opacity-60">
                  source : {TOOL_LABEL[message.tool]}
                </p>
              )}
            </div>
            {message.role === "user" && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Je regarde vos données…
          </div>
        )}
      </div>

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ex. Combien d'actions en retard cette semaine ?"
          className="h-11"
          disabled={loading}
        />
        <Button type="submit" size="icon" className="h-11 w-11" disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      <p className="mt-2 text-[11px] text-muted-foreground">
        L'assistant lit uniquement ce que vos droits autorisent. Il ne modifie rien pour l'instant.
      </p>
    </div>
  );
}
