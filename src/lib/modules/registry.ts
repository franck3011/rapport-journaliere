import {
  FileText,
  FilePlus2,
  Users,
  BarChart3,
  FileSignature,
  Building2,
  Network,
  ShieldCheck,
  Package,
  UserCircle2,
  ListChecks,
  LayoutGrid,
  Mail,
  Inbox,
  Settings2,
  type LucideIcon,
  CalendarClock,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  FolderOpen,
  Receipt,
  Gauge,
  Boxes,
  Briefcase,
  Bot,
  Target,
} from "lucide-react";
import { featureForModule } from "@/lib/plans/features";

export type ModuleScreen = {
  to: string;
  label: string;
  icon: LucideIcon;
};

export type AppModule = {
  code: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** classes de couleur pour la tuile du lanceur (tokens sémantiques) */
  tone: string;
  entry: string;
  /** un module "core" ne peut pas être désactivé */
  core: boolean;
  /** masqué du lanceur /apps (page système accessible ailleurs) */
  hiddenFromLauncher?: boolean;
  /** Module retiré de la navigation (pages et données conservées). */
  retired?: boolean;
  /** Affiché en raccourci permanent dans le menu latéral. */
  pinned?: boolean;
  screens: ModuleScreen[];
};

export const APP_MODULES: AppModule[] = [
  {
    code: "ai-center",
    retired: true,
    name: "Centre IA",
    description: "Équipe d'agents IA pilotée par un Orchestrateur pour produire des rapports contrôlés.",
    icon: Bot,
    tone: "bg-primary/10 text-primary",
    entry: "/ai-center",
    core: false,
    screens: [{ to: "/ai-center", label: "Centre IA", icon: Bot }],
  },
  {
    code: "dashboard",
    name: "Tableau de bord",
    description:
      "Vue consolidée : rapports, tâches, congés, dépenses et documents sur un écran.",
    icon: Gauge,
    tone: "bg-primary/10 text-primary",
    entry: "/dashboard",
    core: true,
    screens: [{ to: "/dashboard", label: "Tableau de bord", icon: Gauge }],
  },
  {
    code: "actions",
    name: "Actions",
    pinned: true,
    description:
      "Suivi des décisions issues des rapports : qui fait quoi, pour quand, où en est-on.",
    icon: ListChecks,
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    entry: "/actions",
    core: false,
    screens: [{ to: "/actions", label: "Actions", icon: ListChecks }],
  },
  {
    code: "objectives",
    name: "Objectifs",
    pinned: true,
    description:
      "Réalisé vs cible par personne ou pour l'entreprise : rapports, chiffre d'affaires, incidents.",
    icon: Target,
    tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    entry: "/objectives",
    core: false,
    screens: [{ to: "/objectives", label: "Objectifs", icon: Target }],
  },
  {
    code: "compliance",
    name: "Conformité",
    description:
      "Score de 0 à 100 calculé sur les données réelles : ponctualité, complétude, incidents, régularité.",
    icon: Gauge,
    tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    entry: "/compliance",
    core: false,
    screens: [{ to: "/compliance", label: "Conformité", icon: Gauge }],
  },
  {
    code: "inventory",
    name: "Inventaire",
    description:
      "Le matériel de l'entreprise, rangé par département : état, quantité, numéro de série.",
    icon: Boxes,
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    entry: "/inventory",
    core: false,
    screens: [{ to: "/inventory", label: "Inventaire", icon: Boxes }],
  },
  {
    code: "agenda",
    name: "Agenda",
    description:
      "Rapports à produire, e-mails à envoyer, réunions et échéances réelles de l'entreprise.",
    icon: CalendarDays,
    tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    entry: "/agenda",
    core: false,
    screens: [{ to: "/agenda", label: "Agenda", icon: CalendarDays }],
  },
  {
    code: "planning",
    name: "Planning",
    pinned: true,
    description:
      "Les travaux à venir, jour par jour : ce qui est prévu cette semaine, ce mois, sur chaque chantier.",
    icon: CalendarDays,
    tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    entry: "/planning",
    core: false,
    screens: [{ to: "/planning", label: "Planning", icon: CalendarDays }],
  },
  {
    code: "projects",
    name: "Projets",
    description:
      "Montage et pilotage de projets : jalons, équipe, budget, documents, Tableau & Kanban.",
    icon: Briefcase,
    tone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    entry: "/projects",
    core: false,
    screens: [
      { to: "/projects", label: "Portefeuille", icon: Briefcase },
      { to: "/projects/new", label: "Nouveau projet", icon: FilePlus2 },
    ],
  },
  {
    code: "documents",
    name: "Documents",
    description:
      "Bibliothèque d'entreprise : dossiers, catégories, versions et recherche.",
    icon: FolderOpen,
    tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    entry: "/documents",
    core: false,
    screens: [{ to: "/documents", label: "Documents", icon: FolderOpen }],
  },
  {
    code: "expenses",
    retired: true,
    name: "Notes de frais",
    description:
      "Dépenses professionnelles avec justificatif et validation hiérarchique.",
    icon: Receipt,
    tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    entry: "/expenses",
    core: false,
    screens: [
      { to: "/expenses", label: "Mes notes de frais", icon: Receipt },
      { to: "/expenses/new", label: "Nouvelle note", icon: FilePlus2 },
      { to: "/expenses/validations", label: "À valider", icon: ShieldCheck },
    ],
  },
  {
    code: "reports",
    name: "Rapports",
    description: "Rapports journaliers, validation hiérarchique et export PDF.",
    icon: FileText,
    tone: "bg-primary/10 text-primary",
    entry: "/reports",
    core: true,
    screens: [
      { to: "/reports", label: "Rapports", icon: FileText },
      { to: "/reports/new", label: "Nouveau rapport", icon: FilePlus2 },
      { to: "/reports/equipe", label: "Mon équipe", icon: Users },
      { to: "/reports/direction", label: "Vue direction", icon: BarChart3 },
      { to: "/reports/audit-roles", label: "Audit des rôles", icon: ShieldCheck },
    ],
  },
  {
    code: "minutes",
    retired: true,
    name: "Procès-verbaux",
    description: "Rédaction, signature et archivage des PV de réunion.",
    icon: FileSignature,
    tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    entry: "/minutes",
    core: false,
    screens: [{ to: "/minutes", label: "Procès-verbaux", icon: FileSignature }],
  },
  {
    code: "tasks",
    retired: true,
    name: "Tâches",
    description: "Tâches assignées, échéances, priorités et suivi d'avancement.",
    icon: ListChecks,
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    entry: "/tasks",
    core: false,
    screens: [
      { to: "/tasks", label: "Tâches", icon: ListChecks },
      { to: "/tasks/new", label: "Nouvelle tâche", icon: FilePlus2 },
    ],
  },
  {
    code: "leaves",
    retired: true,
    name: "Congés & absences",
    description:
      "Demandes de congés, soldes, justificatifs, validations hiérarchiques et calendrier d'équipe.",
    icon: CalendarCheck2,
    tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    entry: "/leaves",
    core: false,
    screens: [
      { to: "/leaves", label: "Mes congés", icon: CalendarCheck2 },
      { to: "/leaves/new", label: "Nouvelle demande", icon: FilePlus2 },
      { to: "/leaves/validations", label: "À valider", icon: ShieldCheck },
      { to: "/leaves/calendrier", label: "Calendrier d'équipe", icon: CalendarRange },
    ],
  },
  {
    code: "mail",
    name: "Messagerie",
    description:
      "Tous vos comptes e-mail (Gmail, Outlook, Yahoo, professionnel) dans une seule boîte unifiée.",
    icon: Mail,
    tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    entry: "/mail",
    core: false,
    screens: [
      { to: "/mail", label: "Tableau de bord", icon: Mail },
      { to: "/mail/inbox", label: "Boîte unifiée", icon: Inbox },
      { to: "/mail/scheduled", label: "Envois programmés", icon: CalendarClock },
      { to: "/mail/settings", label: "Comptes & paramètres", icon: Settings2 },
    ],
  },
  {
    code: "company",
    name: "Entreprise",
    description: "Employés, organigramme, suivi quotidien et applications.",
    icon: Building2,
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    entry: "/company",
    core: true,
    screens: [
      { to: "/company", label: "Entreprise", icon: Building2 },
      { to: "/company/hierarchie", label: "Organigramme", icon: Network },
      { to: "/company/applications", label: "Gérer les applications", icon: LayoutGrid },
    ],
  },
  {
    code: "hierarchy",
    name: "Hiérarchie",
    description: "Organigramme de l'entreprise et suivi des validations.",
    icon: Network,
    tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    entry: "/company/hierarchie",
    core: true,
    hiddenFromLauncher: true,
    screens: [
      { to: "/company/hierarchie", label: "Organigramme", icon: Network },
      { to: "/reports/direction", label: "Vue direction", icon: BarChart3 },
    ],
  },
  {
    code: "plans",
    name: "Plans",
    description: "Abonnement, sièges et options de facturation.",
    icon: Package,
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    entry: "/plans",
    core: true,
    hiddenFromLauncher: true,
    screens: [{ to: "/plans", label: "Plans", icon: Package }],
  },
  {
    code: "profile",
    name: "Profil",
    description: "Compte, avatar et vérification d'identité.",
    icon: UserCircle2,
    tone: "bg-muted text-foreground",
    entry: "/profile",
    core: true,
    hiddenFromLauncher: true,
    screens: [{ to: "/profile", label: "Profil", icon: UserCircle2 }],
  },
];

