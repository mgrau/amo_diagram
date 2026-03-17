export type MathJaxLabelSvg = {
  innerSvg: string;
  minX: number;
  minY: number;
  width: number;
  height: number;
};

const cache = new Map<string, MathJaxLabelSvg>();

// Internal handles populated after async init
let _convert: ((latex: string, options: Record<string, unknown>) => unknown) | null = null;
let _childNodes: ((node: unknown) => unknown[]) | null = null;
let _kind: ((node: unknown) => string) | null = null;
let _outerHTML: ((node: unknown) => string) | null = null;

let initPromise: Promise<void> | null = null;

export function ensureMathJax(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const [
      { mathjax },
      { TeX },
      { AllPackages },
      { SVG },
      { liteAdaptor },
      { RegisterHTMLHandler }
    ] = await Promise.all([
      import("mathjax-full/js/mathjax.js"),
      import("mathjax-full/js/input/tex.js"),
      import("mathjax-full/js/input/tex/AllPackages.js"),
      import("mathjax-full/js/output/svg.js"),
      import("mathjax-full/js/adaptors/liteAdaptor.js"),
      import("mathjax-full/js/handlers/html.js")
    ]);
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const tex = new TeX({ packages: AllPackages });
    const svgOut = new SVG({ fontCache: "none" });
    const doc = mathjax.document("", { InputJax: tex, OutputJax: svgOut });
    type LiteNode = Parameters<typeof adaptor.childNodes>[0];
    _convert = (latex, options) => doc.convert(latex, options);
    _childNodes = (node) => adaptor.childNodes(node as LiteNode);
    _kind = (node) => adaptor.kind(node as LiteNode);
    _outerHTML = (node) => adaptor.outerHTML(node as LiteNode);
  })();
  return initPromise;
}

export function isMathJaxReady(): boolean {
  return _convert !== null;
}

export function renderMathJaxSvg(latex: string): MathJaxLabelSvg | undefined {
  if (!_convert || !_childNodes || !_kind || !_outerHTML) return undefined;
  const normalized = normalizeLatex(latex);
  if (!normalized) return undefined;
  const cached = cache.get(normalized);
  if (cached) return cached;

  const wrapper = _convert(normalized, { display: false });
  const children = _childNodes(wrapper);
  const svgNode = children.find((child) => _kind!(child) === "svg");
  if (!svgNode) return undefined;

  const markup = _outerHTML(svgNode);
  const viewBoxMatch = markup.match(/viewBox="([^"]+)"/);
  const contentMatch = markup.match(/^<svg\b[^>]*>([\s\S]*)<\/svg>$/);
  if (!viewBoxMatch || !contentMatch) return undefined;

  const [minX, minY, width, height] = viewBoxMatch[1].split(/\s+/).map(Number);
  if ([minX, minY, width, height].some((value) => Number.isNaN(value))) return undefined;

  const rendered = { innerSvg: contentMatch[1].trim(), minX, minY, width, height };
  cache.set(normalized, rendered);
  return rendered;
}

function normalizeLatex(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("$") && trimmed.endsWith("$")) return trimmed.slice(1, -1);
  return trimmed;
}
