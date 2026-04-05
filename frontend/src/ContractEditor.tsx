import type { Editor } from "@tiptap/core";
import Color from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import UniqueID from "@tiptap/extension-unique-id";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  type ChangeEvent,
  type CSSProperties,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { importDocx } from "./api";
import { FontSize } from "./tiptap/FontSize";

export type MarginPreset = "narrow" | "normal" | "wide";

const PRESETS_MM: Record<MarginPreset, [number, number, number, number]> = {
  narrow: [15, 15, 15, 15],
  normal: [25, 25, 25, 25],
  wide: [25, 35, 25, 35],
};

export function marginPresetToPaddingCss(preset: MarginPreset): string {
  const [t, r, b, l] = PRESETS_MM[preset];
  const px = (mm: number) => (mm * 96) / 25.4;
  return `${px(t)}px ${px(r)}px ${px(b)}px ${px(l)}px`;
}

const FONT_SIZES = [
  "9pt",
  "10pt",
  "11pt",
  "12pt",
  "14pt",
  "16pt",
  "18pt",
  "24pt",
  "28pt",
  "36pt",
] as const;

type Props = {
  documentHtml: string;
  marginPreset: MarginPreset;
  onMarginPresetChange: (preset: MarginPreset) => void;
  onHtmlChange?: (html: string) => void;
  onEditorReady?: (editor: Editor | null) => void;
  /** Импорт файла: замена содержимого (родитель обновляет хранилище и ref) */
  onDocumentReplace?: (html: string) => void;
  onOpenWizard?: () => void;
  onExportPdf?: () => void;
  onExportDocx?: () => void;
  exportBusy?: null | "pdf" | "docx";
  onImportError?: (message: string | null) => void;
};

type ZoomPct = 75 | 90 | 100 | 125 | 150;

const FONT_OPTIONS = [
  "Roboto",
  "Arial",
  "Times New Roman",
  "Georgia",
  "Calibri",
  "Courier New",
] as const;

function currentFontFamily(editor: Editor): string {
  const raw = editor.getAttributes("textStyle").fontFamily as string | undefined;
  if (!raw) return "Roboto";
  const normalized = raw.replace(/['"]/g, "").trim();
  return (FONT_OPTIONS as readonly string[]).includes(normalized)
    ? normalized
    : "Roboto";
}

function currentFontSize(editor: Editor): string {
  const s = editor.getAttributes("textStyle").fontSize as string | undefined;
  if (!s) return "11pt";
  return (FONT_SIZES as readonly string[]).includes(s) ? s : "11pt";
}

function currentTextAlign(editor: Editor): string {
  for (const a of ["left", "center", "right", "justify"] as const) {
    if (editor.isActive({ textAlign: a })) return a;
  }
  return "left";
}

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

function getBlockType(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "h1";
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  return "p";
}

function MaterialIcon({ name }: { name: string }) {
  return (
    <span className="material-symbols-outlined gdocs-material-icon" aria-hidden>
      {name}
    </span>
  );
}

export function applyEditorHtml(html: string) {
  window.dispatchEvent(
    new CustomEvent("docs-agent-apply-html", { detail: { html } })
  );
}

/** Прокрутить редактор и выделить фрагмент по цитате из ответа анализа */
export function scrollEditorToQuote(quote: string) {
  window.dispatchEvent(
    new CustomEvent("docs-agent-scroll-to-quote", { detail: { quote } })
  );
}

function findQuoteRange(
  editor: Editor,
  quote: string
): { from: number; to: number } | null {
  const q = quote.trim();
  if (q.length < 3) return null;
  let found: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.isText && node.text?.includes(q)) {
      const i = node.text.indexOf(q);
      found = { from: pos + i, to: pos + i + q.length };
      return false;
    }
  });
  if (!found && q.length > 20) {
    const short = q.slice(0, 48);
    editor.state.doc.descendants((node, pos) => {
      if (found) return false;
      if (node.isText && node.text?.includes(short)) {
        const i = node.text.indexOf(short);
        found = { from: pos + i, to: pos + i + short.length };
        return false;
      }
    });
  }
  return found;
}

