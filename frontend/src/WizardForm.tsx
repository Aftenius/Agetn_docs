import { useEffect, useState } from "react";
import {
  fetchDocSamples,
  fetchTemplates,
  fetchWorkspaceSettings,
  generateDraft,
} from "./api";
import { applyEditorHtml } from "./ContractEditor";

type Props = {
  onClose: () => void;
  onApplied?: (html: string) => void;
};

const defaultFieldsSupply: Record<string, string> = {
  contract_no: "",
  city: "Москва",
  contract_date: "",
  supplier_name: "",
  supplier_inn: "",
  supplier_address: "",
  buyer_name: "",
  buyer_inn: "",
  buyer_address: "",
  subject: "",
  amount: "",
  currency: "руб.",
  vat_text: "в том числе НДС 22%",
  payment_terms: "",
  delivery_terms: "",
  acceptance_terms: "",
  liability_terms: "",
  dispute_terms: "",
  final_terms: "",
  supplier_sign: "_______________",
  buyer_sign: "_______________",
};

const defaultFieldsServices: Record<string, string> = {
  ...defaultFieldsSupply,
  customer_name: "",
  customer_inn: "",
  customer_address: "",
  contractor_name: "",
  contractor_inn: "",
  contractor_address: "",
  schedule: "",
  nda: "",
  customer_sign: "_______________",
  contractor_sign: "_______________",
};

export function WizardForm({ onClose, onApplied }: Props) {
  const [contractType, setContractType] = useState<"supply" | "services">(
    "supply"
  );
  const [templateId, setTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<string[]>([]);
  const [samples, setSamples] = useState<{ id: string; name: string }[]>([]);
  const [exampleId, setExampleId] = useState<string>("");
  const [useLlm, setUseLlm] = useState(true);
  const [fields, setFields] = useState<Record<string, string>>(() => ({
    ...defaultFieldsServices,
  }));
  const [vatRateFromWs, setVatRateFromWs] = useState(22);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates().then(setTemplates).catch(() => setTemplates([]));
    fetchDocSamples()
      .then((s) => setSamples(s))
      .catch(() => setSamples([]));
    fetchWorkspaceSettings()
      .then((ws) => {
        const vr = ws.generation?.vat_rate_percent;
        if (typeof vr === "number" && vr >= 0 && vr <= 100) {
          setVatRateFromWs(vr);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const vatLine = `в том числе НДС ${vatRateFromWs}%`;
    if (contractType === "supply") {
      setFields({ ...defaultFieldsSupply, vat_text: vatLine });
      const def =
        templates.find((t) => t.includes("supply")) ?? "supply.html.j2";
      setTemplateId(def);
    } else {
      setFields({ ...defaultFieldsServices, vat_text: vatLine });
      const def =
        templates.find((t) => t.includes("services")) ?? "services.html.j2";
      setTemplateId(def);
    }
  }, [contractType, templates, vatRateFromWs]);

  const setField = (k: string, v: string) => {
    setFields((f) => ({ ...f, [k]: v }));
  };

  const submit = async (onlyJinja: boolean) => {
    setErr(null);
    setBusy(true);
    try {
      const r = await generateDraft({
        contract_type: contractType,
        template_id: templateId || null,
        fields,
        example_file_id: exampleId || null,
        use_llm: onlyJinja ? false : useLlm,
      });
      applyEditorHtml(r.html);
      onApplied?.(r.html);
      onClose();
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
      aria-labelledby="wizard-dialog-title"
    >
      <div className="wizard">
        <div className="wizard-header">
          <h2 id="wizard-dialog-title">Мастер договора</h2>
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
        <div className="grid2">
          <div className="field">
            <label>Тип</label>
            <select
              value={contractType}
              onChange={(e) =>
                setContractType(e.target.value as "supply" | "services")
              }
            >
              <option value="services">Услуги</option>
              <option value="supply">Поставка</option>
            </select>
          </div>
          <div className="field">
            <label>Шаблон</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field" style={{ marginTop: "0.65rem" }}>
          <label>Пример из папки docs (необязательно)</label>
          <select
            value={exampleId}
            onChange={(e) => setExampleId(e.target.value)}
          >
            <option value="">— не использовать —</option>
            {samples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: "0.65rem" }}>
          <label>
            <input
              type="checkbox"
              checked={useLlm}
              onChange={(e) => setUseLlm(e.target.checked)}
            />{" "}
            Улучшить черновик через DeepSeek (если ключ не задан — снимите
            флажок)
          </label>
        </div>

        <h3 style={{ fontSize: "0.95rem", margin: "1rem 0 0.5rem" }}>
          Поля
        </h3>
        <div className="grid2">
          <Field label="Номер договора" k="contract_no" {...{ fields, setField }} />
          <Field label="Дата" k="contract_date" {...{ fields, setField }} />
          <Field label="Город" k="city" {...{ fields, setField }} />
          <Field label="Сумма" k="amount" {...{ fields, setField }} />
          <Field label="Валюта" k="currency" {...{ fields, setField }} />
          <Field label="НДС (текстом)" k="vat_text" {...{ fields, setField }} />
        </div>
        {contractType === "supply" ? (
          <>
            <div className="grid2" style={{ marginTop: "0.5rem" }}>
              <Field label="Поставщик" k="supplier_name" {...{ fields, setField }} />
              <Field label="ИНН поставщика" k="supplier_inn" {...{ fields, setField }} />
              <Field label="Адрес поставщика" k="supplier_address" {...{ fields, setField }} />
              <Field label="Покупатель" k="buyer_name" {...{ fields, setField }} />
              <Field label="ИНН покупателя" k="buyer_inn" {...{ fields, setField }} />
              <Field label="Адрес покупателя" k="buyer_address" {...{ fields, setField }} />
            </div>
          </>
        ) : (
          <>
            <div className="grid2" style={{ marginTop: "0.5rem" }}>
              <Field label="Заказчик" k="customer_name" {...{ fields, setField }} />
              <Field label="ИНН заказчика" k="customer_inn" {...{ fields, setField }} />
              <Field label="Исполнитель" k="contractor_name" {...{ fields, setField }} />
              <Field label="ИНН исполнителя" k="contractor_inn" {...{ fields, setField }} />
            </div>
          </>
        )}
        <div className="field" style={{ marginTop: "0.5rem" }}>
          <label>Предмет (кратко)</label>
          <textarea
            value={fields.subject ?? ""}
            onChange={(e) => setField("subject", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Оплата</label>
          <textarea
            value={fields.payment_terms ?? ""}
            onChange={(e) => setField("payment_terms", e.target.value)}
          />
        </div>

        <div className="wizard-actions">
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button type="button" disabled={busy} onClick={() => submit(true)}>
            Только шаблон (без ИИ)
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => submit(false)}
          >
            {busy ? "Генерация…" : "Вставить в редактор"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  k,
  fields,
  setField,
}: {
  label: string;
  k: string;
  fields: Record<string, string>;
  setField: (k: string, v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        value={fields[k] ?? ""}
        onChange={(e) => setField(k, e.target.value)}
      />
    </div>
  );
}
