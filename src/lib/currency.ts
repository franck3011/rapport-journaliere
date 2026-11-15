/**
 * Formatage monétaire de l'application.
 * Les prix sont stockés en « centimes » (prix × 100) dans la base ; le FCFA
 * n'ayant pas de sous-unité, on n'affiche jamais de décimales.
 */
export const CURRENCY = "FCFA";

export function formatPrice(cents: number): string {
  const amount = Math.round((cents ?? 0) / 100);
  return `${amount.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} ${CURRENCY}`;
}
