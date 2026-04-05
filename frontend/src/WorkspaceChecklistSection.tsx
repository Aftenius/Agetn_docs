import { useCallback, useEffect, useState } from "react";
import {
  fetchWorkspaceChecklist,
  putWorkspaceChecklist,
  type WorkspaceChecklistResponse,
} from "./api";

type Row = { key: string; id: string; label: string };

function rowsFromApi(items: { id: string; label: string }[]): Row[] {
  return items.map((it, i) => ({
    key: `${it.id}__${i}`,
    id: it.id,
    label: it.label,
  }));
}

export function WorkspaceChecklistSection() {
  const [meta, setMeta] = useState<WorkspaceChecklistResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const data = await fetchWorkspaceChecklist();
    setMeta(data);
    setRows(rowsFromApi(data.items));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await reload();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Ошибка загрузки чек-листа");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const addRow = () => {
    setRows((r) => [
      ...r,
      { key: `new-${Date.now()}-${Math.random()}`, id: "", label: "" },
    ]);
  };

  const removeRow = (key: string) => {
    setRows((r) => r.filter((x) => x.key !== key));
  };

  const moveRow = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    setRows((r) => {
      const next = [...r];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const updateRow = (key: string, patch: Partial<Pick<Row, "id" | "label">>) => {
    setRows((r) =>
      r.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  };

  const onSave = async () => {
    const payload = rows
      .map((x) => ({
        id: x.id.trim(),
        label: x.label.trim(),
      }))
      .filter((x) => x.label.length > 0);
    setSaving(true);
    setError(null);
    try {
      const data = await putWorkspaceChecklist(payload);
      setMeta(data);
      setRows(rowsFromApi(data.items));
      window.alert(
        "Чек-лист сохранён в workspace/checklist.json. Он используется в проверке договора, если нет DOCX с более высоким приоритетом."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const onReload = async () => {
    setLoading(true);
    setError(null);
    try {
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !meta) {
    return (
      <section className="workspace-checklist">
        <h2 className="workspace-section-title">Чек-лист проверки</h2>
        <p className="muted">Загрузка…</p>
      </section>
    );
  }

  return (
    <section className="workspace-checklist">
      <h2 className="workspace-section-title">Чек-лист проверки</h2>
      <p className="docs-home-hint">
        Пункты передаются в ИИ при анализе договора. Сохранение всегда пишет{" "}
        <code>checklist.json</code> в workspace:{" "}
        <code className="workspace-path">
          {meta?.workspace_json_path ?? "…"}
        </code>
      </p>
      {meta?.docx_blocks_json_edit ? (
        <div className="card workspace-checklist-warn">
          Сейчас для проверки берётся <strong>DOCX</strong> чек-листа из workspace (
          приоритет выше, чем у JSON). Редактирование ниже сохранит JSON на диск; он
          начнёт применяться после удаления или переименования DOCX «ФИНАЛЬНЫЙ
          ЧЕК-ЛИСТ» в workspace.
        </div>
      ) : null}
      {meta ? (
        <p className="docs-home-hint">
          Активный источник пунктов: <strong>{meta.effective_source_label}</strong>
        </p>
      ) : null}
      {error ? (
        <div className="card sev-high" style={{ whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      ) : null}

      <div className="workspace-checklist-toolbar">
        <button type="button" className="primary" disabled={saving} onClick={onSave}>
          {saving ? "Сохранение…" : "Сохранить чек-лист"}
        </button>
        <button type="button" disabled={saving} onClick={onReload}>
          Загрузить с сервера
        </button>
      </div>

      <div className="workspace-checklist-table-wrap">
        <table className="workspace-checklist-table">
          <thead>
            <tr>
              <th className="workspace-checklist-col-id">id</th>
              <th>Текст пункта</th>
              <th className="workspace-checklist-col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key}>
                <td>
                  <input
                    type="text"
                    className="workspace-checklist-input-id"
                    value={row.id}
                    onChange={(e) => updateRow(row.key, { id: e.target.value })}
                    placeholder="авто из текста"
                    spellCheck={false}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="workspace-checklist-input-label"
                    value={row.label}
                    onChange={(e) =>
                      updateRow(row.key, { label: e.target.value })
                    }
                  />
                </td>
                <td className="workspace-checklist-actions">
                  <button
                    type="button"
                    title="Выше"
                    disabled={index === 0}
                    onClick={() => moveRow(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    title="Ниже"
                    disabled={index === rows.length - 1}
                    onClick={() => moveRow(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="danger-outline"
                    title="Удалить строку"
                    onClick={() => removeRow(row.key)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="muted workspace-checklist-empty-hint">
            Пока нет пунктов — добавьте первый кнопкой ниже.
          </p>
        ) : null}
        <div className="workspace-checklist-add-row">
          <button type="button" disabled={saving} onClick={addRow}>
            + Добавить пункт
          </button>
        </div>
      </div>
    </section>
  );
}
