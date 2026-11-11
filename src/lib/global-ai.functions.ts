import { historyAsContext } from "./ai-history";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAiQuota } from "@/lib/ai-quota";
import { callAI, DEFAULT_MODEL, type AIMessage } from "./ai-gateway.server";

const input = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(30)
    .default([]),
});

// Assistant transversal : lit (sous RLS de l'utilisateur) projets, documents et notes de frais.
export const globalAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }): Promise<{ reply: string }> => {
    const sb = context.supabase;
    const [projects, milestones, budget, folders, docs, expenses] = await Promise.all([
      sb.from("projects").select("id,code,title,client,status,health,priority,manager_name,start_date,end_date,progress,budget,currency,summary").order("updated_at", { ascending: false }).limit(50),
      sb.from("project_milestones").select("project_id,title,due_date,status,responsible").limit(300),
      sb.from("project_budget_lines").select("project_id,label,planned,spent").limit(300),
      sb.from("document_folders").select("id,name,parent_id").limit(200),
      sb.from("documents").select("title,category,description,folder_id,visibility,version,mime_type,created_at").order("created_at", { ascending: false }).limit(150),
      sb.from("expense_reports").select("title,amount,currency,category,status,expense_date,description,decision_comment,author_id").order("expense_date", { ascending: false }).limit(150),
    ]);
    const folderName = new Map((folders.data ?? []).map((f) => [f.id, f.name]));
    const ctx = {
      today: new Date().toISOString().slice(0, 10),
      moi: context.userId,
      projets: (projects.data ?? []).map((p) => ({
        ...p,
        jalons: (milestones.data ?? []).filter((m) => m.project_id === p.id).map(({ project_id: _, ...m }) => m),
        budget_lignes: (budget.data ?? []).filter((b) => b.project_id === p.id).map(({ project_id: _, ...b }) => b),
      })),
      dossiers: (folders.data ?? []).map((f) => ({ nom: f.name, parent: f.parent_id ? folderName.get(f.parent_id) ?? null : null })),
      documents: (docs.data ?? []).map(({ folder_id, ...d }) => ({ ...d, dossier: folder_id ? folderName.get(folder_id) ?? null : null })),
      notes_de_frais: (expenses.data ?? []).map(({ author_id, ...e }) => ({ ...e, de_moi: author_id === context.userId })),
    };

    const system =
      "Tu es l'assistante IA transversale de DailyBrief. Tu réponds en français, de façon synthétique et structurée (markdown : titres, listes, tableaux si utile). " +
      "Tu peux répondre sur n'importe quel projet, dossier/document de la GED ou note de frais présent dans les données ci-dessous (déjà filtrées selon les droits de l'utilisateur). " +
      "Cite les projets par leur code et titre, les montants avec leur devise. Si l'information n'existe pas dans les données, dis-le clairement sans inventer. " +
      "Statuts notes de frais : draft=brouillon, submitted=en attente, approved=approuvée, rejected=refusée.\n\nDonnées :\n" +
      JSON.stringify(ctx);

    const messages: AIMessage[] = [
      ...historyAsContext(data.history),
      { role: "user", content: data.message },
    ];
    const reply = await callAI({ model: DEFAULT_MODEL, system, messages });
    return { reply };
  });
