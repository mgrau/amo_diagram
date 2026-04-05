import { buildTermParts, formatJ, levelLabelText, mjxLabelLatex } from "./termSymbols";
import { renderMathJaxSvg } from "./mathjax";
import { estimateTermHorizontalExtentsAxes, estimateTermMainWidthAxes, estimateTextBlockHeightAxes, estimateTextHeightAxes, estimateTextWidthAxes, termScriptFontSize } from "./textMetrics";
import { polylineDistance } from "./transitionLabels";
import type { LabelVisual, LayoutResult, StateSpec, StateVisual, TermSymbolParts, Theme, TransitionVisual } from "./types";

type LabelBounds = {
  x_center: number;
  x_left: number;
  x_right: number;
  y: number;
};

type ZeemanGroup = {
  bounds: LabelBounds;
  owner_id: string;
};

export function buildStateVisuals(
  states: StateSpec[],
  transitions: TransitionVisual[],
  layout: LayoutResult,
  theme: Theme
): Record<string, StateVisual> {
  const visuals: Record<string, StateVisual> = {};
  const zeemanGroups = buildZeemanGroups(states, layout);

  for (const state of states) {
    const stateLayout = layout.states[state.id];
    if (state.zeeman_parent) {
      const sublevel = buildZeemanSublevelLabel(state, stateLayout, layout, theme);
      const visual: StateVisual = {
        state,
        layout: stateLayout,
        label: sublevel.label,
        svg_label_text: sublevel.svg_label_text,
        latex_label: sublevel.latex_label,
        label_side: state.zeeman_label_position ?? "above"
      };
      const group = zeemanGroups.get(state.zeeman_parent);
      if (group && group.owner_id === state.id) {
        const shared = buildSideStateLabel(state, group.bounds, transitions, layout, theme);
        visual.shared_label = shared.label;
        visual.shared_svg_label_text = shared.svg_label_text;
        visual.shared_latex_label = shared.latex_label;
        visual.shared_term_parts = shared.term_parts;
      }
      visuals[state.id] = visual;
      continue;
    }

    const primary = buildSideStateLabel(state, {
      x_center: stateLayout.x_center,
      x_left: stateLayout.x_left,
      x_right: stateLayout.x_right,
      y: stateLayout.y
    }, transitions, layout, theme);

    visuals[state.id] = {
      state,
      layout: stateLayout,
      label: primary.label,
      svg_label_text: primary.svg_label_text,
      latex_label: primary.latex_label,
      term_parts: primary.term_parts,
      label_side: primary.label_side
    };
  }

  return visuals;
}

export function collectStaticLabelBoxes(
  stateVisuals: Record<string, StateVisual>,
  layout: LayoutResult,
  theme: Theme
): Array<[[number, number], number, number, number]> {
  const boxes: Array<[[number, number], number, number, number]> = [];
  Object.values(stateVisuals).forEach((visual) => {
    pushLabelBoxes(boxes, visual.label, visual.svg_label_text, visual.latex_label, visual.term_parts, layout, theme);
    if (visual.shared_label && visual.shared_svg_label_text) {
      pushLabelBoxes(
        boxes,
        visual.shared_label,
        visual.shared_svg_label_text,
        visual.shared_latex_label,
        visual.shared_term_parts,
        layout,
        theme
      );
    }
  });
  return boxes;
}

export function termSymbolFragments(visual: StateVisual, layout: LayoutResult, theme: Theme): Array<LabelVisual & { role: string }> {
  if (!visual.term_parts) {
    return [{ ...visual.label, role: "main" }];
  }
  return termFragmentsForLabel(visual.label, visual.term_parts, layout, theme);
}

function buildSideStateLabel(
  state: StateSpec,
  bounds: LabelBounds,
  transitions: TransitionVisual[],
  layout: LayoutResult,
  theme: Theme
): {
  label: LabelVisual;
  svg_label_text: string;
  latex_label?: string;
  term_parts?: TermSymbolParts;
  label_side: string;
} {
  const svgLabelText = levelLabelText(state);
  const latexLabel = mjxLabelLatex(state);
  const termParts = buildTermParts(state);
  const labelFontSize = state.font_size ?? theme.state_font_size;
  const preferredSide = bounds.x_center <= (theme.layout_policy.axes_x_min + theme.layout_policy.axes_x_max) / 2 ? "left" : "right";
  const labelSide = resolveStateLabelSide(state, preferredSide, transitions, layout, theme, bounds, svgLabelText, termParts, latexLabel, labelFontSize);
  const gap = theme.layout_policy.state_label_gap;
  const { leftExtent, rightExtent, useMathJax } = measureLabelExtents(svgLabelText, termParts, latexLabel, labelFontSize, layout, theme);

  const label: LabelVisual = labelSide === "left" || labelSide === "below-left"
    ? {
        text: svgLabelText,
        x: state.label_x ?? (bounds.x_left - gap - rightExtent + state.label_offset_x),
        y: state.label_y ?? (bounds.y + state.label_offset_y),
        ha: (termParts || useMathJax) ? "center" : "right",
        va: "center",
        fontSize: labelFontSize
      }
    : {
        text: svgLabelText,
        x: state.label_x ?? (bounds.x_right + gap + leftExtent + state.label_offset_x),
        y: state.label_y ?? (bounds.y + state.label_offset_y),
        ha: (termParts || useMathJax) ? "center" : "left",
        va: "center",
        fontSize: labelFontSize
      };

  return {
    label,
    svg_label_text: svgLabelText,
    latex_label: latexLabel,
    term_parts: termParts,
    label_side: labelSide
  };
}

