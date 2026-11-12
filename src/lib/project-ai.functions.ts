import { historyAsContext } from "./ai-history";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAiQuota } from "@/lib/ai-quota";
import { callAI, parseJsonLoose, DEFAULT_MODEL, type AIMessage } from "./ai-gateway.server";

const input = z.object({
  projectId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(30)
    .default([]),
});

export type SuggestedMilestone = { title: string; due_date: string | null; responsible: string };
export type ProjectAIReply = { reply: string; milestones: SuggestedMilestone[] };

export const projectAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }): Promise<ProjectAIReply> => {
    const sb = context.supabase;
    const { data: project, error } = await sb.from("projects").select("*").eq("id", data.projectId).maybeSingle();
    if (error || !project) throw new Error("Projet introuvable ou accès refusé");
    const [ms, mem, bud, files] = await Promise.all([
      sb.from("project_milestones").select("title,due_date,responsible,status").eq("project_id", data.projectId).order("position"),
      sb.from("project_members").select("name,role").eq("project_id", data.projectId),
      sb.from("project_budget_lines").select("label,planned,spent").eq("project_id", data.projectId),
      sb.from("project_files").select("file_name").eq("project_id", data.projectId),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const ctx = {
      today,
      projet: {
        code: project.code, titre: project.title, client: project.client, categorie: project.category,
        statut: project.status, sante: project.health, priorite: project.priority, chef: project.manager_name,
        debut: project.start_date, fin: project.end_date, avancement: project.progress,
        budget: project.budget, devise: project.currency, contexte: project.context,
        objectifs: project.objectives, livrables: project.deliverables, resume: project.summary,
      },
      jalons: ms.data ?? [], equipe: mem.data ?? [], budget_lignes: bud.data ?? [],
      documents: (files.data ?? []).map((f) => f.file_name),
    };

    const system =
      "Tu es l'assistante IA de pilotage de projet de DailyBrief (PMO expérimentée), tu réponds en français. " +
      "Tu analyses l'avancement, les jalons en retard (date < today et statut non terminé), les écarts budgétaires, " +
      "les risques, et tu proposes des actions concrètes et priorisées. Sois synthétique et structurée (titres, listes). " +
      "Réponds STRICTEMENT en JSON : {\"reply\": \"markdown\", \"milestones\": [{\"title\": string, \"due_date\": \"YYYY-MM-DD\"|null, \"responsible\": string}]}. " +
      "Ne remplis milestones que si l'utilisateur demande de proposer des jalons/étapes ; sinon renvoie [].\n\n" +
      "Données du projet :\n" + JSON.stringify(ctx);

    const messages: AIMessage[] = [
      ...historyAsContext(data.history),
      { role: "user", content: data.message },
    ];
    const text = await callAI({ model: DEFAULT_MODEL, system, json: true, messages });
    try {
      const out = parseJsonLoose<Partial<ProjectAIReply>>(text);
      return {
        reply: String(out.reply ?? ""),
        milestones: Array.isArray(out.milestones)
          ? out.milestones.slice(0, 15).map((m) => ({
              title: String(m.title ?? "").slice(0, 200),
              due_date: m.due_date && /^\d{4}-\d{2}-\d{2}$/.test(m.due_date) ? m.due_date : null,
              responsible: String(m.responsible ?? ""),
            })).filter((m) => m.title)
          : [],
      };
    } catch {
      return { reply: text, milestones: [] };
    }
  });
