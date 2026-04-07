const API = "";

/** Сообщение при обрыве сети / CORS (в т.ч. «Failed to fetch»). */
export function networkErrorMessage(err: unknown): string {
  if (err instanceof TypeError) {
    return (
      "Нет связи с сервером. Запустите backend (из каталога backend: uvicorn app.main:app), " +
      "используйте dev-режим фронта на порту 5173 (прокси /api) или откройте собранный SPA с порта 8000. " +
      "При доступе с другого адреса задайте в .env переменную DOCS_AGENT_CORS_ORIGINS."
    );
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Текст ошибки API (в т.ч. разбор FastAPI 422 validation). */
export async function readApiErrorMessage(r: Response): Promise<string> {
  const t = await r.text();
  try {
    const j = JSON.parse(t) as {
      detail?: string | Array<{ loc?: (string | number)[]; msg?: string }>;
    };
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) {
      return j.detail
        .map((d) => {
          const loc = Array.isArray(d.loc) ? d.loc.join(".") : "";
          const msg = d.msg ?? JSON.stringify(d);
          return loc ? `${loc}: ${msg}` : msg;
        })
        .join("\n");
    }
  } catch {
    /* не JSON */
  }
  return t.length > 2000 ? `${t.slice(0, 2000)}…` : t;
}

export type AgentInfo = {
  id: string;
  name: string;
  focus_sections: string[];
};

export async function fetchAgents(): Promise<AgentInfo[]> {
  const r = await fetch(`${API}/api/agents`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchDocSamples(): Promise<
  { id: string; name: string; format: string }[]
> {
  const r = await fetch(`${API}/api/doc-samples`);
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return j.samples ?? [];
}

export async function fetchTemplates(): Promise<string[]> {
  const r = await fetch(`${API}/api/templates`);
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return j.templates ?? [];
}

export async function analyzeContract(
  html: string,
  agentId: string
): Promise<unknown> {
  try {
    const r = await fetch(`${API}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, agent_id: agentId }),
    });
    if (!r.ok) {
      throw new Error(await readApiErrorMessage(r));
    }
    return r.json();
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(networkErrorMessage(e));
    }
    throw e;
  }
}

export type GenerateStructureBody = {
  title: string;
  subject: string;
  contract_format?: string;
  company_id?: string | null;
  our_party?: string;
  vat_mode?: string;
  vat_note?: string;
  total_amount?: string;
  amount_in_words?: string;
  acceptance_days?: number | null;
  payment_schedule_text?: string;
  extra_terms?: string;
  contract_number?: string;
  contract_date?: string;
};

export async function generateStructure(
  body: GenerateStructureBody
): Promise<{ html: string }> {
  const r = await fetch(`${API}/api/generate-structure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function fetchAmountInWords(value: string): Promise<{
  value: string;
  words: string;
}> {
  const r = await fetch(
    `${API}/api/amount-in-words?${new URLSearchParams({ value })}`
  );
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type WorkspaceCompany = {
  id: string;
  display_name: string;
  full_legal_name: string;
  address_legal: string;
  ogrn: string;
  inn: string;
  kpp: string;
  address_postal: string;
  bank_name: string;
  rs: string;
  ks: string;
  bik: string;
  signatory_title: string;
  signatory_name: string;
};

export async function fetchWorkspaceCompanies(): Promise<WorkspaceCompany[]> {
  const r = await fetch(`${API}/api/workspace/companies`);
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  const j = await r.json();
  return j.companies ?? [];
}

export async function putWorkspaceCompanies(
  companies: WorkspaceCompany[]
): Promise<{ companies: WorkspaceCompany[] }> {
  const r = await fetch(`${API}/api/workspace/companies`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companies }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type ServerDocument = {
  id: string;
  title: string;
  html: string;
  updatedAt: string;
};

export async function fetchDocumentsListApi(): Promise<ServerDocument[]> {
  const r = await fetch(`${API}/api/documents`);
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  const j = await r.json();
  return j.documents ?? [];
}

export async function fetchDocumentApi(
  id: string
): Promise<ServerDocument | null> {
  const r = await fetch(`${API}/api/documents/${encodeURIComponent(id)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function postDocumentApi(doc: ServerDocument): Promise<void> {
  const r = await fetch(`${API}/api/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: doc.id,
      title: doc.title,
      html: doc.html,
    }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
}

export async function putDocumentApi(doc: ServerDocument): Promise<void> {
  const r = await fetch(`${API}/api/documents/${encodeURIComponent(doc.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: doc.title, html: doc.html }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
}

export async function deleteDocumentApi(id: string): Promise<void> {
  const r = await fetch(`${API}/api/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!r.ok && r.status !== 404) {
    throw new Error(await readApiErrorMessage(r));
  }
}

export async function generateDraft(body: {
  contract_type: string;
  template_id?: string | null;
  fields: Record<string, string>;
  example_file_id?: string | null;
  use_llm: boolean;
}): Promise<{ html: string; source: string }> {
  const r = await fetch(`${API}/api/generate-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function downloadExport(
  kind: "pdf" | "docx",
  html: string
): Promise<Blob> {
  const r = await fetch(`${API}/api/export/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.blob();
}

export async function importDocx(file: File): Promise<{ html: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API}/api/import/docx`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export type WorkspaceSettings = {
  company_name: string;
  jurisdiction: string;
  language: string;
  generation: {
    structure_instructions?: string;
    /** Ставка НДС для генерации и промптов (по умолчанию на бэкенде 22). */
    vat_rate_percent?: number;
  };
  workspace_root: string;
};

export async function fetchWorkspaceSettings(): Promise<WorkspaceSettings> {
  const r = await fetch(`${API}/api/workspace/settings`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function patchWorkspaceSettings(
  patch: Partial<{
    company_name: string;
    jurisdiction: string;
    language: string;
    generation: {
      structure_instructions?: string;
      vat_rate_percent?: number;
    };
  }>
): Promise<WorkspaceSettings> {
  const r = await fetch(`${API}/api/workspace/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export type RagSourceStat = { source: string; chunks: number };

export type RagStatus = {
  chunks: number;
  chunks_with_embeddings: number;
  embeddings_configured: boolean;
  db_path: string;
  /** Список файлов в индексе (может отсутствовать у старых бэкендов) */
  sources?: RagSourceStat[];
};

export async function fetchRagStatus(): Promise<RagStatus> {
  const r = await fetch(`${API}/api/workspace/rag/status`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function ingestRagFile(file: File): Promise<{
  filename: string;
  chunks_added: number;
}> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API}/api/workspace/rag/ingest`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteRagSource(filename: string): Promise<{
  ok: boolean;
  source: string;
  chunks_removed: number;
}> {
  const r = await fetch(
    `${API}/api/workspace/rag/source?name=${encodeURIComponent(filename)}`,
    { method: "DELETE" }
  );
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function clearRagCorpus(): Promise<{
  ok: boolean;
  chunks_removed: number;
}> {
  const r = await fetch(`${API}/api/workspace/rag/clear`, { method: "POST" });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type WorkspaceChecklistResponse = {
  effective_source: string;
  effective_source_label: string;
  items: { id: string; label: string }[];
  workspace_json_path: string;
  docx_blocks_json_edit: boolean;
};

export async function fetchWorkspaceChecklist(): Promise<WorkspaceChecklistResponse> {
  const r = await fetch(`${API}/api/workspace/checklist`);
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function putWorkspaceChecklist(
  items: { id: string; label: string }[]
): Promise<WorkspaceChecklistResponse> {
  const r = await fetch(`${API}/api/workspace/checklist`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export type WorkspaceAgentDetail = {
  id: string;
  name: string;
  focus_sections: string[];
  system_prompt: string;
  source: "builtin" | "workspace";
  /** Есть ли встроенный yaml с тем же id в репозитории */
  has_builtin?: boolean;
};

export async function fetchWorkspaceAgents(): Promise<WorkspaceAgentDetail[]> {
  const r = await fetch(`${API}/api/workspace/agents`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function putWorkspaceAgent(
  agentId: string,
  body: {
    id: string;
    name: string;
    focus_sections: string[];
    system_prompt: string;
  }
): Promise<{ ok: boolean; id: string; path?: string }> {
  const r = await fetch(
    `${API}/api/workspace/agents/${encodeURIComponent(agentId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}

export async function deleteWorkspaceAgentOverride(agentId: string): Promise<{
  ok: boolean;
  message?: string;
}> {
  const r = await fetch(
    `${API}/api/workspace/agents/${encodeURIComponent(agentId)}`,
    { method: "DELETE" }
  );
  if (!r.ok) throw new Error(await readApiErrorMessage(r));
  return r.json();
}
