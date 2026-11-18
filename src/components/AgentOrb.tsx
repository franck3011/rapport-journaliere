import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Mic, Send, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { askAssistant, type AssistantTool } from "@/lib/assistant/assistant.functions";

/**
 * Agent flottant, façon Siri : discret en bas à droite, il n'apparaît qu'à la
 * demande et n'occupe aucune place dans le menu.
 */

type Message = { role: "user" | "assistant"; text: string; tool?: AssistantTool; data?: any };

const TOOL_LABEL: Record<AssistantTool, string> = {
  rapports_recents: "rapports",
  actions_ouvertes: "actions",
  objectifs: "objectifs",
  plannings: "plannings",
  membres_silencieux: "équipe",
  creer_rapport: "rapport créé",
  creer_planning: "planning créé",
  creer_action: "action créée",
  cloturer_action: "action clôturée",
  creer_objectif: "objectif créé",
  aucun: "assistante",
};

const HINTS = [
  "Crée un planning de maintenance pour la semaine prochaine",
  "Combien d'actions en retard ?",
  "Qui n'a pas envoyé de rapport cette semaine ?",
];

export function AgentOrb() {
  const askFn = useServerFn(askAssistant);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, open]);

  // Invisible : on l'appelle au clavier, comme un assistant système.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const isShortcut =
        (event.ctrlKey || event.metaKey) && (event.code === "Space" || event.key === " ");
      if (isShortcut) {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setMessages((current) => [...current, { role: "user", text: question }]);
    setInput("");
    setBusy(true);
    try {
      const result = await askFn({ data: { message: question } });
      setMessages((current) => [
        ...current,
        { role: "assistant", text: result.answer, tool: result.tool, data: result.data },
      ]);
    } catch (e: any) {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: e?.message ?? "Je n'ai pas pu répondre." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    const Ctor =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
    if (!Ctor) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: "La dictée vocale n'est pas disponible dans ce navigateur. Utilisez Chrome, ou écrivez votre demande.",
        },
      ]);
      setOpen(true);
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "fr-FR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      setListening(false);
      setOpen(true);
      if (transcript) void send(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <>
      {/* Aucun bouton visible : l'agent s'appelle au clavier (Ctrl+Espace). */}

      {/* Panneau */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[min(560px,80vh)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Agent</span>
            <button
              type="button"
              onClick={startListening}
              className={`ml-auto rounded-full p-1.5 transition ${
                listening ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:bg-muted"
              }`}
              aria-label="Parler à l'agent"
              title="Parler"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Demande-moi n'importe quoi sur ton activité — ou dicte-le avec le micro. Rappel : Ctrl+Espace pour m'appeler.
                </p>
                {HINTS.map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => void send(hint)}
                    className="block w-full rounded-lg border px-3 py-2 text-left text-[13px] transition hover:bg-muted"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.text}</p>
                {message.tool && (
                  <p className="mt-1 text-[10px] uppercase tracking-wide opacity-60">
                    {TOOL_LABEL[message.tool]}
                  </p>
                )}
                {message.data?.id && (
                  <Link
                    to={message.tool === "creer_planning" ? "/planning/$id" : "/reports/$id"}
                    params={{ id: message.data.id }}
                    onClick={() => setOpen(false)}
                    className="mt-1 inline-block text-[12px] font-medium underline underline-offset-2"
                  >
                    Ouvrir →
                  </Link>
                )}
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Je regarde…
              </div>
            )}
            {listening && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <Mic className="h-3.5 w-3.5 animate-pulse" />
                Je t'écoute…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="flex items-center gap-2 border-t p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Demande-moi…"
              className="h-9"
              disabled={busy}
            />
            <Button
              type="submit"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={busy || !input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
