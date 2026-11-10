# DailyBrief — Système de rapports journaliers

Application web pour rédiger, faire valider, signer et envoyer des rapports
(journaliers, mensuels, consolidés), avec assistance IA et export PDF.

**Application en ligne** : https://rapport-journaliere.lovable.app

## Fonctionnalités

- **Rapports** : rédaction par sections (texte, puces, photos, pièces jointes), dictée vocale, modèles de rapports, regroupement de jours/mois, export et visualisation PDF, signature, partage par lien et envoi par e-mail.
- **Assistant IA** : propositions et modifications du brouillon par opérations ciblées (le rapport n'est jamais réécrit en entier), agents de synthèse pour les rapports consolidés.
- **Organisation** : entreprise, hiérarchie, équipes, rôles et audit des rôles, rapports de direction.
- **Gestion** : projets, tâches, comptes rendus de réunion, congés et calendrier, notes de frais, budgets/devis/factures.
- **Messagerie** : comptes e-mail, modèles, signatures, envois planifiés.
- **Administration** : utilisateurs, plans, facturation, journal d'audit (MFA requis).

## Technologies

TanStack Start (React 19, Vite), Tailwind CSS 4 et shadcn/ui, Supabase (base de données, authentification, stockage, RLS), Drizzle (schéma), `@react-pdf/renderer` + `pdf-lib` (PDF), Vitest (tests).

## Démarrage

Prérequis : Node.js 20+ et npm.

```sh
git clone https://github.com/franck3011/rapport-journaliere.git
cd rapport-journaliere
npm install --legacy-peer-deps
cp .env.example .env        # puis renseigner les valeurs
npm run dev
```

> `--legacy-peer-deps` est nécessaire tant que le `package-lock.json` n'est pas régénéré.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm test` | Tests unitaires (Vitest) |
| `npm run lint` | Vérification ESLint |
| `npm run format` | Formatage Prettier |

## Configuration

Toutes les variables sont listées dans [`.env.example`](.env.example).
Les clés `*_PUBLISHABLE_KEY` sont publiques ; en revanche
`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` et `LOVABLE_API_KEY` sont des
**secrets** : ne les commitez jamais, définissez-les dans l'hébergeur.

## Structure

```
src/routes/        Pages (routage par fichiers) et routes API
src/components/    Composants (formulaires, PDF, admin, mail, budget…)
src/lib/           Logique métier et fonctions serveur
src/integrations/  Client Supabase et authentification
supabase/          Migrations de la base
drizzle/           Schéma et migrations Drizzle
```

Voir aussi [`AGENTS.md`](AGENTS.md) (principes d'architecture) et [`roadmap.md`](roadmap.md).

## Projet Lovable

Ce dépôt est synchronisé avec [Lovable](https://lovable.dev/projects/8b12a42d-61e7-4830-8fbf-e21300a8cd36).
Évitez de réécrire l'historique Git (force-push, rebase, squash) : cela casse la synchronisation.
