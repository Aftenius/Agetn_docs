import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  type AgentInfo,
  analyzeContract,
  downloadExport,
  fetchAgents,
} from "./api";
import { AgentPanel } from "./AgentPanel";
import {
  appendAnalyzeHistory,
  getAnalyzeHistory,
  getLastSuccessPayload,
  type AnalyzeHistoryEntry,
  type AnalyzePayload,
} from "./documents/analyzeHistory";
import { ContractEditor, type MarginPreset } from "./ContractEditor";
import {
  ensureDocumentLoaded,
  getDocument,
  updateDocument,
  type StoredDocument,
} from "./documents/store";
import { WizardForm } from "./WizardForm";

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<StoredDocument | null>(() =>
    id ? getDocument(id) : null
  );
  const [docLoading, setDocLoading] = useState(() => Boolean(id && !getDocument(id)));

  const htmlRef = useRef<string>(doc?.html ?? "");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentId, setAgentId] = useState("general");
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzePayload | null>(
    null
  );
  const [analyzeHistory, setAnalyzeHistory] = useState<AnalyzeHistoryEntry[]>(
    []
  );
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState<null | "pdf" | "docx">(null);
  const [marginPreset, setMarginPreset] = useState<MarginPreset>("normal");
  const [titleDraft, setTitleDraft] = useState("");
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(
    (html: string) => {
      if (!id) return;
      htmlRef.current = html;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateDocument(id, { html: htmlRef.current });
        saveTimer.current = null;
      }, 420);
    },
    [id]
  );

  const onHtmlChange = useCallback(
    (html: string) => {
      htmlRef.current = html;
      scheduleSave(html);
    },
    [scheduleSave]
  );

  useEffect(() => {
    fetchAgents()
      .then((a) => {
        setAgents(a);
        if (a.length)
          setAgentId((cur) => (a.some((x) => x.id === cur) ? cur : a[0].id));
      })
      .catch((e) => setAnalyzeErr(String(e)));
  }, []);

  useEffect(() => {
    if (!id) {
      setDoc(null);
      setDocLoading(false);
      return;
    }
    const local = getDocument(id);
    if (local) {
      setDoc(local);
      setDocLoading(false);
      return;
    }
    setDocLoading(true);
    let cancelled = false;
    void ensureDocumentLoaded(id).then((d) => {
      if (!cancelled) {
        setDoc(d);
        setDocLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (doc) htmlRef.current = doc.html;
  }, [doc?.id, doc?.html]);

  useEffect(() => {
    if (doc) setTitleDraft(doc.title);
  }, [doc?.id]);

  useEffect(() => {
    if (!id) return;
    const h = getAnalyzeHistory(id);
    setAnalyzeHistory(h);
    const last = getLastSuccessPayload(id);
    setAnalyzeResult(last);
    setAnalyzeErr(null);
  }, [id]);

  const flushTitle = useCallback(() => {
    if (!id) return;
    const t = titleDraft.trim() || "Без названия";
    if (titleSaveTimer.current) {
      clearTimeout(titleSaveTimer.current);
      titleSaveTimer.current = null;
    }
    const prev = getDocument(id)?.title;
    if (prev !== t) updateDocument(id, { title: t });
  }, [id, titleDraft]);

  const onTitleChange = (v: string) => {
    setTitleDraft(v);
    if (!id) return;
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(() => {
      const t = v.trim() || "Без названия";
      updateDocument(id, { title: t });
      titleSaveTimer.current = null;
    }, 450);
  };

  const runAnalyze = async () => {
    if (!id) return;
    const html = htmlRef.current;
    if (!html.trim()) return;
    setAnalyzeErr(null);
    setAnalyzing(true);
    try {
      const raw = (await analyzeContract(html, agentId)) as {
        result?: AnalyzePayload;
      };
      const r = raw?.result;
      if (r && typeof r === "object") {
        setAnalyzeResult(r);
        appendAnalyzeHistory(id, {
          at: new Date().toISOString(),
          agentId,
          agentName: agents.find((a) => a.id === agentId)?.name,
          payload: r,
        });
        setAnalyzeHistory(getAnalyzeHistory(id));
      } else {
        const msg = "Пустой ответ анализа";
        setAnalyzeErr(msg);
        appendAnalyzeHistory(id, {
          at: new Date().toISOString(),
          agentId,
          agentName: agents.find((a) => a.id === agentId)?.name,
          error: msg,
        });
        setAnalyzeHistory(getAnalyzeHistory(id));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAnalyzeErr(msg);
      appendAnalyzeHistory(id, {
        at: new Date().toISOString(),
        agentId,
        agentName: agents.find((a) => a.id === agentId)?.name,
        error: msg,
      });
      setAnalyzeHistory(getAnalyzeHistory(id));
    } finally {
      setAnalyzing(false);
    }
  };

  const onSelectAnalyzeHistory = useCallback((entry: AnalyzeHistoryEntry) => {
    setAnalyzeResult(entry.payload ?? null);
    setAnalyzeErr(entry.error ?? null);
  }, []);

  const doExport = async (kind: "pdf" | "docx") => {
    const html = htmlRef.current;
    setExportBusy(kind);
    setAnalyzeErr(null);
    try {
      const blob = await downloadExport(kind, html);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = kind === "pdf" ? "dogovor.pdf" : "dogovor.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setAnalyzeErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy(null);
    }
  };

  if (!id) {
    return <Navigate to="/" replace />;
  }
  if (docLoading) {
    return (
      <div className="docs-home">
        <p className="docs-home-hint">Загрузка документа…</p>
      </div>
    );
  }
  if (!doc) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="layout">
      <div className="editor-wrap">
        <header className="toolbar toolbar-app toolbar-app-with-title">
          <Link to="/" className="toolbar-link-home">
            Все документы
          </Link>
          <input
            type="text"
            className="toolbar-doc-title"
            value={titleDraft}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={flushTitle}
            placeholder="Название документа"
            aria-label="Название документа"
          />
          <span className="toolbar-title toolbar-brand">Docs-agent</span>
        </header>
        <div className="editor-inner">
          <ContractEditor
            key={doc.id}
            documentHtml={doc.html}
            marginPreset={marginPreset}
            onMarginPresetChange={setMarginPreset}
            onHtmlChange={onHtmlChange}
            onDocumentReplace={(html) => {
              updateDocument(id, { html });
              htmlRef.current = html;
            }}
            onImportError={setAnalyzeErr}
            onOpenWizard={() => setWizardOpen(true)}
            onExportPdf={() => doExport("pdf")}
            onExportDocx={() => doExport("docx")}
            exportBusy={exportBusy}
          />
        </div>
      </div>
      <aside className="side">
        <AgentPanel
          agents={agents}
          agentId={agentId}
          onAgentChange={setAgentId}
          onAnalyze={runAnalyze}
          analyzing={analyzing}
          error={analyzeErr}
          data={analyzeResult}
          analyzeHistory={analyzeHistory}
          onSelectAnalyzeHistory={onSelectAnalyzeHistory}
        />
      </aside>
      {wizardOpen ? (
        <WizardForm
          onClose={() => setWizardOpen(false)}
          onApplied={(html) => {
            if (id) updateDocument(id, { html });
            htmlRef.current = html;
          }}
        />
      ) : null}
    </div>
  );
}
