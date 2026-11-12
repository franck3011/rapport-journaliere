import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { emergencyResetMyMfa } from "@/lib/platform.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, ShieldCheck, KeyRound, AlertCircle } from "lucide-react";

const searchSchema = z.object({
  mfa_reset: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Récupération de compte — DailyBrief" },
      { name: "description", content: "Réinitialisez votre mot de passe et regagnez l'accès à votre compte." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { mfa_reset } = useSearch({ from: "/reset-password" });
  const resetMfaFn = useServerFn(emergencyResetMyMfa);
  const wantsMfaReset = mfa_reset === "1";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  // Étape 2 : la 2FA n'est plus retirée automatiquement, elle exige une confirmation explicite.
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaEmail, setMfaEmail] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    let gotRecovery = false;

    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        gotRecovery = true;
        if (mounted) setReady("ok");
      }
    });

    // Fallback : si l'utilisateur a déjà une session (par ex. il a cliqué juste avant),
    // on considère la page utilisable. Sinon on marque invalid après un délai.
    const t = setTimeout(async () => {
      if (!mounted || gotRecovery) return;
      const { data } = await supabase.auth.getSession();
      if (mounted) setReady(data.session ? "ok" : "invalid");
    }, 800);

    return () => {
      mounted = false;
      clearTimeout(t);
      sub.data.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Utilisez au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      toast.error("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Si l'utilisateur a demandé un reset 2FA, on lui demande une confirmation
      // explicite (e-mail du compte) avant de retirer les facteurs.
      if (wantsMfaReset) {
        setMfaStep(true);
        toast.success(
          "Mot de passe mis à jour. Confirmez votre adresse e-mail ci-dessous pour retirer la 2FA.",
        );
        return;
      }

      toast.success("Mot de passe mis à jour.");

      // Redirection selon type de compte
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("admin_only")
          .eq("id", uid)
          .maybeSingle();
        if ((prof as any)?.admin_only) {
          navigate({ to: "/admin", replace: true });
          return;
        }
      }
      navigate({ to: "/reports", replace: true });
    } catch (err: any) {
      const raw = String(err?.message ?? "");
      let msg = raw || "Impossible de mettre à jour";
      if (/weak|pwned|known to be|leaked/i.test(raw)) {
        msg = "Ce mot de passe apparaît dans une fuite connue. Choisissez-en un unique.";
      } else if (/at least|should be|minimum|characters/i.test(raw)) {
        msg = "Mot de passe trop court. Utilisez au moins 8 caractères.";
      } else if (/same as/i.test(raw)) {
        msg = "Le nouveau mot de passe doit être différent de l'ancien.";
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaReset(e: React.FormEvent) {
    e.preventDefault();
    setMfaBusy(true);
    try {
      const res = await resetMfaFn({ data: { confirmEmail: mfaEmail } });
      toast.success(
        res.factorsRemoved > 0
          ? `${res.factorsRemoved} facteur(s) 2FA retiré(s). Ré-enrôlez un authentificateur à la prochaine connexion.`
          : "Aucun facteur 2FA à retirer.",
      );
      navigate({ to: "/auth", replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Réinitialisation de la 2FA impossible.");
    } finally {
      setMfaBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-b from-background to-muted px-4 py-8">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6 text-primary">
          <ShieldCheck className="h-6 w-6" />
          <span className="text-xl font-semibold text-foreground">Récupération de compte</span>
        </Link>

        <Card className="shadow-sm border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {wantsMfaReset ? (
                <>
                  <KeyRound className="h-5 w-5 text-primary" />
                  Réinitialiser mot de passe + 2FA
                </>
              ) : (
                <>
                  <KeyRound className="h-5 w-5 text-primary" />
                  Nouveau mot de passe
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ready === "checking" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="h-4 w-4 animate-spin" /> Vérification du lien de récupération…
              </div>
            )}

            {ready === "invalid" && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Lien invalide ou expiré</AlertTitle>
                <AlertDescription>
                  Ouvrez cette page uniquement depuis un email de récupération reçu à votre adresse.
                  Les liens expirent après 1 heure.
                  <div className="mt-3">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/auth">Demander un nouveau lien</Link>
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {ready === "ok" && !mfaStep && (
              <>
                {wantsMfaReset && (
                  <Alert>
                    <ShieldCheck className="h-4 w-4" />
                    <AlertTitle>Réinitialisation d'urgence 2FA</AlertTitle>
                    <AlertDescription>
                      Votre mot de passe sera changé immédiatement. Le retrait des facteurs 2FA
                      demandera une <strong>confirmation séparée</strong> (saisie de l'adresse
                      e-mail du compte) à l'étape suivante.
                    </AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Nouveau mot de passe</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        minLength={8}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Masquer" : "Afficher"}
                        tabIndex={-1}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      8 caractères minimum. Les mots de passe déjà exposés dans des fuites sont refusés.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                    <Input
                      id="confirm"
                      type={showPassword ? "text" : "password"}
                      minLength={8}
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Mettre à jour le mot de passe
                  </Button>
                </form>
              </>
            )}

            {ready === "ok" && mfaStep && (
              <form onSubmit={handleMfaReset} className="space-y-4">
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle>Confirmer le retrait de la 2FA</AlertTitle>
                  <AlertDescription>
                    Mot de passe mis à jour. Pour retirer vos facteurs 2FA, saisissez l'adresse
                    e-mail du compte : elle doit correspondre exactement.
                  </AlertDescription>
                </Alert>
                <div className="space-y-1.5">
                  <Label htmlFor="mfa-email">Adresse e-mail du compte</Label>
                  <Input
                    id="mfa-email"
                    type="email"
                    required
                    value={mfaEmail}
                    onChange={(e) => setMfaEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="vous@exemple.com"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={mfaBusy}>
                  {mfaBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Retirer mes facteurs 2FA
                </Button>
                <p className="text-xs text-muted-foreground">
                  Réservé aux super admins de la plateforme. La connexion doit dater de moins de
                  15 minutes.
                </p>
              </form>
            )}

            <div className="text-center text-sm">
              <Link to="/auth" className="text-muted-foreground hover:text-primary">
                Retour à la connexion
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
