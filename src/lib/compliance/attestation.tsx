import "@/lib/buffer-polyfill";
import { Document, Page, Text, View, StyleSheet, Image, pdf } from "@react-pdf/renderer";
import { getBrandingLogo } from "@/lib/branding";

/**
 * Attestation PDF du score de conformité.
 *
 * Le document reprend l'instantané des réglages enregistré avec le score :
 * une attestation doit montrer AVEC QUELS PARAMÈTRES le score a été calculé,
 * sinon deux attestations ne sont pas comparables.
 */

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#111827" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { width: 64, height: 64, objectFit: "contain" },
  title: { fontSize: 20, fontWeight: 700, marginTop: 18 },
  subtitle: { fontSize: 10, color: "#6b7280", marginTop: 4 },
  scoreBox: {
    marginTop: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  score: { fontSize: 42, fontWeight: 700 },
  scoreMax: { fontSize: 14, color: "#6b7280" },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginTop: 22, marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 5 },
  cellLabel: { width: "40%" },
  cellValue: { width: "20%", textAlign: "right" },
  cellPoints: { width: "20%", textAlign: "right" },
  cellNote: { width: "20%", textAlign: "right", color: "#6b7280" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 8, color: "#9ca3af" },
});

export type AttestationInput = {
  companyName: string;
  score: number;
  periodStart: string;
  periodEnd: string;
  calculatedAt: string;
  details: any;
  verifyCode?: string | null;
};

function fr(value: number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function dateFr(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR");
}

/** Code court, stable pour un score donné : sert de référence sur le document. */
export function attestationCode(input: AttestationInput): string {
  const raw = `${input.companyName}|${input.score}|${input.periodStart}|${input.periodEnd}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).toUpperCase().padStart(8, "0").slice(0, 8);
}

function Attestation({ input }: { input: AttestationInput }) {
  const details = input.details ?? {};
  const settings = details.settings ?? {};
  const logo = getBrandingLogo();
  const criteria = [
    { key: "punctuality", label: "Ponctualité des rapports" },
    { key: "completeness", label: "Complétude des rapports" },
    { key: "incidents", label: "Incidents clôturés dans le délai" },
    { key: "regularity", label: "Régularité (jours couverts)" },
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logo ? <Image src={logo} style={styles.logo} /> : <View />}
          <Text style={{ fontSize: 9, color: "#6b7280" }}>DailyBrief</Text>
        </View>

        <Text style={styles.title}>Attestation de conformité</Text>
        <Text style={styles.subtitle}>
          {input.companyName} — période du {dateFr(input.periodStart)} au {dateFr(input.periodEnd)}
        </Text>

        <View style={styles.scoreBox}>
          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
            <Text style={styles.score}>{fr(input.score)}</Text>
            <Text style={styles.scoreMax}> / 100</Text>
          </View>
          <View>
            <Text style={{ fontSize: 9, color: "#6b7280" }}>Calculé le</Text>
            <Text>{dateFr(input.calculatedAt)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Détail par critère</Text>
        <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: "#9ca3af" }]}>
          <Text style={[styles.cellLabel, { fontWeight: 700 }]}>Critère</Text>
          <Text style={[styles.cellValue, { fontWeight: 700 }]}>Valeur</Text>
          <Text style={[styles.cellPoints, { fontWeight: 700 }]}>Points</Text>
          <Text style={[styles.cellNote, { fontWeight: 700 }]}>Base</Text>
        </View>

        {criteria.map((criterion) => {
          const detail = details[criterion.key] ?? {};
          return (
            <View key={criterion.key} style={styles.row}>
              <Text style={styles.cellLabel}>{criterion.label}</Text>
              <Text style={styles.cellValue}>{fr(Number(detail.value ?? 0))} %</Text>
              <Text style={styles.cellPoints}>
                {fr(Number(detail.points ?? 0))} / {Number(detail.weight ?? 0)}
              </Text>
              <Text style={styles.cellNote}>
                {Number(detail.numerator ?? 0)} / {Number(detail.denominator ?? 0)}
              </Text>
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Paramètres appliqués</Text>
        <Text style={{ color: "#374151" }}>
          Pondérations : ponctualité {settings.weight_punctuality ?? "—"} % · complétude{" "}
          {settings.weight_completeness ?? "—"} % · incidents {settings.weight_incidents ?? "—"} % ·
          régularité {settings.weight_regularity ?? "—"} %.
        </Text>
        <Text style={{ color: "#374151", marginTop: 3 }}>
          Heure limite {settings.report_due_hour ?? "—"} h · délai incidents{" "}
          {settings.incident_sla_days ?? "—"} jours · tolérance {settings.grace_days ?? "—"} jour(s) ·
          seuil de fiabilité {settings.min_sample ?? "—"}.
        </Text>

        <Text style={styles.sectionTitle}>Portée du document</Text>
        <Text style={{ color: "#374151", lineHeight: 1.4 }}>
          Ce score est calculé automatiquement à partir des rapports, des actions et des objectifs
          enregistrés dans l'application. Il ne repose sur aucune saisie manuelle. Les actions
          terminées sans date de clôture sont écartées du calcul : {Number(details.excluded_actions ?? 0)} cas
          sur cette période. Les actions annulées sont exclues :{" "}
          {Number(details.excluded_cancelled ?? 0)} cas.
        </Text>

        <Text style={{ marginTop: 18, fontSize: 9, color: "#374151" }}>
          Référence du document : {input.verifyCode || attestationCode(input)}
        </Text>
        <Text style={{ marginTop: 4, fontSize: 9, color: "#374151" }}>
          Vérification : {typeof window !== "undefined" ? window.location.origin : ""}/verifier/{input.verifyCode || attestationCode(input)}
        </Text>

        <Text style={styles.footer}>
          Généré par DailyBrief — {dateFr(input.calculatedAt)} · document non signé, à vérifier auprès
          de l'entreprise émettrice.
        </Text>
      </Page>
    </Document>
  );
}

/** Génère et télécharge l'attestation. */
export async function downloadComplianceAttestation(input: AttestationInput): Promise<void> {
  const blob = await pdf(<Attestation input={input} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attestation-conformite-${input.periodEnd}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
