import { compressImageFile } from "@/lib/image-compress";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Send,
  Loader2,
  X,
  FileUp,
  Image as ImageIcon,
  FileText,
  Wand2,
  AlertTriangle,
  ListChecks,
  Volume2,
  VolumeX,
  Paperclip,
  Bot,
  ChevronDown,
} from "lucide-react";
import { AgentTeamCard, STEP_LABEL, detectDataMission, type AgentStep } from "./AgentTeamCard";
import { startAgentRun, advanceAgentRun, getAgentRun } from "@/lib/agents/agents.functions";
import { DictationButton } from "./DictationButton";
import { SpeakButton } from "./SpeakButton";
import { toast } from "sonner";
import {
  aiChat,
  aiGenerateFull,
  aiDetectIssues,
  aiSummarize,
  aiApplyStyle,
  aiExtractFromImage,
  aiExtractFromDocx,
  extractReportFromPdf,
  aiExtractFromPdfs,
  aiAgentProcess,
  type ExtractedReport,
  type MultiPdfFileStatus,
} from "@/lib/ai.functions";

type PdfMergeMode = "merge" | "per-document";

const MAX_PDF_FILES = 10;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

type PendingPdf = {
  name: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
};

function mergeDrafts(prev: ExtractedReport, add: ExtractedReport): ExtractedReport {
  const hasPrev = Boolean(prev.title || prev.intro || prev.conclusion || prev.sections.length);
  if (!hasPrev) return add;
  return {
    title: prev.title || add.title,
    intro: prev.intro || add.intro,
    conclusion: prev.conclusion || add.conclusion,
    sections: [...prev.sections, ...add.sections],
  };
}

type Message = { role: "user" | "assistant"; content: string; options?: string[]; changes?: string[] };

export type AIStyle =
  | "free"
  | "administratif"
  | "technique"
  | "chantier"
  | "intervention"
  | "maintenance"
  | "mission"
  | "visite"
  | "audit";

const STYLES: { value: AIStyle; label: string }[] = [
  { value: "free", label: "Style libre" },
  { value: "administratif", label: "Administratif" },
  { value: "technique", label: "Technique" },
  { value: "chantier", label: "Chantier" },
  { value: "intervention", label: "Intervention" },
  { value: "maintenance", label: "Maintenance" },
  { value: "mission", label: "Mission" },
  { value: "visite", label: "Visite" },
  { value: "audit", label: "Audit" },
];


