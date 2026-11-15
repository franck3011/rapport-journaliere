import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bug, Loader2, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { clearErrorEvents, listErrorEvents } from "@/lib/errors.functions";

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ErrorsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listErrorEvents);
  const clearFn = useServerFn(clearErrorEvents);
  const [open, setOpen] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["error-events"],
    queryFn: () => listFn(),
  });

  const clear = useMutation({
    mutationFn: () => clearFn(),
    onSuccess: async () => {
      toast.success("Journal vidé");
      await qc.invalidateQueries({ queryKey: ["error-events"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Suppression impossible"),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Bug className="h-4 w-4 text-primary" />
            Journal d'erreurs
          </h2>
          <p className="text-sm text-muted-foreground">
            Erreurs survenues dans le navigateur des utilisateurs, enregistrées automatiquement.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => clear.mutate()}
          disabled={clear.isPending || rows.length === 0}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Vider le journal
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-14 text-center">
          <Bug className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucune erreur enregistrée</p>
          <p className="mt-1 text-xs text-muted-foreground">
            C'est bon signe. Les prochaines erreurs apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map((row) => {
            const expanded = open === row.id;
            return (
              <div key={row.id} className="px-4 py-3">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 text-left"
                  onClick={() => setOpen(expanded ? null : row.id)}
                >
                  {expanded ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.message}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{when(row.created_at)}</span>
                      {row.path && (
                        <>
                          <span>·</span>
                          <span className="truncate">{row.path}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <Badge variant={row.level === "error" ? "destructive" : "secondary"}>
                    {row.level}
                  </Badge>
                </button>

                {expanded && (
                  <div className="mt-3 space-y-2 pl-7">
                    {row.user_agent && (
                      <p className="text-[11px] text-muted-foreground break-all">
                        {row.user_agent}
                      </p>
                    )}
                    {row.stack && (
                      <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-3 text-[11px] leading-relaxed">
                        {row.stack}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
