/**
 * Coordonnées affichées au client quand un plan est en attente de paiement.
 * ⚠️ À personnaliser avec tes vrais numéros avant de vendre.
 */
export const PAYMENT_INFO = {
  holder: "DailyBrief",
  phone: "+225 00 00 00 00 00",
  providers: ["Orange Money", "MTN MoMo", "Wave"],
  note: "Après le transfert, envoyez la capture de la transaction par WhatsApp. Votre accès est activé sous 24 heures ouvrées.",
} as const;