async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function AIAssistantPanel({
  open,
  onClose,
  getDraft,
  applyDraft,
  addImages,
  style,
  onStyleChange,
}: {
  addImages?: (
    imgs: { base64: string; mimeType: string; sectionIndex: number | null; caption: string; source: string }[],
  ) => Promise<void>;
  open: boolean;
  onClose: () => void;
  getDraft: () => ExtractedReport;
  applyDraft: (r: ExtractedReport) => void;
  style: AIStyle;
  onStyleChange: (s: AIStyle) => void;
}) {
  const chat = useServerFn(aiChat);
  const generate = useServerFn(aiGenerateFull);
  const detect = useServerFn(aiDetectIssues);
  const summarize = useServerFn(aiSummarize);
  const applyStyle = useServerFn(aiApplyStyle);
  const extractImg = useServerFn(aiExtractFromImage);
  const extractDocx = useServerFn(aiExtractFromDocx);
  const extractPdf = useServerFn(extractReportFromPdf);
  const extractPdfs = useServerFn(aiExtractFromPdfs);
  const agent = useServerFn(aiAgentProcess);
  const startRun = useServerFn(startAgentRun);
  const advanceRun = useServerFn(advanceAgentRun);
  const fetchRun = useServerFn(getAgentRun);
  const [staged, setStaged] = useState<File[]>([]);
  const [steps, setSteps] = useState<AgentStep[] | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  const [history, setHistory] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Bonjour ! Je suis votre assistant de rédaction. Décrivez votre activité et je structurerai le rapport, ou cliquez sur **Générer le rapport** quand vous êtes prêt.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<
    { type: string; message: string; location: string }[] | null
  >(null);
  const [voiceMode, setVoiceMode] = useState(false);
  // Autoplay key per assistant message index (only the latest, when voiceMode is on).
  const [autoPlayIndex, setAutoPlayIndex] = useState<number | null>(null);
  // Bumping this triggers the DictationButton to auto-start (after TTS ends).
  const [micTrigger, setMicTrigger] = useState<number | null>(null);
  const [pdfMode, setPdfMode] = useState<PdfMergeMode>("merge");
  const [pendingFiles, setPendingFiles] = useState<PendingPdf[]>([]);
  const [undoDraft, setUndoDraft] = useState<ExtractedReport | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const voiceModeRef = useRef(voiceMode);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  function stageFiles(list: File[]) {
    const ok = list.filter((f) => {
      const n = f.name.toLowerCase();
      return f.type.startsWith("image/") || n.endsWith(".pdf") || n.endsWith(".docx");
    });
    if (ok.length < list.length) toast.error("Formats acceptés : PDF, Word (.docx), images");
    const big = ok.filter((f) => f.size > MAX_PDF_BYTES);
    if (big.length) toast.error(`Trop volumineux (max 20 Mo) : ${big.map((f) => f.name).join(", ")}`);
    setStaged((prev) => [...prev, ...ok.filter((f) => f.size <= MAX_PDF_BYTES)].slice(0, 15));
  }

  function initSteps(keys: string[]) {
    const s: AgentStep[] = keys.map((k, i) => ({ key: k, label: STEP_LABEL[k] ?? k, status: i === 0 ? "running" : "pending" }));
    setSteps(s);
    return {
      to(key: string) {
        setSteps((prev) => {
          if (!prev) return prev;
          const idx = prev.findIndex((p) => p.key === key);
          return prev.map((p, i) => ({ ...p, status: i < idx ? "done" : i === idx ? "running" : "pending" }));
        });
      },
      finish(ok: boolean) {
        setSteps((prev) => prev && prev.map((p) => (ok ? { ...p, status: "done" } : p.status === "running" ? { ...p, status: "failed" } : p)));
        setTimeout(() => setSteps(null), ok ? 2500 : 6000);
      },
    };
  }

  async function runDataMission(msg: string, m: NonNullable<ReturnType<typeof detectDataMission>>, nextHist: Message[]) {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const { id } = await startRun({
      data: {
        report_type: m.report_type,
        title: getDraft().title || "Rapport",
        instructions: msg,
        period_start: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        period_end: iso(now),
        sources: m.sources,
      },
    });
    const sync = async () => {
      const r = await fetchRun({ data: { id } });
      setSteps(r.tasks.map((t: any) => ({
        key: t.task_type,
        label: STEP_LABEL[t.task_type] ?? t.task_type,
        status: t.status === "done" ? "done" : t.status === "failed" ? "failed" : t.status === "running" || t.status === "retrying" ? "running" : "pending",
      })));
      return r;
    };
    await sync();
    for (let i = 0; i < 20; i++) {
      const res = await advanceRun({ data: { id } });
      await sync();
      if (res.done) break;
    }
    const final = await sync();
    const w = (final.run.state as any)?.write;
    if (w && ["completed", "completed_with_warnings"].includes(final.run.status)) {
      setUndoDraft(getDraft());
      applyDraft({
        title: w.title,
        intro: w.intro,
        conclusion: w.conclusion,
        sections: (w.sections ?? []).map((s: any) => ({ title: s.title, description: s.text, bullets: [] })),
      } as ExtractedReport);
      setHistory([...nextHist, { role: "assistant", content: "✅ Les agents ont terminé : chiffres collectés, analysés, contrôlés puis rédigés. Le rapport est inséré dans le formulaire. Dites-moi ce qu'il faut ajuster." }]);
      setTimeout(() => setSteps(null), 2500);
    } else {
      throw new Error(final.run.error_summary || "La mission des agents a échoué");
    }
  }

  async function sendWithDocs(msg: string) {
    const files = staged;
    const label = `${msg}\n\n📎 ${files.map((f) => f.name).join(", ")}`;
    const nextHist: Message[] = [...history, { role: "user", content: label }];
    setHistory(nextHist);
    setInput("");
    setBusy(true);
    const before = getDraft();
    const st = initSteps(["plan", "collect", "write", "quality", "generate"]);
    let ok = false;
    try {
      st.to("collect");
      const payload = await Promise.all(
        // Une photo de téléphone dépasse la limite de requête (~4,5 Mo) :
        // on la comprime avant l'encodage base64.
        files.map(async (f) => {
          const prepared = await compressImageFile(f);
          return {
            filename: prepared.name,
            mimeType:
              prepared.type ||
              (prepared.name.toLowerCase().endsWith(".pdf")
                ? "application/pdf"
                : "application/octet-stream"),
            base64: await fileToBase64(prepared),
          };
        }),
      );
      st.to("write");
      const res = await agent({
        data: {
          instruction: msg,
          files: payload,
          history,
          reportDraft: before,
          style: style === "free" ? undefined : style,
        },
      });
      st.to("quality");
      setHistory([...nextHist, { role: "assistant", content: res.reply || "Terminé." }]);
      st.to("generate");
      if (res.updatedDraft) {
        setUndoDraft(before);
        applyDraft(res.updatedDraft);
      }
      setStaged([]);
      if (res.images.length && addImages) {
        await addImages(res.images);
        toast.success(`Rapport mis à jour, ${res.images.length} image(s) ajoutée(s)`);
      } else if (res.updatedDraft) toast.success("Rapport mis à jour");
      ok = true;
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur IA");
      setHistory([...nextHist, { role: "assistant", content: "⚠️ " + (e?.message ?? "Erreur IA") }]);
    } finally {
      st.finish(ok);
      setBusy(false);
    }
  }

  async function send(overrideText?: string) {
    const msg = (overrideText ?? input).trim();
    if (!msg || busy) return;
    if (staged.length > 0) return sendWithDocs(msg);
    if (!overrideText) setInput("");
    const nextHist: Message[] = [...history, { role: "user", content: msg }];
    setHistory(nextHist);
    setBusy(true);
    const mission = detectDataMission(msg);
    if (mission) {
      try {
        await runDataMission(msg, mission, nextHist);
      } catch (e: any) {
        toast.error(e?.message ?? "Erreur agents");
        setSteps((p) => p && p.map((s) => (s.status === "running" ? { ...s, status: "failed" } : s)));
        setTimeout(() => setSteps(null), 6000);
        setHistory([...nextHist, { role: "assistant", content: "⚠️ " + (e?.message ?? "Erreur agents") }]);
      } finally {
        setBusy(false);
      }
      return;
    }
    const st = initSteps(["plan", "write", "quality"]);
    let ok = false;
    try {
      st.to("write");
      const res = await chat({
        data: {
          history,
          userMessage: msg,
          reportDraft: getDraft(),
          style: style === "free" ? undefined : style,
        },
      });
      st.to("quality");
      const reply = res.reply || "…";
      const newIndex = nextHist.length;
      setHistory([...nextHist, { role: "assistant", content: reply, options: res.clarification?.options, changes: res.changes }]);
      if (voiceModeRef.current) setAutoPlayIndex(newIndex);
      if (res.updatedDraft) {
        setUndoDraft(getDraft());
        applyDraft(res.updatedDraft);
        toast.success(`Rapport mis à jour (${res.changes.length} retouche${res.changes.length > 1 ? "s" : ""})`);
      }
      ok = true;
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur IA");
      setHistory([
        ...nextHist,
        { role: "assistant", content: "⚠️ " + (e?.message ?? "Erreur IA") },
      ]);
    } finally {
      st.finish(ok);
      setBusy(false);
    }
  }

  function handleDictated(text: string) {
    if (voiceModeRef.current) {
      // Send directly in conversation mode
      void send(text);
    } else {
      setInput((v) => (v ? v + " " : "") + text);
    }
  }

  function handleTtsEnded() {
    // In conversation mode, re-open the mic for a natural turn-taking flow
    if (voiceModeRef.current) {
      setMicTrigger((v) => (v ?? 0) + 1);
    }
  }

  async function doGenerate() {
    setBusy(true);
    try {
      const res = await generate({
        data: { history, reportDraft: getDraft(), style: style === "free" ? undefined : style },
      });
      applyDraft(res);
      toast.success("Rapport généré");
    } catch (e: any) {
      toast.error(e?.message ?? "Génération impossible");
    } finally {
      setBusy(false);
    }
  }

  async function doDetect() {
    setBusy(true);
    setIssues(null);
    try {
      const res = await detect({ data: { report: getDraft() } });
      setIssues(res.issues);
      if (res.issues.length === 0) toast.success("Aucune incohérence détectée");
    } catch (e: any) {
      toast.error(e?.message ?? "Analyse impossible");
    } finally {
      setBusy(false);
    }
  }

  async function doSummarize() {
    setBusy(true);
    try {
      const res = await summarize({ data: { report: getDraft(), mode: "executive" } });
      setHistory((h) => [
        ...h,
        { role: "assistant", content: "**Résumé exécutif :**\n\n" + res.summary },
      ]);
    } catch (e: any) {
      toast.error(e?.message ?? "Résumé impossible");
    } finally {
      setBusy(false);
    }
  }

  async function doApplyStyle() {
    if (!style || style === "free") {
      toast.error("Choisissez un style d'abord");
      return;
    }
    setBusy(true);
    try {
      const res = await applyStyle({ data: { report: getDraft(), style } });
      applyDraft(res);
      toast.success("Style appliqué");
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file: File) {
    setBusy(true);
    try {
      const prepared = await compressImageFile(file);
    const base64 = await fileToBase64(prepared);
      let res: ExtractedReport;
      if (file.type.startsWith("image/")) {
        res = await extractImg({ data: { base64, mimeType: prepared.type } });
      } else if (file.name.toLowerCase().endsWith(".docx")) {
        res = await extractDocx({ data: { base64, filename: file.name } });
      } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        res = await extractPdf({
          data: { pdfBase64: base64, mimeType: "application/pdf", filename: file.name },
        });
      } else {
        toast.error("Format non supporté (PDF, DOCX ou image)");
        return;
      }
      applyDraft(res);
      toast.success("Contenu importé");
    } catch (e: any) {
      toast.error(e?.message ?? "Import impossible");
    } finally {
      setBusy(false);
    }
  }

  async function handleMixedFiles(list: File[]) {
    if (busy) return;
    const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    const pdfs = list.filter(isPdf);
    const others = list.filter((f) => !isPdf(f));
    for (const f of others) await handleImport(f);
    if (pdfs.length > 0) await handlePdfFiles(pdfs);
  }

  function undoImport() {
    if (!undoDraft) return;
    applyDraft(undoDraft);
    setUndoDraft(null);
    setPendingFiles([]);
    toast.success("Import annulé");
  }

  async function handlePdfFiles(list: File[]) {
    if (busy) return;
    const pdfs = list.filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfs.length === 0) {
      toast.error("Aucun PDF valide dans la sélection");
      return;
    }
    if (pdfs.length === 1) {
      await handleImport(pdfs[0]!);
      return;
    }
    if (pdfs.length > MAX_PDF_FILES) {
      toast.error(`Maximum ${MAX_PDF_FILES} PDF par import`);
      return;
    }
    const tooBig = pdfs.filter((f) => f.size > MAX_PDF_BYTES);
    if (tooBig.length > 0) {
      toast.error(`Fichier trop volumineux (max 20 Mo) : ${tooBig.map((f) => f.name).join(", ")}`);
      return;
    }

    setPendingFiles(pdfs.map((f) => ({ name: f.name, status: "running" as const })));
    setBusy(true);
    const before = getDraft();
    try {
      const files = await Promise.all(
        pdfs.map(async (f) => ({
          filename: f.name,
          base64: await fileToBase64(f),
          mimeType: "application/pdf",
        })),
      );
      const res = await extractPdfs({
        data: { files, mode: pdfMode, style: style === "free" ? undefined : style },
      });
      setPendingFiles(
        res.perFile.map((p: MultiPdfFileStatus) => ({
          name: p.filename,
          status: p.ok ? ("done" as const) : ("error" as const),
          error: p.error,
        })),
      );
      const okCount = res.perFile.filter((p: MultiPdfFileStatus) => p.ok).length;
      const failCount = res.perFile.length - okCount;
      if (okCount === 0) {
        toast.error("Aucun document n'a pu être lu");
        return;
      }
      setUndoDraft(before);
      applyDraft(mergeDrafts(before, res.report));
      toast.success(
        `${okCount} document(s) importé(s)` + (failCount > 0 ? `, ${failCount} échec(s)` : ""),
      );
    } catch (e: any) {
      setPendingFiles((prev) =>
        prev.map((p) => ({ ...p, status: "error" as const, error: e?.message })),
      );
      toast.error(e?.message ?? "Import impossible");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className={
        "fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] bg-background border-l border-border shadow-2xl flex flex-col" +
        (dragOver ? " ring-2 ring-primary" : "")
      }
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length > 0) stageFiles(files);
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="font-semibold">Assistant IA</div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={voiceMode ? "default" : "ghost"}
            size="sm"
            onClick={() => setVoiceMode((v) => !v)}
            title={voiceMode ? "Désactiver le mode conversation vocale" : "Activer le mode conversation vocale"}
            className="h-8"
          >
            {voiceMode ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            <span className="ml-1.5 text-xs">Vocal</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer l'assistant IA">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>


      <div className="px-4 pt-2 pb-2 border-b border-border">
        <button type="button" onClick={() => setToolsOpen((v) => !v)} className="w-full flex items-center justify-between text-xs font-medium py-1 hover:text-primary" aria-expanded={toolsOpen}>
          <span className="inline-flex items-center gap-1.5"><Wand2 className="h-3.5 w-3.5" /> Options & outils</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${toolsOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {toolsOpen && (
      <div className="px-4 py-3 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Style :</span>
          <Select value={style} onValueChange={(v) => onStyleChange(v as AIStyle)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLES.map((s) => (
                <SelectItem key={s.value || "free"} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={doGenerate}>
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />
            Générer
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={doApplyStyle}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Style
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={doDetect}>
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            Incohérences
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={doSummarize}>
            <ListChecks className="h-3.5 w-3.5 mr-1.5" />
            Résumer
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
            <div className="border border-input rounded-md h-8 flex items-center justify-center text-xs cursor-pointer hover:bg-accent">
              <ImageIcon className="h-3.5 w-3.5 mr-1" /> Image
            </div>
          </label>
          <label>
            <input
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
            <div className="border border-input rounded-md h-8 flex items-center justify-center text-xs cursor-pointer hover:bg-accent">
              <FileText className="h-3.5 w-3.5 mr-1" /> Word
            </div>
          </label>
          <label>
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) stageFiles(files);
                e.target.value = "";
              }}
            />
            <div className="border border-input rounded-md h-8 flex items-center justify-center text-xs cursor-pointer hover:bg-accent">
              <FileUp className="h-3.5 w-3.5 mr-1" /> PDF
            </div>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">PDF multiples :</span>
          <Select value={pdfMode} onValueChange={(v) => setPdfMode(v as PdfMergeMode)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="merge">Fusionner en un rapport</SelectItem>
              <SelectItem value="per-document">Une section par document</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Jusqu'à {MAX_PDF_FILES} PDF (20 Mo max chacun) — sélection multiple ou glisser-déposer.
        </p>
        {pendingFiles.length > 0 && (
          <ul className="space-y-1 text-xs">
            {pendingFiles.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="truncate flex-1">{f.name}</span>
                <span
                  className={
                    f.status === "error"
                      ? "text-destructive shrink-0"
                      : f.status === "done"
                        ? "text-primary shrink-0"
                        : "text-muted-foreground shrink-0"
                  }
                  title={f.error}
                >
                  {f.status === "pending"
                    ? "en attente"
                    : f.status === "running"
                      ? "lecture…"
                      : f.status === "done"
                        ? "lu"
                        : (f.error ?? "erreur")}
                </span>
              </li>
            ))}
          </ul>
        )}
        {undoDraft && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={undoImport}>
            Annuler l'import
          </Button>
        )}
      </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {issues && (
          <Card className="p-3 border-amber-500/40 bg-amber-500/5">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Incohérences ({issues.length})
            </div>
            {issues.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucune détectée.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {issues.map((i, idx) => (
                  <li key={idx}>
                    <span className="font-medium">[{i.type}]</span> {i.message}
                    {i.location ? (
                      <span className="text-muted-foreground"> — {i.location}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {history.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-6 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm"
                : "mr-6 rounded-lg bg-muted px-3 py-2 text-sm"
            }
          >
            {m.role === "assistant" ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <div className="prose prose-sm max-w-none dark:prose-invert flex-1">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                  <SpeakButton
                    text={m.content}
                    autoPlayKey={autoPlayIndex === i ? i : null}
                    onEnded={autoPlayIndex === i ? handleTtsEnded : undefined}
                  />
                </div>
                {m.changes && m.changes.length > 0 && (
                  <ul className="rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs space-y-0.5">
                    {m.changes.map((c, j) => (
                      <li key={j} className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="text-primary">✓</span> {c}
                      </li>
                    ))}
                  </ul>
                )}
                {m.options && m.options.length > 0 && i === history.length - 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.options.map((o, j) => (
                      <Button key={j} type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void send(o)}>
                        {o}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{m.content}</div>
            )}
          </div>
        ))}
        {steps && <AgentTeamCard steps={steps} />}
        {busy && !steps && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> L'assistant réfléchit…
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        {staged.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {staged.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs max-w-full">
                  {f.type.startsWith("image/") ? <ImageIcon className="h-3 w-3 shrink-0" /> : <FileText className="h-3 w-3 shrink-0" />}
                  <span className="truncate max-w-[160px]">{f.name}</span>
                  <button
                    type="button"
                    aria-label={`Retirer ${f.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setStaged((p) => p.filter((_, j) => j !== i))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Documents en attente — écrivez ce que l'assistant doit en faire, puis Envoyer.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                "Fusionne ces rapports en un seul rapport complet, sans doublons, et insère les photos aux bons endroits.",
                "Résume les points clés de ces documents.",
                "Extrais uniquement les problèmes rencontrés et les actions à mener.",
              ].map((t, i) => (
                <button
                  key={i}
                  type="button"
                  className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] hover:bg-primary/10"
                  onClick={() => setInput(t)}
                >
                  {i === 0 ? "Fusionner en 1 rapport" : i === 1 ? "Résumer" : "Problèmes & actions"}
                </button>
              ))}
            </div>
          </div>
        )}
        <Textarea
          rows={2}
          placeholder={voiceMode ? "Mode conversation actif — parlez ou tapez…" : "Décrivez votre activité, une question, un ajout…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <label title="Joindre des documents (PDF, Word, images)">
              <input
                type="file"
                multiple
                accept="application/pdf,.pdf,.docx,image/*"
                className="hidden"
                aria-label="Joindre des documents"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length > 0) stageFiles(files);
                }}
              />
              <div className={`border border-input rounded-md h-8 px-2 flex items-center text-xs cursor-pointer hover:bg-accent ${busy ? "opacity-50 pointer-events-none" : ""}`}>
                <Paperclip className="h-3.5 w-3.5 mr-1" /> Documents
              </div>
            </label>
            <DictationButton
              onTranscript={handleDictated}
              label={voiceMode ? "Parler" : "Dicter"}
              autoStartTrigger={micTrigger}
            />
          </div>
          <Button size="sm" disabled={busy || !input.trim()} onClick={() => void send()}>
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Envoyer
          </Button>
        </div>
      </div>
    </div>
  );
}
