import {
  type ChangeEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { importDocx } from "./api";
import {
  createDocument,
  deleteDocument,
  listDocuments,
  syncDocumentsFromServer,
  type StoredDocument,
} from "./documents/store";
import { NewDocumentModal } from "./NewDocumentModal";

async function fileToHtml(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "docx") {
    const { html } = await importDocx(file);
    return html;
  }
  const text = await file.text();
  if (ext === "html" || ext === "htm") return text;
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const blocks = text
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p.trim())}</p>`)
    .join("");
  return blocks || `<p>${esc(text)}</p>`;
}

export function DocumentsHome() {
  const [listVersion, setListVersion] = useState(0);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [serverHint, setServerHint] = useState<string | null>(null);
  const navigate = useNavigate();
  const uploadRef = useRef<HTMLInputElement>(null);

  const docs = useMemo(() => listDocuments(), [listVersion]);

  const refresh = () => setListVersion((v) => v + 1);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await syncDocumentsFromServer();
      if (!cancelled) {
        if (ok) {
          refresh();
          setServerHint(null);
        } else {
          setServerHint(
            "Документы только в браузере: сервер недоступен или каталог workspace/documents не отвечает."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const html = await fileToHtml(file);
      const d = createDocument(html);
      refresh();
      navigate(`/doc/${d.id}`);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Не удалось импортировать файл"
      );
    }
  };

  const onDelete = (ev: MouseEvent, docId: string) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!window.confirm("Удалить документ?")) return;
    deleteDocument(docId);
    refresh();
  };

  return (
    <div className="docs-home">
      <header className="docs-home-header">
        <h1>Документы</h1>
        <div className="docs-home-actions">
          <Link className="toolbar-link-home" to="/workspace">
            Workspace
          </Link>
          <button
            type="button"
            className="primary"
            onClick={() => setNewModalOpen(true)}
          >
            Новый документ
          </button>
          <button type="button" onClick={() => uploadRef.current?.click()}>
            Загрузить…
          </button>
          <input
            ref={uploadRef}
            type="file"
            hidden
            accept=".html,.htm,.txt,.docx"
            onChange={onUpload}
          />
        </div>
      </header>
      <p className="docs-home-hint">
        Черновики синхронизируются с сервером (каталог <code>workspace/documents</code>
        при работающем backend). В браузере остаётся копия. Поддерживаются HTML, TXT и
        DOCX (конвертация через сервер).
      </p>
      {serverHint ? (
        <p className="docs-home-hint" style={{ color: "#b06000" }}>
          {serverHint}
        </p>
      ) : null}
      {docs.length === 0 ? (
        <p className="docs-home-empty">Нет сохранённых документов.</p>
      ) : (
        <ul className="docs-list">
          {docs.map((d: StoredDocument) => (
            <li key={d.id}>
              <Link className="docs-list-link" to={`/doc/${d.id}`}>
                <span className="docs-list-title">{d.title}</span>
                <span className="docs-list-meta">
                  {new Date(d.updatedAt).toLocaleString("ru-RU")}
                </span>
              </Link>
              <button
                type="button"
                className="docs-list-delete"
                title="Удалить"
                onClick={(ev) => onDelete(ev, d.id)}
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}
      {newModalOpen ? (
        <NewDocumentModal onClose={() => setNewModalOpen(false)} />
      ) : null}
    </div>
  );
}
