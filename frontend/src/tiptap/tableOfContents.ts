import type { Editor, JSONContent } from "@tiptap/core";

export type HeadingForToc = {
  level: number;
  text: string;
  id: string;
};

export function collectHeadings(editor: Editor): HeadingForToc[] {
  const headings: HeadingForToc[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "heading") return;
    const level = node.attrs.level as number;
    if (level > 3) return;
    const text = node.textContent.trim();
    if (!text) return;
    const id = node.attrs.id as string | undefined;
    if (!id) return;
    headings.push({ level, text, id });
  });
  return headings;
}

/** Ensure all h1–h3 have id attribute (for links from TOC). */
export function ensureHeadingIds(editor: Editor): boolean {
  let changed = false;
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const level = node.attrs.level as number;
    if (level > 3) return;
    if (node.attrs.id) return;
    const id = `h-${crypto.randomUUID().slice(0, 10)}`;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      id,
      level,
    });
    changed = true;
  });
  if (changed) {
    editor.view.dispatch(tr);
  }
  return changed;
}

export function buildTocJson(headings: HeadingForToc[]): JSONContent {
  const listItems: JSONContent[] = headings.map((h) => ({
    type: "listItem",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [{ type: "link", attrs: { href: `#${h.id}` } }],
            text: h.text,
          },
        ],
      },
    ],
  }));
  return { type: "bulletList", content: listItems };
}

export function insertTableOfContents(editor: Editor): boolean {
  ensureHeadingIds(editor);
  const headings = collectHeadings(editor);
  if (!headings.length) return false;
  const toc = buildTocJson(headings);
  const lead: JSONContent = {
    type: "paragraph",
    content: [{ type: "text", text: "Оглавление" }],
  };
  const spacer: JSONContent = { type: "paragraph" };
  editor
    .chain()
    .focus()
    .insertContent([lead, toc, spacer])
    .run();
  return true;
}
