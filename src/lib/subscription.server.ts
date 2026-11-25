/**
 * Contrôle d'abonnement côté serveur.
 *
 * Règle retenue : on ne coupe JAMAIS la lecture. Un client dont l'essai est
 * terminé conserve l'accès à ses rapports, ses exports et ses données — il ne
 * peut simplement plus en créer de nouveaux. C'est la pratique standard : le
 * client voit ce qu'il perd, ce qui déclenche le paiement sans le braquer.
 *
 * Dérogations :
 *  - un administrateur de la plateforme n'est jamais bloqué (le fondateur doit
 *    pouvoir travailler sur son propre produit) ;
 *  - une entreprise dotée d'un plan actif n'est jamais bloquée.
 *
 * Aucune migration : l'essai se calcule depuis `companies.created_at`, et
 * l'abonnement se lit sur `plan_id`.
 */

export const TRIAL_DAYS = 14;

export class SubscriptionExpiredError extends Error {
  constructor() {
    super(
      "Votre essai est terminé. Choisissez une formule pour créer de nouveaux documents — vos données restent accessibles.",
    );
    this.name = "SubscriptionExpiredError";
  }
}

type GuardContext = {
  /** client lié à la session de l'utilisateur */
  supabase: any;
  userId: string;
};

/**
 * Lève une erreur si l'utilisateur n'a plus le droit d'écrire.
 * À appeler au début de chaque fonction serveur qui crée ou modifie un document.
 */
export async function assertCanWrite(context: GuardContext): Promise<void> {
  const { supabase, userId } = context;

  // Administrateur de la plateforme : jamais bloqué.
  const { data: admin } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (admin) return;

  const { data: member } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();

  // Sans entreprise, il n'y a rien à facturer : la création d'entreprise reste libre.
  if (!member?.company_id) return;

  const { data: company } = await supabase
    .from("companies")
    .select("plan_id, created_at, subscription_status")
    .eq("id", member.company_id)
    .maybeSingle();

  if (!company) return;

  if (company.plan_id) return;
  if (company.subscription_status === "active") return;

  const created = company.created_at ? new Date(company.created_at).getTime() : Date.now();
  const days = Math.floor((Date.now() - created) / 86400000);
  if (days < TRIAL_DAYS) return;

  throw new SubscriptionExpiredError();
}

/** Variante non bloquante, pour les écrans qui veulent seulement afficher l'état. */
export async function canWrite(context: GuardContext): Promise<boolean> {
  try {
    await assertCanWrite(context);
    return true;
  } catch {
    return false;
  }
}
