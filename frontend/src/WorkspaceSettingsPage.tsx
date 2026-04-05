import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchRagStatus,
  fetchWorkspaceSettings,
  ingestRagFile,
  patchWorkspaceSettings,
  type RagStatus,
  type WorkspaceSettings,
} from "./api";
import { WorkspaceAgentsSection } from "./WorkspaceAgentsSection";
import { WorkspaceChecklistSection } from "./WorkspaceChecklistSection";

export function WorkspaceSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [language, setLanguage] = useState("ru");
  const [structureInstructions, setStructureInstructions] = useState("");
  const [rag, setRag] = useState<RagStatus | null>(null);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, rs] = await Promise.all([
          fetchWorkspaceSettings(),
          fetchRagStatus(),
        ]);
        if (cancelled) return;
        setSettings(s);
        setCompanyName(s.company_name ?? "");
        setJurisdiction(s.jurisdiction ?? "");
        setLanguage(s.language ?? "ru");
        setStructureInstructions(s.generation?.structure_instructions ?? "");
        setRag(rs);
      } catch (e) {
        if (!cancelled) {
          setSettings(null);
          window.alert(
            e instanceof Error ? e.message : "Не удалось загрузить настройки"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async (ev: FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setIngestMsg(null);
    try {
      const s = await patchWorkspaceSettings({
        company_name: companyName,
        jurisdiction,
        language,
        generation: { structure_instructions: structureInstructions },
      });
      setSettings(s);
      window.alert("Сохранено.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const onRagFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIngestMsg(null);
    try {
      const r = await ingestRagFile(file);
      setIngestMsg(
        `Добавлено фрагментов: ${r.chunks_added} (${r.filename}).`
      );
      setRag(await fetchRagStatus());
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Не удалось загрузить в корпус"
      );
    }
  };

  if (loading) {
    return (
      <div className="docs-home">
        <p className="docs-home-hint">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="docs-home workspace-settings">
      <header className="docs-home-header">
        <h1>Настройки workspace</h1>
        <Link className="toolbar-link-home" to="/">
          К документам
        </Link>
      </header>

      {settings ? (
        <p className="docs-home-hint workspace-root-hint">
          Каталог данных:{" "}
          <code className="workspace-path">{settings.workspace_root}</code> (
          переменная <code>DOCS_AGENT_WORKSPACE</code>). См.{" "}
          <code>data/workspace/.example/</code> в репозитории.
        </p>
      ) : null}

      <form className="workspace-form" onSubmit={onSave}>
        <label className="workspace-field">
          <span>Название компании</span>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            autoComplete="organization"
          />
        </label>
        <label className="workspace-field">
          <span>Юрисдикция</span>
          <input
            type="text"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
          />
        </label>
        <label className="workspace-field">
          <span>Язык</span>
          <input
            type="text"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          />
        </label>
        <label className="workspace-field">
          <span>Инструкции по структуре генерации</span>
          <textarea
            value={structureInstructions}
            onChange={(e) => setStructureInstructions(e.target.value)}
            rows={10}
            placeholder="Корпоративные правила разделов, обязательные блоки…"
          />
        </label>
        <div className="workspace-actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </form>

      <WorkspaceChecklistSection />

      <WorkspaceAgentsSection />

      <section className="workspace-rag">
        <h2 className="workspace-section-title">Корпус RAG</h2>
        {rag ? (
          <p className="docs-home-hint">
            Фрагментов в индексе: {rag.chunks}. С эмбеддингами:{" "}
            {rag.chunks_with_embeddings}. API эмбеддингов:{" "}
            {rag.embeddings_configured ? "да" : "нет (поиск по словам)"}.
          </p>
        ) : null}
        <label className="workspace-upload">
          <span className="workspace-upload-label">Загрузить в корпус</span>
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={onRagFile}
          />
        </label>
        {ingestMsg ? <p className="workspace-ingest-msg">{ingestMsg}</p> : null}
      </section>
    </div>
  );
}
