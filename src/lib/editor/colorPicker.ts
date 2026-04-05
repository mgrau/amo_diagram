import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const HEX_COLOR_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

export interface ColorSwatchClickDetail {
  from: number;
  to: number;
  color: string;
  x: number;
  y: number;
}

class ColorSwatchWidget extends WidgetType {
  constructor(
    private readonly color: string,
    private readonly from: number,
    private readonly to: number
  ) {
    super();
  }

  eq(other: ColorSwatchWidget): boolean {
    return other.color === this.color && other.from === this.from && other.to === this.to;
  }

  toDOM(): HTMLElement {
    const swatch = document.createElement("span");
    swatch.style.cssText = [
      `background:${this.color}`,
      "display:inline-block",
      "width:10px",
      "height:10px",
      "border-radius:2px",
      "border:1px solid rgba(255,255,255,0.25)",
      "margin-left:4px",
      "cursor:pointer",
      "vertical-align:middle",
      "position:relative",
      "top:-1px",
      "flex-shrink:0"
    ].join(";");
    swatch.title = "Click to pick color";

    swatch.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = swatch.getBoundingClientRect();
      swatch.dispatchEvent(new CustomEvent<ColorSwatchClickDetail>("color-swatch-click", {
        bubbles: true,
        detail: { from: this.from, to: this.to, color: this.color, x: rect.left, y: rect.bottom }
      }));
    });

    return swatch;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function buildColorDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let match: RegExpExecArray | null;
    HEX_COLOR_RE.lastIndex = 0;
    while ((match = HEX_COLOR_RE.exec(text)) !== null) {
      const matchFrom = from + match.index;
      const matchTo = matchFrom + match[0].length;
      const color = normalizeHex(match[0]);
      builder.add(matchTo, matchTo, Decoration.widget({
        widget: new ColorSwatchWidget(color, matchFrom, matchTo),
        side: 1
      }));
    }
  }
  return builder.finish();
}

function normalizeHex(hex: string): string {
  if (hex.length === 4) {
    // Expand 3-digit shorthand: #rgb → #rrggbb
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex.toLowerCase();
}

export const colorPickerExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildColorDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildColorDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);
