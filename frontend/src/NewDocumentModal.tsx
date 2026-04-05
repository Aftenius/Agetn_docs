import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { generateStructure } from "./api";
import { createDocument, DEFAULT_DOCUMENT_HTML } from "./documents/store";

type Props = {
  onClose: () => void;
};

export function NewDocumentModal({ onClose }: Props) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("Новый договор");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onCreateEmpty = () => {
    const t = title.trim() || "Без названия";
    const d = createDocument(DEFAULT_DOCUMENT_HTML, t);
    onClose();
    navigate(`/doc/${d.id}`);
  };

  const onGenerate = async () => {
    const t = title.trim() || "Без названия";
    const s = subject.trim();
    if (!s) {
      setErr("Кратко опишите, о чём договор.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const { html } = await generateStructure({ title: t, subject: s });
      const d = createDocument(html, t);
      onClose();
      navigate(`/doc/${d.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="wizard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-doc-title"
      onClick={onClose}
    >
      <div className="wizard new-doc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wizard-header">
          <h2 id="new-doc-title">Новый документ</h2>
          <button
            type="button"
            className="wizard-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <span className="material-symbols-outlined" aria-hidden>
              close
            </span>
          </button>
        </div>
        {err ? (
          <div className="card sev-high" style={{ marginBottom: "0.75rem" }}>
            {err}
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="new-doc-name">Название</label>
          <input
            id="new-doc-name"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="field" style={{ marginTop: "0.65rem" }}>
          <label htmlFor="new-doc-subject">О чём договор (для генерации структуры)</label>
          <textarea
            id="new-doc-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Например: оказание услуг между ООО «Заказчик» и ООО «Исполнитель», срок 6 месяцев, оплата по актам…"
            rows={5}
          />
        </div>
        <div className="wizard-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="button" onClick={onCreateEmpty} disabled={busy}>
            Только пустой
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void onGenerate()}
          >
            {busy ? "Генерация…" : "Сгенерировать структуру"}
          </button>
        </div>
      </div>
    </div>
  );
}
