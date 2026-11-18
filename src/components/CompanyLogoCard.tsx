import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Loader2, Trash2, Upload } from "lucide-react";
import { getMyCompanyBranding, setCompanyLogo } from "@/lib/branding.functions";
import { supabase } from "@/integrations/supabase/client";

/**
 * Identité visuelle de l'entreprise : le logo qui apparaît sur tous les
 * documents. Réservé au propriétaire — un membre ne change pas l'identité
 * de la société.
 */
export function CompanyLogoCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyCompanyBranding);
  const setFn = useServerFn(setCompanyLogo);
  const [busy, setBusy] = useState(false);

  const { data: branding } = useQuery({
    queryKey: ["company-branding"],
    queryFn: () => getFn(),
  });

  const save = useMutation({
    mutationFn: (logoUrl: string | null) => setFn({ data: { logoUrl } }),
    onSuccess: async () => {
      toast.success("Logo mis à jour");
      await qc.invalidateQueries({ queryKey: ["company-branding"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Enregistrement impossible"),
  });

  async function upload(file: File) {
    if (!branding?.companyId) return;
    if (file.size > 500 * 1024) {
      toast.error("Le logo doit faire moins de 500 Ko.");
      return;
    }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error("Formats acceptés : PNG, JPG ou WebP.");
      return;
    }

    setBusy(true);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${branding.companyId}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("company-assets")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw new Error(error.message);

      const { data: publicUrl } = supabase.storage.from("company-assets").getPublicUrl(path);
      save.mutate(publicUrl.publicUrl);
    } catch (e: any) {
      toast.error(e?.message ?? "Téléversement impossible");
    } finally {
      setBusy(false);
    }
  }

  if (!branding?.companyId || !branding.isOwner) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Logo de l'entreprise
        </CardTitle>
        <CardDescription>
          Ce logo apparaît sur tous les documents (rapports, plannings, factures, PDF partagés).
          Ton avatar personnel reste privé et n'apparaît jamais dans un document.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="Logo" className="h-full w-full object-contain" />
          ) : (
            <Building2 className="h-6 w-6 text-muted-foreground" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline" disabled={busy || save.isPending}>
            <label className="cursor-pointer">
              {busy || save.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {branding.logoUrl ? "Changer le logo" : "Ajouter un logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
              />
            </label>
          </Button>

          {branding.logoUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => save.mutate(null)}
              disabled={busy || save.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Retirer
            </Button>
          )}
        </div>

        <p className="w-full text-[11px] text-muted-foreground">
          PNG, JPG ou WebP — 500 Ko maximum. Un logo carré rend mieux dans le menu.
        </p>
      </CardContent>
    </Card>
  );
}
