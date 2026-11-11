import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, X, Send, ArrowLeft, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Colleague = {
  company_id: string;
  company_name: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  position_title: string | null;
};
type Msg = {
  id: string;
  company_id: string;
  sender_id: string;
  recipient_id: string | null;
  body: string;
  created_at: string;
};

const nameOf = (c?: Colleague) => c?.full_name || c?.email?.split("@")[0] || "Membre";
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export function CompanyChatWidget() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  /** null = liste ; "general" = salon ; sinon id du collègue */
  const [peer, setPeer] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const openRef = useRef({ open, peer });
  openRef.current = { open, peer };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const { data: colleagues = [] } = useQuery({
    queryKey: ["company-chat-colleagues"],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("company_chat_colleagues");
      if (error) throw error;
      return (data ?? []) as Colleague[];
    },
  });
  const companyId = colleagues[0]?.company_id ?? null;
  const companyName = colleagues[0]?.company_name ?? "";
  const byId = useMemo(() => new Map(colleagues.map((c) => [c.user_id, c])), [colleagues]);
  const others = colleagues.filter((c) => c.user_id !== me);

  const { data: messages = [] } = useQuery({
    queryKey: ["company-chat-messages", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_chat_messages")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return ((data ?? []) as Msg[]).reverse();
    },
  });

  useEffect(() => {
    if (!companyId || !me) return;
    const channel = supabase
      .channel(`company-chat-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "company_chat_messages", filter: `company_id=eq.${companyId}` },
        (payload) => {
          const m = payload.new as Msg;
          qc.setQueryData<Msg[]>(["company-chat-messages", companyId], (old = []) =>
            old.some((x) => x.id === m.id) ? old : [...old, m],
          );
          if (m.sender_id === me) return;
          const key = m.recipient_id ? m.sender_id : "general";
          const st = openRef.current;
          if (!(st.open && st.peer === key)) setUnread((u) => ({ ...u, [key]: (u[key] ?? 0) + 1 }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, me, qc]);

  const thread = useMemo(() => {
    if (!peer || !me) return [];
    if (peer === "general") return messages.filter((m) => !m.recipient_id);
    return messages.filter(
      (m) => (m.sender_id === me && m.recipient_id === peer) || (m.sender_id === peer && m.recipient_id === me),
    );
  }, [messages, peer, me]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [thread.length, peer, open]);

  const openThread = (k: string) => {
    setPeer(k);
    setUnread((u) => ({ ...u, [k]: 0 }));
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !companyId || !me || !peer) return;
    setText("");
    const { data, error } = await supabase
      .from("company_chat_messages")
      .insert({ company_id: companyId, sender_id: me, recipient_id: peer === "general" ? null : peer, body })
      .select()
      .single();
    if (error) {
      setText(body);
      toast.error("Message non envoyé");
      return;
    }
    qc.setQueryData<Msg[]>(["company-chat-messages", companyId], (old = []) =>
      old.some((x) => x.id === data.id) ? old : [...old, data as Msg],
    );
  };

  if (!me || !companyId) return null;
  const total = Object.values(unread).reduce((a, b) => a + b, 0);
  const peerC = peer && peer !== "general" ? byId.get(peer) : undefined;

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-3 z-50 flex h-[min(520px,calc(100dvh-7rem))] w-[min(360px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl">
          <div className="flex items-center gap-2 border-b bg-primary px-3 py-2.5 text-primary-foreground">
            {peer && (
              <button onClick={() => setPeer(null)} aria-label="Retour" className="rounded p-1 hover:bg-primary-foreground/10">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {peer === "general" ? "Salon général" : peerC ? nameOf(peerC) : "Tchat d'entreprise"}
              </div>
              <div className="truncate text-xs opacity-80">{companyName} · membres uniquement</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fermer le tchat" className="rounded p-1 hover:bg-primary-foreground/10">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!peer ? (
            <div className="flex-1 overflow-y-auto">
              <ThreadRow
                onClick={() => openThread("general")}
                icon={<div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><Hash className="h-4 w-4" /></div>}
                title="Salon général"
                subtitle={`Tous les membres de ${companyName}`}
                count={unread.general}
              />
              <div className="px-3 pb-1 pt-3 text-xs font-medium uppercase text-muted-foreground">Collègues</div>
              {others.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">Invitez des membres dans votre entreprise pour discuter.</p>
              )}
              {others.map((c) => (
                <ThreadRow
                  key={c.user_id}
                  onClick={() => openThread(c.user_id)}
                  icon={
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={c.avatar_url ?? undefined} />
                      <AvatarFallback>{initials(nameOf(c))}</AvatarFallback>
                    </Avatar>
                  }
                  title={nameOf(c)}
                  subtitle={c.position_title || c.email || ""}
                  count={unread[c.user_id]}
                />
              ))}
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto bg-muted/30 p-3">
                {thread.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Aucun message. Écrivez le premier !</p>}
                {thread.map((m) => {
                  const mine = m.sender_id === me;
                  return (
                    <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                      {!mine && peer === "general" && (
                        <span className="mb-0.5 px-1 text-xs text-muted-foreground">{nameOf(byId.get(m.sender_id))}</span>
                      )}
                      <div className={cn("max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-card border")}>
                        {m.body}
                      </div>
                      <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                        {new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <form
                className="flex items-end gap-2 border-t p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  maxLength={4000}
                  placeholder="Votre message…"
                  aria-label="Votre message"
                  className="max-h-28 min-h-9 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <Button type="submit" size="icon" disabled={!text.trim()} aria-label="Envoyer">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Tchat d'entreprise"
        className="fixed bottom-4 right-3 z-50 flex h-13 w-13 items-center justify-center rounded-full bg-primary p-3.5 text-primary-foreground shadow-lg transition hover:scale-105"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground">
            {total}
          </span>
        )}
      </button>
    </>
  );
}

function ThreadRow(p: { onClick: () => void; icon: React.ReactNode; title: string; subtitle: string; count?: number }) {
  return (
    <button onClick={p.onClick} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted">
      {p.icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{p.title}</div>
        <div className="truncate text-xs text-muted-foreground">{p.subtitle}</div>
      </div>
      {!!p.count && (
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{p.count}</span>
      )}
    </button>
  );
}
