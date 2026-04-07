import {
  deleteDocumentApi,
  fetchDocumentApi,
  fetchDocumentsListApi,
  postDocumentApi,
  putDocumentApi,
} from "../api";
import { randomUUID } from "../utils/randomUUID";

export type StoredDocument = {
  id: string;
  title: string;
  html: string;
  updatedAt: string;
};

const LIBRARY_KEY = "docs-agent-library-v1";
const LEGACY_EDITOR_KEY = "docs-agent-editor-html";

export const DEFAULT_DOCUMENT_HTML = `
<h1 style="text-align: center">Договор № [уточнить: номер]</h1>
<p><br></p>
<p><strong>г. [уточнить: город]</strong> «[уточнить: дата]»</p>
<p><br></p>
<p>Начните ввод с мастера или «Сгенерировать структуру». Справа — проверка ИИ.</p>
<h2>1. [уточнить: раздел]</h2>
<p>[уточнить: текст]</p>
<table>
  <tbody>
  <tr>
    <td><p><strong>Заказчик:</strong> [уточнить: реквизиты]</p></td>
    <td><p><strong>Исполнитель:</strong> [уточнить: реквизиты]</p></td>
  </tr>
  </tbody>
</table>
<table>
  <tbody>
  <tr><td><strong>Заказчик</strong></td><td><strong>Исполнитель</strong></td></tr>
  <tr><td></td><td></td></tr>
  </tbody>
</table>
`.trim();

function writeRaw(docs: StoredDocument[]) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(docs));
}

let migrationDone = false;

function ensureMigrated() {
  if (migrationDone) return;
  if (localStorage.getItem(LIBRARY_KEY) !== null) {
    migrationDone = true;
    return;
  }
  migrationDone = true;
  const legacy = localStorage.getItem(LEGACY_EDITOR_KEY)?.trim();
  if (legacy) {
    const doc: StoredDocument = {
      id: randomUUID(),
      title: deriveTitle(legacy),
      html: legacy,
      updatedAt: new Date().toISOString(),
    };
    writeRaw([doc]);
  } else {
    writeRaw([]);
  }
}

function readRaw(): StoredDocument[] {
  ensureMigrated();
  try {
    const s = localStorage.getItem(LIBRARY_KEY);
    if (!s) return [];
    const parsed = JSON.parse(s) as StoredDocument[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeServerRow(row: {
  id: string;
  title?: string;
  html?: string;
  updatedAt?: string;
  updated_at?: string;
}): StoredDocument {
  return {
    id: row.id,
    title: row.title ?? "",
    html: row.html ?? "",
    updatedAt: row.updatedAt || row.updated_at || new Date().toISOString(),
  };
}

/** Подтянуть список документов с сервера в localStorage. false = сеть или ошибка API. */
export async function syncDocumentsFromServer(): Promise<boolean> {
  try {
    const rows = await fetchDocumentsListApi();
    const docs = rows.map((r) => normalizeServerRow(r));
    const local = readRaw();
    if (docs.length > 0) {
      writeRaw(docs);
    } else if (local.length === 0) {
      writeRaw([]);
    }
    return true;
  } catch {
    return false;
  }
}

/** Если документа нет локально — запросить у сервера и добавить в хранилище. */
export async function ensureDocumentLoaded(
  id: string
): Promise<StoredDocument | null> {
  const local = getDocument(id);
  if (local) return local;
  try {
    const row = await fetchDocumentApi(id);
    if (!row) return null;
    const doc = normalizeServerRow(row);
    const docs = readRaw();
    if (!docs.some((d) => d.id === doc.id)) {
      docs.push(doc);
      writeRaw(docs);
    }
    return doc;
  } catch {
    return null;
  }
}

export function listDocuments(): StoredDocument[] {
  return readRaw()
    .slice()
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
}

export function getDocument(id: string): StoredDocument | null {
  return readRaw().find((d) => d.id === id) ?? null;
}

export function deriveTitle(html: string): string {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m) {
    const inner = m[1].replace(/<[^>]+>/g, "").trim();
    if (inner) return inner.slice(0, 120);
  }
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (plain) return plain.slice(0, 60);
  return "Без названия";
}

export function createDocument(
  html: string = DEFAULT_DOCUMENT_HTML,
  title?: string
): StoredDocument {
  const docs = readRaw();
  const now = new Date().toISOString();
  const doc: StoredDocument = {
    id: randomUUID(),
    title: title ?? deriveTitle(html),
    html,
    updatedAt: now,
  };
  docs.push(doc);
  writeRaw(docs);
  void postDocumentApi({
    id: doc.id,
    title: doc.title,
    html: doc.html,
    updatedAt: doc.updatedAt,
  }).catch(() => {});
  return doc;
}

export function updateDocument(
  id: string,
  patch: Partial<Pick<StoredDocument, "html" | "title">>
): StoredDocument | null {
  const docs = readRaw();
  const i = docs.findIndex((d) => d.id === id);
  if (i < 0) return null;
  const cur = docs[i];
  const next: StoredDocument = {
    ...cur,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  docs[i] = next;
  writeRaw(docs);
  void putDocumentApi({
    id: next.id,
    title: next.title,
    html: next.html,
    updatedAt: next.updatedAt,
  }).catch(() => {});
  return next;
}

export function deleteDocument(id: string): boolean {
  const docs = readRaw();
  const next = docs.filter((d) => d.id !== id);
  if (next.length === docs.length) return false;
  writeRaw(next);
  void deleteDocumentApi(id).catch(() => {});
  return true;
}
