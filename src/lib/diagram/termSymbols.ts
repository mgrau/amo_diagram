import type { StateSpec, TermSymbolParts } from "./types";

const L_SYMBOLS = ["S", "P", "D", "F", "G", "H", "I", "K"];

export function formatJ(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Math.abs(value - Math.round(value)) < 1e-9) {
    return `${Math.round(value)}`;
  }
  const doubled = Math.round(value * 2);
  return `${doubled}/2`;
}

export function buildTermParts(state: StateSpec): TermSymbolParts | undefined {
  if (state.term) {
    const parsed = parseLatexTerm(state.term);
    if (parsed) {
      return parsed;
    }
    if (state.label) {
      return undefined;
    }
    return {
      main_text: state.term ?? state.id
    };
  }
  if (state.label) {
    return undefined;
  }
  if (state.config && state.L !== undefined && state.J !== undefined) {
    const match = state.config.match(/^(\d+)([a-zA-Z].*)?$/);
    const prefix = match?.[1];
    const main = L_SYMBOLS[state.L] ?? "?";
    return {
      leading_prefix: prefix,
      main_text: main,
      subscript: formatJ(state.J)
    };
  }
  if (state.S !== undefined && state.L !== undefined && state.J !== undefined) {
    const multiplicity = `${Math.round(2 * state.S + 1)}`;
    return {
      leading_superscript: multiplicity,
      main_text: L_SYMBOLS[state.L] ?? "?",
      trailing_superscript: state.parity === "odd" ? "o" : undefined,
      subscript: formatJ(state.J)
    };
  }
  return undefined;
}

export function levelLabelText(state: StateSpec): string {
  if (state.label && !state.term) {
    return state.label;
  }
  const parts = buildTermParts(state);
  if (!parts) {
    return state.label ?? state.id;
  }
  return [
    parts.leading_prefix ?? "",
    parts.leading_superscript ? `${parts.leading_superscript}` : "",
    parts.main_text,
    parts.trailing_superscript ? `${parts.trailing_superscript}` : "",
    parts.subscript ? `${parts.subscript}` : ""
  ].join("");
}

export function levelLabelLatex(state: StateSpec): string | undefined {
  if (state.term) {
    return state.term;
  }
  if (state.label) {
    return undefined;
  }
  const parts = buildTermParts(state);
  if (!parts) {
    return undefined;
  }

  const prefix = parts.leading_prefix ?? "";
  const leadSup = parts.leading_superscript ? `^{${parts.leading_superscript}}` : "";
  const main = `\\text{${parts.main_text}}`;
  const trailSup = parts.trailing_superscript ? `^{${parts.trailing_superscript}}` : "";
  const sub = parts.subscript ? `_{${parts.subscript}}` : "";
  return `$${prefix}${leadSup}${main}${trailSup}${sub}$`;
}

export function mjxLabelLatex(state: StateSpec): string | undefined {
  const auto = levelLabelLatex(state);
  if (auto) return auto;
  if (state.label?.startsWith("$") && state.label.endsWith("$") && state.label.length > 1) return state.label;
  return termIdLatex(state.label ?? state.id);
}

// Parse a bare spectroscopic term-symbol ID like "6S1/2" or "3D1" into LaTeX.
// If J is fractional the leading number is treated as the principal quantum number (plain prefix).
// If J is an integer the leading number is treated as the multiplicity (leading superscript).
function termIdLatex(id: string): string | undefined {
  const match = id.match(/^(\d+)([SPDFGHIK])(o?)(\d+\/\d+|\d+)$/i);
  if (!match) return undefined;
  const [, prefix, L, parity, J] = match;
  const Lupper = L.toUpperCase();
  const parityStr = parity ? "^{\\circ}" : "";
  if (J.includes("/")) {
    return `$${prefix}\\text{${Lupper}}${parityStr}_{${J}}$`;
  }
  return `$^{${prefix}}\\text{${Lupper}}${parityStr}_{${J}}$`;
}

function parseLatexTerm(source: string): TermSymbolParts | undefined {
  const text = source.trim();
  const stripped = text.startsWith("$") && text.endsWith("$") ? text.slice(1, -1) : text;
  const pattern = /^(?<prefix>\d+)?(?<lead>\^\{[^}]+\})?(?<main>\\text\{[^}]+\}|[A-Za-z])(?<trail>\^\{[^}]+\})?(?<sub>_\{[^}]+\})?$/;
  const match = stripped.match(pattern);
  if (!match?.groups) {
    return undefined;
  }

  const main = match.groups.main.startsWith("\\text{")
    ? match.groups.main.slice(6, -1)
    : match.groups.main;

  return {
    leading_prefix: match.groups.prefix,
    leading_superscript: unwrapScript(match.groups.lead),
    main_text: main,
    trailing_superscript: unwrapScript(match.groups.trail),
    subscript: unwrapScript(match.groups.sub)
  };
}

function unwrapScript(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.slice(2, -1);
}
