import { randomUUID } from "../utils/randomUUID";

export type Finding = {
  item: string;
  severity?: string;
  reference?: string;
  note?: string;
  /** Фрагмент из договора для перехода к месту в редакторе */
  quote?: string;
};

export type DoNotDiscloseItem = {
  item: string;
  quote?: string;
};

export type AnalyzePayload = {
  summary?: string;
  missing?: Finding[];
  warnings?: Finding[];
  suggestions?: Finding[];
  checklist_passed?: {
    id: string;
    label: string;
    passed: boolean;
    note?: string;
    quote?: string;
  }[];
  red_flags?: string[];
  /** Нельзя передавать заказчику — показываем с максимальным акцентом */
  do_not_disclose_to_client?: DoNotDiscloseItem[];
  /** Метки фрагментов корпуса RAG, на которые опирался анализ (имя_файла#N) */
  rag_sources_used?: string[];
};

export type AnalyzeHistoryEntry = {
  id: string;
  at: string;
  agentId: string;
  agentName?: string;
  payload?: AnalyzePayload;
  error?: string;
};

const STORAGE_KEY = "docs-agent-analyze-history-v1";
const MAX_PER_DOC = 50;

function readAll(): Record<string, AnalyzeHistoryEntry[]> {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return {};
    const p = JSON.parse(s) as Record<string, AnalyzeHistoryEntry[]>;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, AnalyzeHistoryEntry[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getAnalyzeHistory(docId: string): AnalyzeHistoryEntry[] {
  const all = readAll();
  const list = all[docId];
  if (!Array.isArray(list)) return [];
  return list
    .slice()
    .sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );
}

export function appendAnalyzeHistory(
  docId: string,
  entry: Omit<AnalyzeHistoryEntry, "id"> & { id?: string }
): AnalyzeHistoryEntry {
  const all = readAll();
  const row: AnalyzeHistoryEntry = {
    id: entry.id ?? randomUUID(),
    at: entry.at,
    agentId: entry.agentId,
    agentName: entry.agentName,
    payload: entry.payload,
    error: entry.error,
  };
  const cur = Array.isArray(all[docId]) ? all[docId] : [];
  const next = [row, ...cur.filter((x) => x.id !== row.id)].slice(
    0,
    MAX_PER_DOC
  );
  all[docId] = next;
  writeAll(all);
  return row;
}

export function getLastSuccessPayload(
  docId: string
): AnalyzePayload | null {
  const h = getAnalyzeHistory(docId);
  const hit = h.find((e) => e.payload);
  return hit?.payload ?? null;
}

export function formatAnalyzeHistoryDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
