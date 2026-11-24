import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, SlidersHorizontal } from "lucide-react";
import {
  getComplianceSettings,
  updateComplianceSettings,
} from "@/lib/compliance/compliance.functions";

type Form = {
  weight_punctuality: number;
  weight_completeness: number;
  weight_incidents: number;
  weight_regularity: number;
  report_due_hour: number;
  incident_sla_days: number;
  grace_days: number;
  min_sample: number;
};

const DEFAULTS: Form = {
  weight_punctuality: 40,
  weight_completeness: 30,
  weight_incidents: 20,
  weight_regularity: 10,
  report_due_hour: 18,
  incident_sla_days: 3,
  grace_days: 1,
  min_sample: 10,
};

/** Éditeur des pondérations — réservé aux gestionnaires (contrôlé côté serveur). */
export function ComplianceSettingsCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getComplianceSettings);
  const setFn = useServerFn(updateComplianceSettings);
  const [form, setForm] = useState<Form>(DEFAULTS);

  const { data } = useQuery({
    queryKey: ["compliance-settings"],
    queryFn: () => getFn(),
  });

  useEffect(() => {
    const settings = (data as any)?.settings;
    if (!settings) return;
    setForm({
      weight_punctuality: settings.weight_punctuality ?? 40,
      weight_completeness: settings.weight_completeness ?? 30,
      weight_incidents: settings.weight_incidents ?? 20,
      weight_regularity: settings.weight_regularity ?? 10,
      report_due_hour: settings.report_due_hour ?? 18,
      incident_sla_days: settings.incident_sla_days ?? 3,
      grace_days: settings.grace_days ?? 1,
      min_sample: settings.min_sample ?? 10,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => setFn({ data: form }),
    onSuccess: async () => {
      toast.success("Pondérations enregistrées");
      await qc.invalidateQueries({ queryKey: ["compliance-settings"] });
      await qc.invalidateQueries({ queryKey: ["compliance-score"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Enregistrement impossible"),
  });

  if (!(data as any)?.isManager) return null;

  const total =
    form.weight_punctuality +
    form.weight_completeness +
    form.weight_incidents +
    form.weight_regularity;

  const fields: { key: keyof Form; label: string; min: number; max: number }[] = [
    { key: "weight_punctuality", label: "Ponctualité (%)", min: 0, max: 100 },
    { key: "weight_completeness", label: "Complétude (%)", min: 0, max: 100 },
    { key: "weight_incidents", label: "Incidents (%)", min: 0, max: 100 },
    { key: "weight_regularity", label: "Régularité (%)", min: 0, max: 100 },
    { key: "report_due_hour", label: "Heure limite (0-23)", min: 0, max: 23 },
    { key: "incident_sla_days", label: "Délai incidents (jours)", min: 1, max: 90 },
    { key: "grace_days", label: "Tolérance (jours)", min: 0, max: 15 },
    { key: "min_sample", label: "Seuil de fiabilité", min: 5, max: 1000 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          Pondérations
        </CardTitle>
        <CardDescription>
          La somme doit valoir 100. Les quatre poids sont enregistrés en une seule fois ;
          un score déjà calculé conserve les paramètres utilisés à l'époque.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <label key={field.key} className="space-y-1 text-sm">
              <span className="text-muted-foreground">{field.label}</span>
              <Input
                type="number"
                min={field.min}
                max={field.max}
                value={form[field.key]}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    [field.key]: Number(event.target.value || 0),
                  }))
                }
              />
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`text-sm ${total === 100 ? "text-muted-foreground" : "text-destructive"}`}>
            Total : <strong>{total}</strong> / 100
            {total !== 100 && " — la sauvegarde sera refusée"}
          </p>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || total !== 100}
          >
            {save.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
