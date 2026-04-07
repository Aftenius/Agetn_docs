import type { AgentInfo } from "./api";
import { scrollEditorToQuote } from "./ContractEditor";
import {
  formatAnalyzeHistoryDate,
  type AnalyzeHistoryEntry,
  type AnalyzePayload,
  type DoNotDiscloseItem,
  type Finding,
} from "./documents/analyzeHistory";

export type { AnalyzePayload } from "./documents/analyzeHistory";

type Props = {
  agents: AgentInfo[];
  agentId: string;
  onAgentChange: (id: string) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  error: string | null;
  data: AnalyzePayload | null;
  analyzeHistory: AnalyzeHistoryEntry[];
  onSelectAnalyzeHistory: (entry: AnalyzeHistoryEntry) => void;
};

export function AgentPanel({
  agents,
  agentId,
  onAgentChange,
  onAnalyze,
  analyzing,
  error,
  data,
  analyzeHistory,
  onSelectAnalyzeHistory,
}: Props) {
  return (
    <>
      <div className="side-header">Проверка и подсказки</div>
      <div className="side-body">
        <div className="field" style={{ marginBottom: "0.75rem" }}>
          <label>Роль агента</label>
          <select
            value={agentId}
            onChange={(e) => onAgentChange(e.target.value)}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="primary"
          style={{ width: "100%", marginBottom: "0.75rem" }}
          disabled={analyzing}
          onClick={onAnalyze}
        >
          {analyzing ? "Анализ…" : "Проанализировать текст"}
        </button>
        {agents.length === 0 ? (
          <p className="muted">Загрузка ролей…</p>
        ) : null}
        {error ? (
          <div className="card sev-high" style={{ whiteSpace: "pre-wrap" }}>
            {error}
          </div>
        ) : null}
        {data ? <Results data={data} /> : null}
        {analyzeHistory.length > 0 ? (
          <>
            <div className="section-title analyze-history-section-title">
              История проверок
            </div>
            <p className="muted analyze-history-hint">
              Хранится в браузере (по документу), с датой и временем.
            </p>
            <ul className="analyze-history-list">
              {analyzeHistory.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="analyze-history-btn"
                    onClick={() => onSelectAnalyzeHistory(h)}
                  >
                    <span className="analyze-history-time">
                      {formatAnalyzeHistoryDate(h.at)}
                    </span>
                    <span className="analyze-history-meta">
                      {h.agentName ?? h.agentId}
                      {h.error ? " · ошибка" : h.payload ? "" : " · нет данных"}
                    </span>
                    {h.payload?.summary ? (
                      <span className="analyze-history-preview">
                        {h.payload.summary.slice(0, 120)}
                        {h.payload.summary.length > 120 ? "…" : ""}
                      </span>
                    ) : null}
                    {h.error && !h.payload ? (
                      <span className="analyze-history-preview">{h.error}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </>
  );
}

function QuoteToDocLink({ quote }: { quote?: string }) {
  const q = quote?.trim();
  if (!q || q.length < 3) return null;
  return (
    <button
      type="button"
      className="analyze-quote-link"
      onClick={() => scrollEditorToQuote(q)}
    >
      К фрагменту в тексте
    </button>
  );
}

function DoNotDiscloseBlock({ items }: { items: DoNotDiscloseItem[] }) {
  if (!items.length) return null;
  return (
    <>
      <div className="section-title do-not-disclose-title">
        Не для заказчика
      </div>
      <p className="muted do-not-disclose-intro">
        Не передавайте контрагенту. В договоре — переход по ссылке.
      </p>
      {items.map((d, i) => (
        <div key={i} className="card do-not-disclose-card">
          <div className="do-not-disclose-item-text">{d.item}</div>
          <QuoteToDocLink quote={d.quote} />
        </div>
      ))}
    </>
  );
}

function Results({ data }: { data: AnalyzePayload }) {
  return (
    <>
      {data.summary ? (
        <>
          <div className="section-title">Резюме</div>
          <div className="summary">{data.summary}</div>
        </>
      ) : null}

      {data.rag_sources_used && data.rag_sources_used.length > 0 ? (
        <>
          <div className="section-title">Опора корпуса</div>
          <p className="muted rag-sources-used">
            {data.rag_sources_used.join(", ")}
          </p>
        </>
      ) : null}

      <DoNotDiscloseBlock items={data.do_not_disclose_to_client ?? []} />

      {data.red_flags && data.red_flags.length > 0 ? (
        <>
          <div className="section-title">Красные флаги</div>
          <ul>
            {data.red_flags.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="section-title">Чего не хватает</div>
      <List items={data.missing} />

      <div className="section-title">Риски и замечания</div>
      <List items={data.warnings} />

      <div className="section-title">Рекомендации</div>
      <List items={data.suggestions} showRef />

      {data.checklist_passed && data.checklist_passed.length > 0 ? (
        <>
          <div className="section-title">Чек-лист</div>
          {data.checklist_passed.map((c) => (
            <div key={c.id} className="card sev-low">
              <div className="checklist-row">
                <span>
                  <strong>{c.passed ? "✓" : "○"}</strong> {c.label}
                </span>
                <QuoteToDocLink quote={c.quote} />
              </div>
              {c.note ? <div className="muted">{c.note}</div> : null}
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}

function List({
  items,
  showRef,
}: {
  items?: Finding[];
  showRef?: boolean;
}) {
  if (!items || items.length === 0) {
    return <p className="muted">Нет пунктов.</p>;
  }
  return (
    <>
      {items.map((it, i) => (
        <div
          key={i}
          className={`card ${sevClass(it.severity)}`}
        >
          <div className="finding-row">
            <span>{it.item}</span>
            <QuoteToDocLink quote={it.quote} />
          </div>
          {showRef && it.reference ? (
            <div className="muted">{it.reference}</div>
          ) : null}
        </div>
      ))}
    </>
  );
}

function sevClass(s?: string) {
  if (s === "high") return "sev-high";
  if (s === "medium") return "sev-medium";
  return "sev-low";
}
