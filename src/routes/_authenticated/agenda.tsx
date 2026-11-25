import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, Loader2, Plus, Trash2, RefreshCw } from "lucide-react";
import {
  createAgendaEvent,
  deleteAgendaEvent,
  listAgenda,
} from "@/lib/agenda/agenda.functions";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({
    meta: [{ title: "Agenda — DailyBrief" }, { name: "robots", content: "noindex" }],
  }),
  component: AgendaPage,
});

const KIND_LABEL: Record<string, string> = {
  rapport: "Rapport",
  mail: "E-mail",
  reunion: "Réunion",
  relance: "Relance",
  autre: "Autre",
  action: "Action",
  jalon: "Jalon",
  absence: "Absence",
};

const KIND_STYLE: Record<string, string> = {
  rapport: "bg-primary/10 text-primary",
  mail: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  reunion: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  relance: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  action: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  jalon: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  absence: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  autre: "bg-muted text-muted-foreground",
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function AgendaPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAgenda);
  const createFn = useServerFn(createAgendaEvent);
  const deleteFn = useServerFn(deleteAgendaEvent);

  const today = new Date();
  const [days, setDays] = useState(30);
  const from = isoDay(today);
  const to = isoDay(new Date(today.getTime() + days * 86400000));

  const [form, setForm] = useState({
    title: "",
    kind: "rapport",
    eventDate: from,
    eventTime: "",
    recurrence: "none",
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["agenda", from, to],
    queryFn: () => listFn({ data: { from, to } }),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const item of items as any[]) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return Array.from(map.entries()).slice(0, 200);
  }, [items]);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          title: form.title,
          kind: form.kind as any,
          eventDate: form.eventDate,
          eventTime: form.eventTime || null,
          recurrence: form.recurrence as any,
        },
      }),
    onSuccess: async () => {
      setForm({ ...form, title: "" });
      toast.success("Événement ajouté");
      await qc.invalidateQueries({ queryKey: ["agenda"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Ajout impossible"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id: id.split("-")[0] } }),
    onSuccess: async () => {
      toast.success("Événement supprimé");
      await qc.invalidateQueries({ queryKey: ["agenda"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Suppression impossible"),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CalendarDays className="h-5 w-5 text-primary" />
            Agenda
          </h1>
          <p className="text-sm text-muted-foreground">
            Les rapports à produire, les e-mails à envoyer, les échéances réelles de l'entreprise.
          </p>
        </div>
        <div className="flex gap-2">
          {[30, 60, 90].map((value) => (
            <Button
              key={value}
              size="sm"
              variant={days === value ? "default" : "outline"}
              onClick={() => setDays(value)}
            >
              {value} j
            </Button>
          ))}
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Programmer</CardTitle>
          <CardDescription>
            Un événement peut se répéter : chaque semaine pour un rapport hebdomadaire, chaque
            mois pour un bilan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              placeholder="Intitulé (ex. Rapport hebdo)"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value })}
            >
              {["rapport", "mail", "reunion", "relance", "autre"].map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={form.eventDate}
              onChange={(event) => setForm({ ...form, eventDate: event.target.value })}
            />
            <Input
              type="time"
              value={form.eventTime}
              onChange={(event) => setForm({ ...form, eventTime: event.target.value })}
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.recurrence}
              onChange={(event) => setForm({ ...form, recurrence: event.target.value })}
            >
              <option value="none">Une seule fois</option>
              <option value="daily">Chaque jour</option>
              <option value="weekly">Chaque semaine</option>
              <option value="monthly">Chaque mois</option>
            </select>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              disabled={form.title.trim().length < 2 || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Ajouter
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      )}

      {!isLoading && grouped.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucun événement sur cette période.
          </CardContent>
        </Card>
      )}

      {grouped.map(([date, list]) => (
        <Card key={date} className="py-0">
          <CardHeader className="py-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              {new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pb-3 pt-0">
            {(list as any[]).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md border px-2.5 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {item.time && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {item.time}
                    </span>
                  )}
                  <span className="truncate text-sm">{item.title}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      KIND_STYLE[item.kind] ?? KIND_STYLE.autre
                    }`}
                  >
                    {KIND_LABEL[item.kind] ?? item.kind}
                  </span>
                  {item.recurring && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      récurrent
                    </span>
                  )}
                </div>
                {item.editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => remove.mutate(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