/** Codes des modules désactivables (gérés dans /company/applications). */
export const OPTIONAL_MODULE_CODES = APP_MODULES.filter((m) => !m.core).map(
  (m) => m.code,
);

export function getModule(code: string): AppModule | undefined {
  return APP_MODULES.find((m) => m.code === code);
}

/** Retrouve le module auquel appartient un chemin donné. */
export function moduleForPath(pathname: string): AppModule | undefined {
  // correspondance la plus longue d'abord : /company/hierarchie doit gagner sur /company
  return [...APP_MODULES]
    .sort((a, b) => b.entry.length - a.entry.length)
    .find(
      (m) => pathname === m.entry || pathname.startsWith(`${m.entry}/`),
    );
}

/** Liste des modules visibles pour un jeu de modules activés et un rang de plan. */
/** Normalise la liste de fonctionnalités, quel que soit son format en base. */
function toFeatureList(features: unknown): string[] | null {
  if (Array.isArray(features)) return features.map(String);
  if (typeof features === "string") {
    try {
      const parsed = JSON.parse(features);
      return Array.isArray(parsed) ? parsed.map(String) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function visibleModules(
  disabledCodes: string[] | undefined | null,
  features?: string[] | null,
): AppModule[] {
  const disabled = new Set(disabledCodes ?? []);
  return APP_MODULES.filter((m) => {
    if (m.retired) return false;
    if (!m.core && disabled.has(m.code)) return false;
  const granted = toFeatureList(features);
  if (granted && granted.length > 0) {
    const required = featureForModule(m.code);
    if (required && !granted.includes(required)) return false;
    }
    return true;
  });
}

/** Modules affichés dans le lanceur (hors pages système). */
export function launcherModules(
  disabledCodes: string[] | undefined | null,
  features?: string[] | null,
): AppModule[] {
  return visibleModules(disabledCodes, features).filter((m) => !m.hiddenFromLauncher);
}