export function ContractEditor({
  documentHtml,
  marginPreset,
  onMarginPresetChange,
  onHtmlChange,
  onEditorReady,
  onDocumentReplace,
  onOpenWizard,
  onExportPdf,
  onExportDocx,
  exportBusy = null,
  onImportError,
}: Props) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [zoom, setZoom] = useState<ZoomPct>(100);
  const pagePad = marginPresetToPaddingCss(marginPreset);
  const fileImportRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph", "tableCell", "tableHeader"],
      }),
      TextStyle,
      Color.configure({ types: ["textStyle"] }),
      Highlight.configure({
        multicolor: true,
      }),
      FontSize.configure({ types: ["textStyle"] }),
      FontFamily.configure({ types: ["textStyle"] }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: false,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      UniqueID.configure({
        attributeName: "id",
        types: ["heading"],
      }),
      Table.configure({ cellMinWidth: 80 }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: documentHtml,
    editorProps: {
      attributes: {
        class: "ProseMirror",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onHtmlChange?.(ed.getHTML());
    },
  });

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (editor) onHtmlChange?.(editor.getHTML());
  }, [editor, onHtmlChange]);

  useEffect(() => {
    if (!editor) return;
    const onChange = () => rerender();
    editor.on("selectionUpdate", onChange);
    editor.on("transaction", onChange);
    return () => {
      editor.off("selectionUpdate", onChange);
      editor.off("transaction", onChange);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const handler = (ev: Event) => {
      const e = ev as CustomEvent<{ html?: string }>;
      const html = e.detail?.html;
      if (html != null) editor.commands.setContent(html, false);
    };
    window.addEventListener("docs-agent-apply-html", handler);
    return () => window.removeEventListener("docs-agent-apply-html", handler);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const onQuote = (ev: Event) => {
      const q = (ev as CustomEvent<{ quote?: string }>).detail?.quote?.trim();
      if (!q) return;
      const range = findQuoteRange(editor, q);
      if (!range) return;
      editor
        .chain()
        .focus()
        .setTextSelection(range)
        .scrollIntoView()
        .run();
    };
    window.addEventListener("docs-agent-scroll-to-quote", onQuote);
    return () =>
      window.removeEventListener("docs-agent-scroll-to-quote", onQuote);
  }, [editor]);

  if (!editor) return null;

  const block = getBlockType(editor);

  const onPickImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onDocumentReplace) return;
    onImportError?.(null);
    try {
      const html = await fileToHtml(file);
      applyEditorHtml(html);
      onDocumentReplace(html);
    } catch (err) {
      onImportError?.(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <input
        ref={fileImportRef}
        type="file"
        hidden
        accept=".html,.htm,.txt,.docx"
        onChange={onPickImport}
      />
      <div className="toolbar-gdocs-wrap">
        <div className="toolbar-gdocs" role="toolbar" aria-label="Форматирование">
          <button
            type="button"
            className="icon-btn"
            title="Отменить"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <MaterialIcon name="undo" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Вернуть"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <MaterialIcon name="redo" />
          </button>

          <span className="toolbar-gdocs-sep" aria-hidden />

          <select
            className="gdocs-select gdocs-select-narrow"
            value={String(zoom)}
            title="Масштаб"
            onChange={(e) => setZoom(Number(e.target.value) as ZoomPct)}
            aria-label="Масштаб"
          >
            <option value="75">75%</option>
            <option value="90">90%</option>
            <option value="100">100%</option>
            <option value="125">125%</option>
            <option value="150">150%</option>
          </select>

          <span className="toolbar-gdocs-sep" aria-hidden />

          <select
            className="gdocs-select gdocs-select-block"
            value={block}
            title="Стили абзаца"
            aria-label="Стиль текста"
            onChange={(e) => {
              const v = e.target.value;
              const chain = editor.chain().focus();
              if (v === "p") chain.setParagraph().run();
              else if (v === "h1") chain.toggleHeading({ level: 1 }).run();
              else if (v === "h2") chain.toggleHeading({ level: 2 }).run();
              else if (v === "h3") chain.toggleHeading({ level: 3 }).run();
            }}
          >
            <option value="p">Обычный текст</option>
            <option value="h1">Заголовок&nbsp;1</option>
            <option value="h2">Заголовок&nbsp;2</option>
            <option value="h3">Заголовок&nbsp;3</option>
          </select>

          <select
            className="gdocs-select gdocs-select-font"
            value={currentFontFamily(editor)}
            title="Шрифт"
            aria-label="Шрифт"
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              editor.chain().focus().setFontFamily(v).run();
            }}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <select
            className="gdocs-select gdocs-select-font-size"
            value={currentFontSize(editor)}
            title="Размер шрифта"
            aria-label="Размер шрифта"
            onChange={(e) => {
              const v = e.target.value;
              editor.chain().focus().setFontSize(v).run();
            }}
          >
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s.replace("pt", "")}
              </option>
            ))}
          </select>

          <span className="toolbar-gdocs-sep" aria-hidden />

          {(
            [
              ["left", "format_align_left"],
              ["center", "format_align_center"],
              ["right", "format_align_right"],
              ["justify", "format_align_justify"],
            ] as const
          ).map(([align, icon]) => (
            <button
              key={align}
              type="button"
              className="icon-btn"
              title={
                align === "left"
                  ? "Влево"
                  : align === "center"
                    ? "По центру"
                    : align === "right"
                      ? "Вправо"
                      : "По ширине"
              }
              data-active={currentTextAlign(editor) === align}
              onClick={() =>
                editor.chain().focus().setTextAlign(align).run()
              }
            >
              <MaterialIcon name={icon} />
            </button>
          ))}

          <span className="toolbar-gdocs-sep" aria-hidden />

          <button
            type="button"
            className="icon-btn"
            title="Жирный"
            data-active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <MaterialIcon name="format_bold" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Курсив"
            data-active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <MaterialIcon name="format_italic" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Подчёркнутый"
            data-active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <MaterialIcon name="format_underlined" />
          </button>

          <span className="toolbar-gdocs-sep" aria-hidden />

          <label className="gdocs-color-wrap" title="Цвет текста">
            <span className="material-symbols-outlined gdocs-material-icon" aria-hidden>
              format_color_text
            </span>
            <input
              type="color"
              className="gdocs-color-input"
              aria-label="Цвет текста"
              defaultValue="#202124"
              onChange={(e) =>
                editor.chain().focus().setColor(e.target.value).run()
              }
            />
          </label>
          <button
            type="button"
            className="icon-btn"
            title="Сбросить цвет текста"
            onClick={() => editor.chain().focus().unsetColor().run()}
          >
            <MaterialIcon name="format_color_reset" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Подсветка: жёлтая"
            data-active={editor.isActive("highlight", { color: "#fef08a" })}
            onClick={() =>
              editor.chain().focus().toggleHighlight({ color: "#fef08a" }).run()
            }
          >
            <MaterialIcon name="highlight" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Подсветка: красная"
            data-active={editor.isActive("highlight", { color: "#fecaca" })}
            onClick={() =>
              editor.chain().focus().toggleHighlight({ color: "#fecaca" }).run()
            }
          >
            <MaterialIcon name="format_ink_highlighter" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Убрать подсветку фона"
            onClick={() => editor.chain().focus().unsetHighlight().run()}
          >
            <MaterialIcon name="format_clear" />
          </button>

          <span className="toolbar-gdocs-sep" aria-hidden />

          <button
            type="button"
            className="icon-btn"
            title="Маркированный список"
            data-active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <MaterialIcon name="format_list_bulleted" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Нумерованный список"
            data-active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <MaterialIcon name="format_list_numbered" />
          </button>

          <span className="toolbar-gdocs-sep" aria-hidden />

          <button
            type="button"
            className="icon-btn"
            title="Вставить таблицу 3×3"
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          >
            <MaterialIcon name="border_all" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Строка ниже"
            disabled={!editor.can().addRowAfter()}
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            <MaterialIcon name="add_row_below" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Столбец справа"
            disabled={!editor.can().addColumnAfter()}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            <MaterialIcon name="add_column_right" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Удалить строку"
            disabled={!editor.can().deleteRow()}
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            <MaterialIcon name="delete" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Удалить столбец"
            disabled={!editor.can().deleteColumn()}
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            <MaterialIcon name="view_column" />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Удалить таблицу"
            disabled={!editor.can().deleteTable()}
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            <MaterialIcon name="grid_off" />
          </button>

          <span className="toolbar-gdocs-sep" aria-hidden />
          <select
            className="gdocs-select gdocs-select-margin"
            value={marginPreset}
            title="Поля страницы"
            aria-label="Поля страницы"
            onChange={(e) =>
              onMarginPresetChange(e.target.value as MarginPreset)
            }
          >
            <option value="narrow">Узкие поля</option>
            <option value="normal">Обычные поля</option>
            <option value="wide">Широкие поля</option>
          </select>

          <span className="toolbar-gdocs-sep" aria-hidden />
          {onDocumentReplace ? (
            <button
              type="button"
              className="gdocs-pill-btn"
              onClick={() => fileImportRef.current?.click()}
            >
              Импорт
            </button>
          ) : null}
          {onOpenWizard ? (
            <button
              type="button"
              className="gdocs-pill-btn"
              onClick={onOpenWizard}
            >
              Мастер
            </button>
          ) : null}
          {onExportDocx || onExportPdf ? (
            <select
              className="gdocs-select gdocs-select-export"
              aria-label="Экспорт документа"
              disabled={exportBusy !== null}
              value={
                exportBusy === "docx"
                  ? "docx"
                  : exportBusy === "pdf"
                    ? "pdf"
                    : ""
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "docx") onExportDocx?.();
                else if (v === "pdf") onExportPdf?.();
              }}
            >
              <option value="">Экспорт</option>
              {onExportDocx ? (
                <option value="docx">Word (.docx)</option>
              ) : null}
              {onExportPdf ? <option value="pdf">PDF</option> : null}
            </select>
          ) : null}
        </div>
      </div>
      <div className="editor-shell">
        <div
          className="editor-canvas-zoom"
          style={{ zoom: zoom / 100 } as CSSProperties}
        >
          <div
            className="doc-page-sheet"
            style={{
              padding: pagePad,
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </>
  );
}

/** @deprecated use applyEditorHtml */
export function setEditorContentHtml(html: string) {
  applyEditorHtml(html);
}
