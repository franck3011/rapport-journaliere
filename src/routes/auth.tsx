import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  createCompany,
  joinCompanyDirect,
} from "@/lib/company.functions";
import { checkNameReservedPublic } from "@/lib/reserved-names.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, FileText, Building2, User, Users, Check, ShieldAlert, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { oauthReturnPath } from "@/lib/oauth-return-path";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Connexion — Lovable Rapports" },
      { name: "description", content: "Connectez-vous à votre espace rapports d'équipe." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});


type AccountKind = "particulier" | "employee" | "dg";

const ACCOUNT_KINDS: {
  id: AccountKind;
  title: string;
  desc: string;
  icon: typeof User;
  accent: string;
}[] = [
  {
    id: "particulier",
    title: "Particulier",
    desc: "Rapports personnels, usage individuel.",
    icon: User,
    accent: "from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400",
  },
  {
    id: "employee",
    title: "Employé",
    desc: "Rejoindre une entreprise déjà existante.",
    icon: Users,
    accent: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "dg",
    title: "DG / Entreprise",
    desc: "Créer un espace équipe et inviter vos collaborateurs.",
    icon: Building2,
    accent: "from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400",
  },
];

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const nextPath = redirect ? oauthReturnPath(redirect) : "/reports";
  const createCompanyFn = useServerFn(createCompany);
  const joinCompanyFn = useServerFn(joinCompanyDirect);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [accountKind, setAccountKind] = useState<AccountKind>("particulier");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);


  const checkReservedFn = useServerFn(checkNameReservedPublic);
  const [reservedInfo, setReservedInfo] = useState<{ reserved: boolean; displayName: string | null }>(
    { reserved: false, displayName: null },
  );

  useEffect(() => {
    if (accountKind !== "dg" || !companyName.trim()) {
      setReservedInfo({ reserved: false, displayName: null });
      return;
    }
    const name = companyName.trim();
    const t = setTimeout(() => {
      checkReservedFn({ data: { name } })
        .then((r) => setReservedInfo(r))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [companyName, accountKind, checkReservedFn]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ href: nextPath, replace: true });
    });
  }, [navigate, nextPath]);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        if (accountKind === "dg" && !companyName.trim()) {
          throw new Error("Nom de l'entreprise requis");
        }
        if (accountKind === "dg" && reservedInfo.reserved) {
          throw new Error(
            `« ${reservedInfo.displayName} » est un nom protégé. Créez votre compte, puis soumettez une demande de vérification depuis « Mon entreprise ».`,
          );
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: new URL(nextPath, window.location.origin).href,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (data.session) {
          if (accountKind === "dg") {
            try {
              await createCompanyFn({ data: { name: companyName.trim() } });
              toast.success(`Bienvenue chez ${companyName.trim()}`);
            } catch (err: any) {
              toast.error(err?.message ?? "Compte créé mais entreprise non créée");
            }
            navigate({ to: "/company", replace: true });
            return;
          }
          if (accountKind === "employee") {
            try {
              const res = await joinCompanyFn({ data: {} });
              toast.success(`Compte relié à ${res.companyName}`);
            } catch (err: any) {
              toast.error(err?.message ?? "Compte créé mais rattachement échoué");
            }
            navigate({ to: "/company", replace: true });
            return;
          }
          toast.success("Compte créé, vous êtes connecté.");
          navigate({ href: nextPath, replace: true });
        } else {
          toast.success("Compte créé. Vous pouvez vous connecter.");
          setMode("signin");
        }
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Connecté");
        navigate({ href: nextPath, replace: true });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Email de réinitialisation envoyé.");
        setMode("signin");
      }
    } catch (err: any) {
      const raw = String(err?.message ?? "");
      let msg = raw || "Une erreur est survenue";
      if (/weak|pwned|known to be|leaked/i.test(raw)) {
        msg = "Ce mot de passe apparaît dans une fuite connue. Choisissez-en un unique (essayez une phrase de passe ou un mot de passe généré).";
      } else if (/at least|should be|minimum|characters/i.test(raw)) {
        msg = "Mot de passe trop court. Utilisez au moins 8 caractères.";
      } else if (/invalid login|invalid credentials/i.test(raw)) {
        msg = "Email ou mot de passe incorrect.";
      } else if (/already registered|already exists/i.test(raw)) {
        msg = "Un compte existe déjà avec cet email.";
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-b from-background to-muted px-4 py-8">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6 text-primary">
          <FileText className="h-6 w-6" />
          <span className="text-xl font-semibold text-foreground">Lovable Rapports</span>
        </Link>
        <Card className="shadow-sm border-border/80">
          <CardHeader>
            <CardTitle className="text-center text-xl">
              {mode === "signin" && "Connexion"}
              {mode === "signup" && "Créer un compte"}
              {mode === "forgot" && "Mot de passe oublié"}
            </CardTitle>
            {mode === "signin" && (
              <p className="text-center text-xs text-muted-foreground pt-1">
                Déjà un compte ? Entrez votre email et mot de passe, ou utilisez Google.
                <br />
                Nouveau ? Cliquez sur « Créer un compte » en bas.
              </p>
            )}
            {mode === "forgot" && (
              <p className="text-center text-xs text-muted-foreground pt-1">
                Entrez l'email de votre compte. Vous recevrez un lien de récupération valable
                1 heure pour définir un nouveau mot de passe.
                <br />
                <span className="text-muted-foreground/80">
                  Admin ayant perdu son authentificateur 2FA : connectez-vous d'abord, puis
                  utilisez « Je n'ai plus mon authentificateur » sur l'écran 2FA.
                </span>
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {mode !== "forgot" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      const { data, error } = await supabase.auth.signInWithOAuth({
                        provider: "google",
                        options: {
                          redirectTo: new URL(nextPath, window.location.origin).href,
                        }
                      });
                      if (error) {
                        toast.error(error.message ?? "Connexion Google impossible");
                        return;
                      }
                      // For OAuth, Supabase redirects the browser automatically.
                      // We don't need to navigate manually here.
                    } catch (e: any) {
                      toast.error(e?.message ?? "Connexion Google impossible");
                    }
                  }}
                >
                  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4-5.5 4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.9 1.5l2.6-2.5C16.9 3.4 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.5-4.8 9.5-9.2 0-.6-.1-1.1-.2-1.6L12 10.2z"/>
                  </svg>
                  Continuer avec Google
                </Button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">ou</span>
                  </div>
                </div>
              </>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <>
                  <div className="space-y-2">
                    <Label>Type de compte</Label>
                    <div className="space-y-2">
                      {ACCOUNT_KINDS.map((k) => {
                        const Icon = k.icon;
                        const selected = accountKind === k.id;
                        return (
                          <button
                            key={k.id}
                            type="button"
                            onClick={() => setAccountKind(k.id)}
                            className={cn(
                              "group relative w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                              selected
                                ? "border-primary bg-primary/[0.04] shadow-sm"
                                : "border-border hover:border-primary/40 hover:bg-muted/40",
                            )}
                          >
                            <div
                              className={cn(
                                "h-11 w-11 shrink-0 rounded-lg grid place-items-center bg-gradient-to-br",
                                k.accent,
                              )}
                            >
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">{k.title}</div>
                              <div className="text-xs text-muted-foreground line-clamp-1">
                                {k.desc}
                              </div>
                            </div>
                            <div
                              className={cn(
                                "h-5 w-5 shrink-0 rounded-full border grid place-items-center transition-all",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border",
                              )}
                            >
                              {selected && <Check className="h-3 w-3" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Nom complet</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>

                  {accountKind === "dg" && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                      <Label htmlFor="companyName">Nom de l'entreprise</Label>
                      <Input
                        id="companyName"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Ma société"
                        required
                      />
                      {reservedInfo.reserved ? (
                        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1.5">
                          <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            « {reservedInfo.displayName} » est un nom protégé
                          </div>
                          <p className="text-amber-800/80 dark:text-amber-200/80">
                            Pour éviter l'usurpation d'identité, seul un représentant vérifié peut créer cet espace.
                            Créez d'abord votre compte, puis soumettez un justificatif depuis « Mon entreprise ».
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Vous pourrez inviter vos employés juste après.
                        </p>
                      )}
                    </div>
                  )}


                  {accountKind === "employee" && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                      <p className="text-xs text-muted-foreground">
                        Inscrivez-vous avec l'adresse e-mail sur laquelle votre entreprise vous a invité : votre compte sera rattaché automatiquement.
                      </p>
                    </div>
                  )}
                </>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Mot de passe</Label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="text-xs text-primary hover:underline"
                      >
                        Oublié ?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      required
                      minLength={mode === "signup" ? 8 : 6}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      aria-pressed={showPassword}
                      tabIndex={-1}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {mode === "signup" && (
                    <p className="text-xs text-muted-foreground">
                      Utilisez un mot de passe unique d'au moins 8 caractères. Les mots de passe déjà exposés dans des fuites sont refusés.
                    </p>
                  )}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {mode === "signin" && "Se connecter"}
                {mode === "signup" && "Créer le compte"}
                {mode === "forgot" && "Envoyer le lien"}
              </Button>
            </form>
            <div className="text-center text-sm text-muted-foreground space-y-2">
              {mode === "signin" ? (
                <>
                  <div>
                    Pas encore de compte ?{" "}
                    <button
                      onClick={() => setMode("signup")}
                      className="text-primary hover:underline font-medium"
                    >
                      Créer un compte
                    </button>
                  </div>
                  <div>
                    <button
                      onClick={() => setMode("forgot")}
                      className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2"
                    >
                      J'ai perdu l'accès à mon compte
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setMode("signin")}
                  className="text-primary hover:underline"
                >
                  Retour à la connexion
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
