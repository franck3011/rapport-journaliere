/**
 * Catalogue des fonctionnalités facturables.
 *
 * Un plan stocke ses fonctionnalités dans `subscription_plans.features` sous
 * forme de codes (et non de texte libre) : c'est ce qui permet de les VÉRIFIER
 * et pas seulement de les afficher.
 *
 * `enforced: false` = argument commercial (support, accompagnement) qui ne se
 * contrôle pas dans le code. Tout le reste est appliqué côté serveur.
 */
export type FeatureCode =
  | "rapports"
  | "actions"
  | "objectifs"
  | "conformite"
  | "messagerie"
  | "export_excel"
  | "roles_audit"
  | "support_prioritaire";

export type FeatureDefinition = {
  code: FeatureCode;
  label: string;
  /** true si l'accès est réellement bloqué hors plan */
  enforced: boolean;
  /** module du registre associé, le cas échéant */
  module?: string;
};

export const FEATURES: FeatureDefinition[] = [
  { code: "rapports", label: "Rapports journaliers illimités", enforced: true },
  { code: "actions", label: "Actions et suivi des décisions", enforced: true, module: "actions" },
  { code: "objectifs", label: "Objectifs et indicateurs", enforced: true, module: "objectives" },
  { code: "conformite", label: "Score de conformité", enforced: true, module: "compliance" },
  { code: "messagerie", label: "Messagerie unifiée", enforced: true, module: "mail" },
  { code: "export_excel", label: "Export Excel / CSV", enforced: true },
  { code: "roles_audit", label: "Rôles et journal d'audit", enforced: true },
  { code: "support_prioritaire", label: "Support WhatsApp prioritaire", enforced: false },
];

export const FEATURE_CODES = FEATURES.map((f) => f.code);

export function featureLabel(code: string): string {
  return FEATURES.find((f) => f.code === code)?.label ?? code;
}

/** Fonctionnalité requise par un module du registre, s'il y en a une. */
export function featureForModule(moduleCode: string): FeatureCode | undefined {
  return FEATURES.find((f) => f.module === moduleCode)?.code;
}
