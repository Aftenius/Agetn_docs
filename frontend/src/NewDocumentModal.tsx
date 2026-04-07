import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAmountInWords,
  fetchWorkspaceCompanies,
  fetchWorkspaceSettings,
  generateStructure,
  type WorkspaceCompany,
} from "./api";
import { createDocument, DEFAULT_DOCUMENT_HTML } from "./documents/store";

type Props = {
  onClose: () => void;
};

function todayRu(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function NewDocumentModal({ onClose }: Props) {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<WorkspaceCompany[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [ourParty, setOurParty] = useState<"supplier" | "buyer">("supplier");
  const [contractNo, setContractNo] = useState("00001");
  const [contractDate, setContractDate] = useState(todayRu);
  const [vatMode, setVatMode] = useState<"vat20" | "no_vat">("vat20");
  const [vatRatePercent, setVatRatePercent] = useState(22);
  const [vatNote, setVatNote] = useState(
    "Участник проекта Сколково / иное основание льготы — уточнить"
  );
  const [totalAmount, setTotalAmount] = useState("");
  const [amountWords, setAmountWords] = useState("");
  const [wordsLoading, setWordsLoading] = useState(false);
  const [acceptanceDays, setAcceptanceDays] = useState<string>("");
  const [paymentSchedule, setPaymentSchedule] = useState(
    "30% аванс, 30% после приёмки, 40% после подписания акта ввода"
  );
  const [extraTerms, setExtraTerms] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const composedTitle = useMemo(() => {
    const n = contractNo.trim() || "—";
    const dt = contractDate.trim() || "—";
    return `Договор поставки № ${n} от ${dt} г.`;
  }, [contractNo, contractDate]);

  useEffect(() => {
    let c = false;
    Promise.all([fetchWorkspaceCompanies(), fetchWorkspaceSettings()])
      .then(([list, ws]) => {
        if (c) return;
        setCompanies(list);
        const vr = ws.generation?.vat_rate_percent;
        if (typeof vr === "number" && vr >= 0 && vr <= 100) {
          setVatRatePercent(vr);
        }
      })
      .catch(() => {
        if (!c) setCompanies([]);
      });
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    const s = totalAmount.trim().replace(/\s/g, "").replace(",", ".");
    if (!s || Number.isNaN(Number(s))) {
      setAmountWords("");
      return;
    }
    let cancelled = false;
    setWordsLoading(true);
    const t = window.setTimeout(() => {
      void fetchAmountInWords(s)
        .then((r) => {
          if (!cancelled) setAmountWords(r.words);
        })
        .catch(() => {
          if (!cancelled) setAmountWords("");
        })
        .finally(() => {
          if (!cancelled) setWordsLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [totalAmount]);

  const onCreateEmpty = () => {
    const t = composedTitle.trim() || "Без названия";
    const d = createDocument(DEFAULT_DOCUMENT_HTML, t);
    onClose();
    navigate(`/doc/${d.id}`);
  };

  const onGenerate = async () => {
    const s = subject.trim();
    if (!s) {
      setErr("Кратко опишите предмет договора и контрагента.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const acceptNum = acceptanceDays.trim()
        ? parseInt(acceptanceDays.trim(), 10)
        : null;
      const { html } = await generateStructure({
        title: composedTitle,
        subject: s,
        contract_format: "supply",
        company_id: companyId || null,
        our_party: ourParty,
        vat_mode: vatMode,
        vat_note: vatMode === "no_vat" ? vatNote : "",
        total_amount: totalAmount.trim(),
        amount_in_words: amountWords,
        acceptance_days:
          acceptNum !== null && !Number.isNaN(acceptNum) ? acceptNum : null,
        payment_schedule_text: paymentSchedule,
        extra_terms: extraTerms,
        contract_number: contractNo.trim(),
        contract_date: contractDate.trim(),
      });
      const d = createDocument(html, composedTitle);
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
          <h2 id="new-doc-title">Создание договора</h2>
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

        <section className="new-doc-section">
          <h3 className="new-doc-section-title">№ договора и дата</h3>
          <div className="new-doc-row">
            <label className="field">
              <span>Номер</span>
              <input
                value={contractNo}
                onChange={(e) => setContractNo(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Дата</span>
              <input
                value={contractDate}
                onChange={(e) => setContractDate(e.target.value)}
                placeholder="ДД.ММ.ГГГГ"
                autoComplete="off"
              />
            </label>
          </div>
          <p className="muted new-doc-preview-title">{composedTitle}</p>
        </section>

        <section className="new-doc-section">
          <h3 className="new-doc-section-title">Наша организация</h3>
          <label className="field">
            <span>Компания из workspace</span>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">— не выбрано —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name || c.id}
                </option>
              ))}
            </select>
          </label>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.35rem" }}>
            Справочник настраивается в Workspace. Реквизиты подставятся в таблицу
            сторон.
          </p>
          <div className="new-doc-inline-radios">
            <label>
              <input
                type="radio"
                name="our-party"
                checked={ourParty === "supplier"}
                onChange={() => setOurParty("supplier")}
              />{" "}
              Мы — поставщик
            </label>
            <label>
              <input
                type="radio"
                name="our-party"
                checked={ourParty === "buyer"}
                onChange={() => setOurParty("buyer")}
              />{" "}
              Мы — покупатель
            </label>
          </div>
        </section>

        <section className="new-doc-section">
          <h3 className="new-doc-section-title">Формат договора</h3>
          <label className="field">
            <span>Тип</span>
            <select value="supply" disabled>
              <option value="supply">Договор поставки товаров</option>
            </select>
          </label>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Договор оказания услуг — в следующем этапе разработки.
          </p>
        </section>

        <section className="new-doc-section">
          <h3 className="new-doc-section-title">НДС</h3>
          <div className="new-doc-inline-radios">
            <label>
              <input
                type="radio"
                name="vat"
                checked={vatMode === "vat20"}
                onChange={() => setVatMode("vat20")}
              />{" "}
              НДС {vatRatePercent}%{" "}
              <span className="muted" style={{ fontWeight: "normal" }}>
                (в Workspace)
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="vat"
                checked={vatMode === "no_vat"}
                onChange={() => setVatMode("no_vat")}
              />{" "}
              Без НДС
            </label>
          </div>
          {vatMode === "no_vat" ? (
            <label className="field" style={{ marginTop: "0.5rem" }}>
              <span>Основание без НДС</span>
              <input
                value={vatNote}
                onChange={(e) => setVatNote(e.target.value)}
              />
            </label>
          ) : null}
        </section>

        <section className="new-doc-section">
          <h3 className="new-doc-section-title">Сумма договора</h3>
          <label className="field">
            <span>Всего, руб.</span>
            <input
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder="69000000"
              inputMode="decimal"
            />
          </label>
          {wordsLoading ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Пропись…
            </p>
          ) : amountWords ? (
            <p className="new-doc-amount-words">{amountWords}</p>
          ) : null}
        </section>

        <section className="new-doc-section">
          <h3 className="new-doc-section-title">Срок приёмки (дней)</h3>
          <label className="field">
            <span>Календарных дней</span>
            <input
              value={acceptanceDays}
              onChange={(e) => setAcceptanceDays(e.target.value)}
              placeholder="например 30"
              inputMode="numeric"
            />
          </label>
        </section>

        <section className="new-doc-section">
          <h3 className="new-doc-section-title">Порядок оплаты</h3>
          <label className="field">
            <span>График (укажите доли % — суммы посчитаются на сервере)</span>
            <textarea
              value={paymentSchedule}
              onChange={(e) => setPaymentSchedule(e.target.value)}
              rows={3}
            />
          </label>
        </section>

        <section className="new-doc-section">
          <h3 className="new-doc-section-title">Дополнительные условия</h3>
          <label className="field">
            <span>Индивидуальные требования и примечания</span>
            <textarea
              value={extraTerms}
              onChange={(e) => setExtraTerms(e.target.value)}
              rows={3}
            />
          </label>
        </section>

        <section className="new-doc-section">
          <h3 className="new-doc-section-title">Предмет и стороны</h3>
          <label className="field">
            <span>О чём договор (для генерации структуры)</span>
            <textarea
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Например: поставка оборудования ООО «Заказчик» / покупатель ИП …, город, сроки поставки…"
              rows={4}
            />
          </label>
        </section>

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
