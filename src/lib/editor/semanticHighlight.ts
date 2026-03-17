import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

type SectionName = "metadata" | "style" | "columns" | "states" | "transitions";

const SECTION_CLASSES: Record<SectionName, string> = {
  metadata:    "cm-hl-metadata",
  style:       "cm-hl-style",
  columns:     "cm-hl-columns",
  states:      "cm-hl-states",
  transitions: "cm-hl-transitions",
};

const SECTION_NAMES = new Set<SectionName>(["metadata", "style", "columns", "states", "transitions"]);

// Matches a property key: optional indent + optional list marker + identifier + colon
const PROP_RE = /^(\s+(?:-\s*)?)([a-zA-Z_]\w*)\s*:/;

export const semanticHighlightTheme = EditorView.theme({
  ".cm-hl-metadata":    { color: "#89b4fa" },
  ".cm-hl-style":       { color: "#b4befe" },
  ".cm-hl-columns":     { color: "#f9e2af" },
  ".cm-hl-states":      { color: "#94e2d5" },
  ".cm-hl-transitions": { color: "#eba0ac" },
  ".cm-hl-state-id":    { color: "#f5e0dc", fontStyle: "italic" },
});

function detectIndentUnit(doc: EditorView["state"]["doc"]): number {
  for (let i = 1; i <= doc.lines; i++) {
    const m = doc.line(i).text.match(/^( +)\S/);
    if (m) return m[1].length;
  }
  return 2;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const indentUnit = detectIndentUnit(doc);
  const stateIdRe = new RegExp(`^${" ".repeat(indentUnit)}\\S`);
  let section: SectionName | null = null;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const { text } = line;

    if (!text.trim() || text.trimStart().startsWith("#")) continue;

    // Top-level key (no leading whitespace)
    if (!/^\s/.test(text)) {
      const m = text.match(/^([a-zA-Z_]\w*)\s*:/);
      if (m && SECTION_NAMES.has(m[1] as SectionName)) {
        section = m[1] as SectionName;
        builder.add(line.from, line.from + m[1].length,
          Decoration.mark({ class: SECTION_CLASSES[section] }));
      } else {
        section = null;
      }
      continue;
    }

    if (!section) continue;

    // Under 'states': first indent level = state identifier (not a property name)
    if (section === "states" && stateIdRe.test(text)) {
      const m = text.match(/^( +)(.+?)\s*:/);
      if (m) {
        builder.add(line.from + m[1].length, line.from + m[1].length + m[2].trimEnd().length,
          Decoration.mark({ class: "cm-hl-state-id" }));
      }
      continue;
    }

    // Property key anywhere else under the section
    const m = text.match(PROP_RE);
    if (m) {
      const prefixLen = m[1].length;
      builder.add(line.from + prefixLen, line.from + prefixLen + m[2].length,
        Decoration.mark({ class: SECTION_CLASSES[section] }));
    }
  }

  return builder.finish();
}

export const semanticHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);
