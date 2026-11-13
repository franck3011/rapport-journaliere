import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ListChecks, Plus } from "lucide-react";
import {
  listReportActions,
  updateAction,
  type ActionRow,
} from "@/lib/actions/actions.functions";
import { ActionDialog } from "@/components/actions/ActionDialog";

const PRIORITY_TONES: Record<string, string> = {
  normal: "bg-muted text-muted-foreground",
  high: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  urgent: "bg-destructive/10 text-destructive",
};

const PRIORITY_LABELS: Record<string, string> = {
  normal: "Normale",
  high: "Importante",
  urgent: "Urgente",
};

export function ReportActionsCard({
  reportId,
  canEdit,
}: {
  reportId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const listFn = useServerFn(listReportActions);
  const updateFn = useServerFn(updateAction);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-actions", reportId],
    queryFn: () => listFn({ data: { reportId } }),
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: "todo" | "doing" | "done" }) =>
      updateFn({ data: { id: v.id, status: v.status } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["report-actions", reportId] });
      await qc.invalidateQueries({ queryKey: ["actions"] });
      await qc.invalidateQueries({ queryKey: ["actions-summary"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Modification impossible"),
  });

  function toggle(row: ActionRow, checked: boolean) {
    statusMut.mutate({ id: row.id, status: checked ? "done" : "todo" });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            Actions décidées
            {rows.length > 0 && <Badge variant="secondary">{rows.length}</Badge>}
          </CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Ajouter
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune action pour ce rapport. Ajoutez ce qui doit être fait à la suite de ce rapport.
          </p>
        ) : (
          rows.map((row) => {
            const done = row.status === "done";
            return (
              <div key={row.id} className="flex items-start gap-2 rounded-md border p-2">
                <Checkbox
                  className="mt-0.5"
                  checked={done}
                  disabled={!canEdit || statusMut.isPending}
                  onCheckedChange={(v) => toggle(row, v === true)}
                />
                <div className="min-w-0 flex-1">
                  <div className={"text-sm font-medium " + (done ? "line-through text-muted-foreground" : "")}>
                    {row.title}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
                    <span>{row.owner_name}</span>
                    {row.due_date && (
                      <>
                        <span>·</span>
                        <span className={row.is_late ? "text-destructive font-medium" : undefined}>
                          {row.due_date}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Badge className={PRIORITY_TONES[row.priority]}>
                  {PRIORITY_LABELS[row.priority]}
                </Badge>
              </div>
            );
          })
        )}
      </CardContent>

      <ActionDialog open={open} onOpenChange={setOpen} reportId={reportId} />
    </Card>
  );
}
