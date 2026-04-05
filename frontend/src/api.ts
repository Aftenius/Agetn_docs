const API = "";

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
  const r = await fetch(`${API}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, agent_id: agentId }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t);
  }
  return r.json();
}

export async function generateStructure(body: {
  title: string;
  subject: string;
}): Promise<{ html: string }> {
  const r = await fetch(`${API}/api/generate-structure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
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
  generation: { structure_instructions?: string };
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
    generation: { structure_instructions: string };
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

export type RagStatus = {
  chunks: number;
  chunks_with_embeddings: number;
  embeddings_configured: boolean;
  db_path: string;
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
