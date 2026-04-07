import { type FormEvent, useEffect, useState } from "react";
import {
  fetchWorkspaceCompanies,
  putWorkspaceCompanies,
  type WorkspaceCompany,
} from "./api";
import { randomUUID } from "./utils/randomUUID";

const emptyCompany = (): WorkspaceCompany => ({
  id: "",
  display_name: "",
  full_legal_name: "",
  address_legal: "",
  ogrn: "",
  inn: "",
  kpp: "",
  address_postal: "",
  bank_name: "",
  rs: "",
  ks: "",
  bik: "",
  signatory_title: "",
  signatory_name: "",
});

export function WorkspaceCompaniesSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<WorkspaceCompany[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    void fetchWorkspaceCompanies()
      .then((list) => {
        if (!c) setCompanies(list);
      })
      .catch(() => {
        if (!c) setCompanies([]);
      })
      .finally(() => {
        if (!c) setLoading(false);
      });
    return () => {
      c = true;
    };
  }, []);

  const onSave = async (ev: FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      for (const co of companies) {
        if (!co.id.trim()) {
          window.alert("У каждой компании должен быть id (латиница, цифры, _ или -).");
          setSaving(false);
          return;
        }
      }
      await putWorkspaceCompanies(companies);
      setMsg("Сохранено.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (index: number, patch: Partial<WorkspaceCompany>) => {
    setCompanies((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  };

  const addRow = () => {
    setCompanies((rows) => [
      ...rows,
      { ...emptyCompany(), id: `company_${randomUUID().slice(0, 8)}` },
    ]);
  };

  const removeRow = (index: number) => {
    setCompanies((rows) => rows.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <section className="workspace-companies">
        <p className="docs-home-hint">Загрузка компаний…</p>
      </section>
    );
  }

  return (
    <section className="workspace-companies">
      <h2 className="workspace-section-title">Компании (реквизиты)</h2>
      <p className="docs-home-hint">
        Справочник для подстановки в договоры. Файл:{" "}
        <code>companies.yaml</code> в каталоге workspace.
      </p>
      <form onSubmit={(e) => void onSave(e)}>
        <div className="workspace-companies-toolbar">
          <button type="button" onClick={addRow}>
            Добавить компанию
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить список"}
          </button>
        </div>
        {msg ? <p className="workspace-ingest-msg">{msg}</p> : null}
        {companies.map((co, idx) => (
          <fieldset key={`${co.id}-${idx}`} className="workspace-company-card">
            <legend>Компания {idx + 1}</legend>
            <button
              type="button"
              className="workspace-company-remove"
              onClick={() => removeRow(idx)}
            >
              Удалить
            </button>
            <label className="workspace-field">
              <span>Id (латиница)</span>
              <input
                value={co.id}
                onChange={(e) => updateRow(idx, { id: e.target.value })}
                required
              />
            </label>
            <label className="workspace-field">
              <span>Краткое название</span>
              <input
                value={co.display_name}
                onChange={(e) =>
                  updateRow(idx, { display_name: e.target.value })
                }
              />
            </label>
            <label className="workspace-field">
              <span>Полное наименование</span>
              <textarea
                value={co.full_legal_name}
                onChange={(e) =>
                  updateRow(idx, { full_legal_name: e.target.value })
                }
                rows={2}
              />
            </label>
            <label className="workspace-field">
              <span>Юридический адрес</span>
              <textarea
                value={co.address_legal}
                onChange={(e) =>
                  updateRow(idx, { address_legal: e.target.value })
                }
                rows={2}
              />
            </label>
            <div className="workspace-company-row2">
              <label className="workspace-field">
                <span>ОГРН</span>
                <input
                  value={co.ogrn}
                  onChange={(e) => updateRow(idx, { ogrn: e.target.value })}
                />
              </label>
              <label className="workspace-field">
                <span>ИНН</span>
                <input
                  value={co.inn}
                  onChange={(e) => updateRow(idx, { inn: e.target.value })}
                />
              </label>
              <label className="workspace-field">
                <span>КПП</span>
                <input
                  value={co.kpp}
                  onChange={(e) => updateRow(idx, { kpp: e.target.value })}
                />
              </label>
            </div>
            <label className="workspace-field">
              <span>Почтовый адрес</span>
              <textarea
                value={co.address_postal}
                onChange={(e) =>
                  updateRow(idx, { address_postal: e.target.value })
                }
                rows={2}
              />
            </label>
            <label className="workspace-field">
              <span>Банк</span>
              <input
                value={co.bank_name}
                onChange={(e) => updateRow(idx, { bank_name: e.target.value })}
              />
            </label>
            <div className="workspace-company-row2">
              <label className="workspace-field">
                <span>р/с</span>
                <input
                  value={co.rs}
                  onChange={(e) => updateRow(idx, { rs: e.target.value })}
                />
              </label>
              <label className="workspace-field">
                <span>к/с</span>
                <input
                  value={co.ks}
                  onChange={(e) => updateRow(idx, { ks: e.target.value })}
                />
              </label>
              <label className="workspace-field">
                <span>БИК</span>
                <input
                  value={co.bik}
                  onChange={(e) => updateRow(idx, { bik: e.target.value })}
                />
              </label>
            </div>
            <div className="workspace-company-row2">
              <label className="workspace-field">
                <span>Должность подписанта</span>
                <input
                  value={co.signatory_title}
                  onChange={(e) =>
                    updateRow(idx, { signatory_title: e.target.value })
                  }
                />
              </label>
              <label className="workspace-field">
                <span>ФИО подписанта</span>
                <input
                  value={co.signatory_name}
                  onChange={(e) =>
                    updateRow(idx, { signatory_name: e.target.value })
                  }
                />
              </label>
            </div>
          </fieldset>
        ))}
      </form>
    </section>
  );
}
