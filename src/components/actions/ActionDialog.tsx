import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {
  createAction,
  listActionMembers,
  updateAction,
  type ActionPriority,
  type ActionRow,
} from "@/lib/actions/actions.functions";

function inSevenDays(): string {
  return new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action?: ActionRow | null;
  reportId?: string | null;
  defaultOwnerId?: string;
};

export function ActionDialog({ open, onOpenChange, action, reportId, defaultOwnerId }: Props) {
  const qc = useQueryClient();
  const membersFn = useServerFn(listActionMembers);
  const createFn = useServerFn(createAction);
  const updateFn = useServerFn(updateAction);

  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState(inSevenDays());
  const [priority, setPriority] = useState<ActionPriority>("normal");
  const [saving, setSaving] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["action-members"],
    queryFn: () => membersFn(),
    staleTime: 60_000,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (action) {
      setTitle(action.title);
      setDetails(action.details);
      setOwnerId(action.owner_id);
      setDueDate(action.due_date ?? "");
      setPriority(action.priority);
    } else {
      setTitle("");
      setDetails("");
      setOwnerId(defaultOwnerId ?? "");
      setDueDate(inSevenDays());
      setPriority("normal");
    }
  }, [open, action, defaultOwnerId]);

  useEffect(() => {
    if (!open || action || ownerId) return;
    if (members.length === 1) setOwnerId(members[0].id);
  }, [open, action, members, ownerId]);

  async function handleSave() {
    if (title.trim().length < 3) {
      toast.error("Donnez un titre à l'action (3 caractères minimum).");
      return;
    }
    if (!ownerId) {
      toast.error("Choisissez un responsable.");
      return;
    }
    setSaving(true);
    try {
      if (action) {
        await updateFn({
          data: {
            id: action.id,
            title: title.trim(),
            details,
            ownerId,
            dueDate: dueDate || null,
            priority,
          },
        });
        toast.success("Action mise à jour");
      } else {
        await createFn({
          data: {
            reportId: reportId ?? null,
            title: title.trim(),
            details,
            ownerId,
            dueDate: dueDate || null,
            priority,
          },
        });
        toast.success("Action créée");
      }
      await qc.invalidateQueries({ queryKey: ["actions"] });
      await qc.invalidateQueries({ queryKey: ["report-actions"] });
      await qc.invalidateQueries({ queryKey: ["actions-summary"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{action ? "Modifier l'action" : "Nouvelle action"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="action-title">Action</Label>
            <Input
              id="action-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Relancer le fournisseur pour la livraison"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="action-details">Détails (facultatif)</Label>
            <Textarea
              id="action-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Contexte, critère de réussite…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="action-due">Échéance</Label>
              <Input
                id="action-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Priorité</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as ActionPriority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normale</SelectItem>
                <SelectItem value="high">Importante</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {action ? "Enregistrer" : "Créer l'action"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