function buildZeemanSublevelLabel(
  state: StateSpec,
  stateLayout: StateVisual["layout"],
  layout: LayoutResult,
  theme: Theme
): {
  label: LabelVisual;
  svg_label_text: string;
  latex_label: string;
} {
  const fontSize = theme.label_font_size;
  const gap = Math.max(
    theme.layout_policy.state_label_clearance_padding * 0.55,
    estimateTextHeightAxes(fontSize, layout, theme) * 0.8
  );
  const position = state.zeeman_label_position ?? "above";
  const value = formatSignedMagneticQuantumNumber(state.magnetic_quantum_number ?? 0);
  return {
    label: {
      text: `m_J = ${value}`,
      x: stateLayout.x_center,
      y: position === "above" ? stateLayout.y + gap : stateLayout.y - gap,
      ha: "center",
      va: position === "above" ? "bottom" : "top",
      fontSize
    },
    svg_label_text: `m_J = ${value}`,
    latex_label: `$m_{J}=${latexMagneticQuantumNumber(state.magnetic_quantum_number ?? 0)}$`
  };
}

function buildZeemanGroups(states: StateSpec[], layout: LayoutResult): Map<string, ZeemanGroup> {
  const grouped = new Map<string, StateSpec[]>();
  for (const state of states) {
    if (!state.zeeman_parent) {
      continue;
    }
    grouped.set(state.zeeman_parent, [...(grouped.get(state.zeeman_parent) ?? []), state]);
  }

  const groups = new Map<string, ZeemanGroup>();
  for (const [parentId, groupedStates] of grouped) {
    const ordered = [...groupedStates].sort((left, right) => {
      const delta = (left.magnetic_quantum_number ?? 0) - (right.magnetic_quantum_number ?? 0);
      return Math.abs(delta) > 1e-9 ? delta : left.id.localeCompare(right.id, undefined, { numeric: true });
    });
    const layouts = ordered.map((state) => layout.states[state.id]);
    groups.set(parentId, {
      owner_id: ordered[0].id,
      bounds: {
        x_center: layouts.reduce((sum, item) => sum + item.x_center, 0) / Math.max(layouts.length, 1),
        x_left: Math.min(...layouts.map((item) => item.x_left)),
        x_right: Math.max(...layouts.map((item) => item.x_right)),
        y: layouts.reduce((sum, item) => sum + item.y, 0) / Math.max(layouts.length, 1)
      }
    });
  }
  return groups;
}

function pushLabelBoxes(
  boxes: Array<[[number, number], number, number, number]>,
  label: LabelVisual,
  svgLabelText: string,
  latexLabel: string | undefined,
  termParts: TermSymbolParts | undefined,
  layout: LayoutResult,
  theme: Theme
): void {
  if (theme.mathjax_labels && latexLabel) {
    const mjx = renderMathJaxSvg(latexLabel);
    if (mjx) {
      const fontSize = label.fontSize ?? theme.state_font_size;
      const wAxes = (mjx.width * fontSize * theme.layout_policy.mathjax_scale) / (layout.fig_width * 72);
      const hAxes = (mjx.height * fontSize * theme.layout_policy.mathjax_scale) / (layout.fig_height * 72);
      boxes.push([[label.x, label.y], wAxes, hAxes, 0]);
      return;
    }
  }
  if (termParts) {
    termFragmentsForLabel(label, termParts, layout, theme).forEach((fragment) => {
      const baseFontSize = label.fontSize ?? theme.state_font_size;
      const fontSize = fragment.role === "main" || fragment.role === "prefix" ? baseFontSize : termScriptFontSize(theme, baseFontSize);
      boxes.push([[fragment.x, fragment.y], estimateTextWidthAxes(fragment.text, fontSize, layout, theme), estimateTextHeightAxes(fontSize, layout, theme), 0]);
    });
    return;
  }
  const fontSize = label.fontSize ?? theme.state_font_size;
  boxes.push([[label.x, label.y], estimateTextWidthAxes(svgLabelText, fontSize, layout, theme), estimateTextBlockHeightAxes(svgLabelText, fontSize, layout, theme), 0]);
}

