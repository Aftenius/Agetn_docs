import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  deleteWorkspaceAgentOverride,
  fetchWorkspaceAgents,
  putWorkspaceAgent,
  type WorkspaceAgentDetail,
} from "./api";

function focusLinesToText(sections: string[]): string {
  return sections.length ? sections.join("\n") : "";
}

function textToFocusLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function WorkspaceAgentsSection() {
  const [agents, setAgents] = useState<WorkspaceAgentDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [idLocked, setIdLocked] = useState(false);
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formFocusText, setFormFocusText] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await fetchWorkspaceAgents();
      setAgents(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Ошибка загрузки агентов");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const openCreate = () => {
    setFormOpen(true);
    setIdLocked(false);
    setFormId("");
    setFormName("");
    setFormFocusText("");
    setFormPrompt("");
  };

  const openEdit = (a: WorkspaceAgentDetail) => {
    setFormOpen(true);
    setIdLocked(true);
    setFormId(a.id);
    setFormName(a.name);
    setFormFocusText(focusLinesToText(a.focus_sections));
    setFormPrompt(a.system_prompt);
  };

  const openDuplicateFromBuiltin = (a: WorkspaceAgentDetail) => {
    const base = `${a.id}_custom`.slice(0, 64);
    setFormOpen(true);
    setIdLocked(false);
    setFormId(base);
    setFormName(a.name);
    setFormFocusText(focusLinesToText(a.focus_sections));
    setFormPrompt(a.system_prompt);
  };

  const closeForm = () => {
    setFormOpen(false);
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const id = formId.trim();
    if (!id) {
      window.alert("Укажите id агента (латиница, цифры, _ и -).");
      return;
    }
    const focus = textToFocusLines(formFocusText);
    setSaving(true);
    try {
      await putWorkspaceAgent(id, {
        id,
        name: formName.trim() || id,
        focus_sections: focus,
        system_prompt: formPrompt,
      });
      await reload();
      closeForm();
      window.alert(
        "Агент сохранён в workspace. Он появится в списке ролей в редакторе."
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteWorkspaceAgent = async (a: WorkspaceAgentDetail) => {
    if (a.source !== "workspace") return;
    const hasBuiltin = a.has_builtin ?? false;
    const msg = hasBuiltin
      ? `Удалить агента «${a.name}» из workspace?\n\nВернётся встроенная версия из репозитория (если она есть).`
      : `Удалить агента «${a.name}» (${a.id})? Файл в workspace будет удалён безвозвратно.`;
    if (!window.confirm(msg)) return;
    try {
      await deleteWorkspaceAgentOverride(a.id);
      await reload();
      window.alert(hasBuiltin ? "Файл workspace удалён." : "Агент удалён.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Ошибка удаления");
    }
  };

  return (
    <section className="workspace-agents">
      <h2 className="workspace-section-title">Агенты проверки</h2>
      <p className="docs-home-hint">
        Агенты хранятся в <code>workspace/agents/*.yaml</code>. Поле{" "}
        <strong>id</strong> — только латиница, цифры, <code>_</code> и <code>-</code>{" "}
        (без пробелов и без кириллицы в id). Имя на русском укажите в «Название в
        интерфейсе». Встроенные роли можно переопределить тем же <code>id</code>.
      </p>
      {loadError ? (
        <div className="card sev-high" style={{ whiteSpace: "pre-wrap" }}>
          {loadError}
        </div>
      ) : null}
      {!loading && !loadError ? (
        <div className="workspace-agents-toolbar">
          <button type="button" className="primary" onClick={openCreate}>
            Создать агента
          </button>
        </div>
      ) : null}
      {loading ? (
        <p className="muted">Загрузка списка…</p>
      ) : (
        <ul className="workspace-agents-list">
          {agents.map((a) => (
            <li key={a.id} className="workspace-agents-row">
              <div className="workspace-agents-row-main">
                <strong>{a.name}</strong>{" "}
                <code className="workspace-agents-id">{a.id}</code>
                <span
                  className={
                    a.source === "workspace"
                      ? "workspace-agents-badge workspace-agents-badge-ws"
                      : "workspace-agents-badge workspace-agents-badge-in"
                  }
                >
                  {a.source === "workspace" ? "workspace" : "встроенный"}
                </span>
              </div>
              <div className="workspace-agents-row-actions">
                <button type="button" onClick={() => openEdit(a)}>
                  Редактировать
                </button>
                {a.source === "builtin" ? (
                  <button
                    type="button"
                    onClick={() => openDuplicateFromBuiltin(a)}
                    title="Сохранить копию в workspace с новым id"
                  >
                    Копировать в workspace
                  </button>
                ) : null}
                {a.source === "workspace" ? (
                  <button
                    type="button"
                    className="danger-outline"
                    onClick={() => onDeleteWorkspaceAgent(a)}
                  >
                    Удалить
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <div className="workspace-agents-form-wrap">
          <form className="workspace-agents-form" onSubmit={onSubmit}>
            <h3 className="workspace-agents-form-title">
              {idLocked ? `Редактирование: ${formId}` : "Новый агент"}
            </h3>
            <label className="workspace-field">
              <span>id (латиница, цифры, _ и -; например risk_officer)</span>
              <input
                type="text"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                disabled={idLocked}
                required
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="workspace-field">
              <span>Название в интерфейсе</span>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </label>
            <label className="workspace-field">
              <span>Фокус проверки (одна строка — один пункт)</span>
              <textarea
                value={formFocusText}
                onChange={(e) => setFormFocusText(e.target.value)}
                rows={5}
                placeholder="структура договора&#10;…"
              />
            </label>
            <label className="workspace-field">
              <span>Системный промпт (роль и требование JSON)</span>
              <textarea
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
                rows={10}
                required
              />
            </label>
            <div className="workspace-agents-form-actions">
              <button type="submit" className="primary" disabled={saving}>
                {saving ? "Сохранение…" : "Сохранить в workspace"}
              </button>
              <button type="button" onClick={closeForm} disabled={saving}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
