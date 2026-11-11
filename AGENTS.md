<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- AI report agents: orchestrator advances one agent_tasks step per server call (src/lib/agents); numbers are computed deterministically, AI only plans and writes — keeps runs traceable and within worker time limits.
- Report assistant edits drafts via atomic patch operations applied by src/lib/report-patch.ts (AI never rewrites the full report) — guarantees untouched content and photos survive edits.
- Consolidation collects only reports with null period_start and period_end; generated summaries always set both — prevents recursive work and photo duplication without changing existing reports.
- Validate combined-report dates in the shared range helper before formatting or enabling generation — native date inputs can be temporarily empty.
- Report PDFs fall back to rendering in section chunks merged with pdf-lib (page numbers stamped after merge) — the PDF engine crashes on some long layouts; a Buffer polyfill is loaded before it for browser image handling.
- Company chat (src/components/chat) is scoped by company_members via RLS and the security-definer company_chat_colleagues() RPC — members can only see colleagues and messages of their own company.