function termFragmentsForLabel(
  label: LabelVisual,
  termParts: TermSymbolParts,
  layout: LayoutResult,
  theme: Theme
): Array<LabelVisual & { role: string }> {
  const baseFontSize = label.fontSize ?? theme.state_font_size;
  const mainWidth = estimateTermMainWidthAxes(theme, layout, baseFontSize);
  const mainHeight = estimateTextHeightAxes(baseFontSize, layout, theme);
  const scriptHeight = estimateTextHeightAxes(termScriptFontSize(theme, baseFontSize), layout, theme);
  const fragments: Array<LabelVisual & { role: string }> = [
    { text: termParts.main_text, x: label.x, y: label.y, ha: "center", va: "center", role: "main", fontSize: baseFontSize }
  ];
  if (termParts.leading_prefix) {
    fragments.push({ text: termParts.leading_prefix, x: label.x - mainWidth * 0.62, y: label.y, ha: "right", va: "center", role: "prefix", fontSize: baseFontSize });
  }
  if (termParts.leading_superscript) {
    fragments.push({
      text: termParts.leading_superscript,
      x: label.x - mainWidth * theme.layout_policy.term_leading_sup_scale_x,
      y: label.y + mainHeight * theme.layout_policy.term_leading_sup_scale_y,
      ha: "right",
      va: "center",
      role: "superscript",
      fontSize: termScriptFontSize(theme, baseFontSize)
    });
  }
  if (termParts.trailing_superscript) {
    fragments.push({
      text: termParts.trailing_superscript,
      x: label.x + mainWidth * theme.layout_policy.term_trailing_sup_scale_x,
      y: label.y + mainHeight * theme.layout_policy.term_trailing_sup_scale_y,
      ha: "left",
      va: "center",
      role: "trailing-superscript",
      fontSize: termScriptFontSize(theme, baseFontSize)
    });
  }
  if (termParts.subscript) {
    fragments.push({
      text: termParts.subscript,
      x: label.x + mainWidth * theme.layout_policy.term_subscript_scale_x,
      y: label.y - scriptHeight * theme.layout_policy.term_subscript_scale_y,
      ha: "left",
      va: "center",
      role: "subscript",
      fontSize: termScriptFontSize(theme, baseFontSize)
    });
  }
  return fragments;
}

function resolveStateLabelSide(
  state: StateSpec,
  preferredSide: "left" | "right",
  transitions: TransitionVisual[],
  layout: LayoutResult,
  theme: Theme,
  bounds: LabelBounds,
  svgLabelText: string,
  termParts: TermSymbolParts | undefined,
  latexLabel: string | undefined,
  labelFontSize: number
): string {
  if (state.label_side !== "auto") {
    return state.label_side;
  }
  const { leftExtent, rightExtent } = measureLabelExtents(svgLabelText, termParts, latexLabel, labelFontSize, layout, theme);
  const y = bounds.y;
  const leftCandidate: [number, number][] = [[bounds.x_left - theme.layout_policy.state_label_gap - rightExtent, y]];
  const rightCandidate: [number, number][] = [[bounds.x_right + theme.layout_policy.state_label_gap + leftExtent, y]];
  const leftPenalty = transitionPenalty(leftCandidate[0], transitions) + (preferredSide === "left" ? 0 : 0.005);
  const rightPenalty = transitionPenalty(rightCandidate[0], transitions) + (preferredSide === "right" ? 0 : 0.005);
  return leftPenalty <= rightPenalty ? "left" : "right";
}

function measureLabelExtents(
  svgLabelText: string,
  termParts: TermSymbolParts | undefined,
  latexLabel: string | undefined,
  labelFontSize: number,
  layout: LayoutResult,
  theme: Theme
): { leftExtent: number; rightExtent: number; useMathJax: boolean } {
  if (theme.mathjax_labels && latexLabel) {
    const mjx = renderMathJaxSvg(latexLabel);
    if (mjx) {
      const halfW = (mjx.width * labelFontSize * theme.layout_policy.mathjax_scale) / (2 * layout.fig_width * 72);
      return { leftExtent: halfW, rightExtent: halfW, useMathJax: true };
    }
  }
  if (termParts) {
    const [leftExtent, rightExtent] = estimateTermHorizontalExtentsAxes(termParts, layout, theme, labelFontSize);
    return { leftExtent, rightExtent, useMathJax: false };
  }
  const half = estimateTextWidthAxes(svgLabelText, labelFontSize, layout, theme) / 2;
  return { leftExtent: half, rightExtent: half, useMathJax: false };
}

function formatSignedMagneticQuantumNumber(value: number): string {
  const formatted = formatJ(value) ?? value.toString();
  return value > 0 ? `+${formatted}` : formatted;
}

function latexMagneticQuantumNumber(value: number): string {
  const doubled = Math.round(value * 2);
  if (Math.abs(value * 2 - doubled) > 1e-9) {
    return value.toString();
  }
  if (doubled % 2 === 0) {
    return doubled > 0 ? `+${doubled / 2}` : `${doubled / 2}`;
  }
  const numerator = Math.abs(doubled);
  const fraction = `\\frac{${numerator}}{2}`;
  return doubled > 0 ? `+${fraction}` : `-${fraction}`;
}

function transitionPenalty(point: [number, number], transitions: TransitionVisual[]): number {
  let penalty = 0;
  for (const transition of transitions) {
    penalty += 1 / Math.max(polylineDistance([point, point], transition.points), 1e-3);
  }
  return penalty;
}
