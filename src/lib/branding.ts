/**
 * Cache client du logo d'entreprise.
 *
 * Les documents (PDF) doivent porter le logo de l'entreprise, jamais le logo
 * DailyBrief ni l'avatar d'une personne. On le mémorise dès qu'il est connu
 * pour que les générateurs de PDF puissent le lire sans requête supplémentaire.
 */
let companyLogo: string | null = null;

export function setBrandingLogo(url: string | null): void {
  companyLogo = url;
}

export function getBrandingLogo(): string | null {
  return companyLogo;
}
