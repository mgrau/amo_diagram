import { buildTermParts, levelLabelLatex, levelLabelText, mjxLabelLatex } from "./termSymbols";
import { renderMathJaxSvg } from "./mathjax";
import { estimateTermHorizontalExtentsAxes, estimateTermMainWidthAxes, estimateTextBlockHeightAxes, estimateTextHeightAxes, estimateTextWidthAxes, termScriptFontSize } from "./textMetrics";
import { polylineDistance } from "./transitionLabels";
import type { LabelVisual, LayoutResult, StateSpec, StateVisual, Theme, TransitionVisual } from "./types";

export function buildStateVisuals(
  states: StateSpec[],
  transitions: TransitionVisual[],
  layout: LayoutResult,
  theme: Theme
): Record<string, StateVisual> {
  const visuals: Record<string, StateVisual> = {};
  const midpoint = (theme.layout_policy.axes_x_min + theme.layout_policy.axes_x_max) / 2;
  for (const state of states) {
    const stateLayout = layout.states[state.id];
    const svgLabelText = levelLabelText(state);
    const labelFontSize = state.font_size ?? theme.state_font_size;
    const labelSide = resolveStateLabelSide(state, stateLayout.x_center <= midpoint ? "left" : "right", transitions, layout, theme);
    const parts = buildTermParts(state);
    const gap = theme.layout_policy.state_label_gap;

    let leftExtent: number;
    let rightExtent: number;
    let useMathJax = false;
    if (theme.mathjax_labels) {
      const latex = mjxLabelLatex(state);
      const mjx = latex ? renderMathJaxSvg(latex) : undefined;
      if (mjx) {
        const halfW = (mjx.width * labelFontSize * theme.layout_policy.mathjax_scale) / (2 * layout.fig_width * 72);
        leftExtent = halfW;
        rightExtent = halfW;
        useMathJax = true;
      } else {
        [leftExtent, rightExtent] = parts ? estimateTermHorizontalExtentsAxes(parts, layout, theme, labelFontSize) : [estimateTermMainWidthAxes(theme, layout, labelFontSize) / 2, estimateTermMainWidthAxes(theme, layout, labelFontSize) / 2];
      }
    } else {
      [leftExtent, rightExtent] = parts ? estimateTermHorizontalExtentsAxes(parts, layout, theme, labelFontSize) : [estimateTermMainWidthAxes(theme, layout, labelFontSize) / 2, estimateTermMainWidthAxes(theme, layout, labelFontSize) / 2];
    }

    const label: LabelVisual = labelSide === "left" || labelSide === "below-left"
      ? {
          text: svgLabelText,
          x: state.label_x ?? (stateLayout.x_left - gap - rightExtent + state.label_offset_x),
          y: state.label_y ?? (stateLayout.y + state.label_offset_y),
          ha: (parts || useMathJax) ? "center" : "right",
          va: "center",
          fontSize: labelFontSize
        }
      : {
          text: svgLabelText,
          x: state.label_x ?? (stateLayout.x_right + gap + leftExtent + state.label_offset_x),
          y: state.label_y ?? (stateLayout.y + state.label_offset_y),
          ha: (parts || useMathJax) ? "center" : "left",
          va: "center",
          fontSize: labelFontSize
        };

    visuals[state.id] = {
      state,
      layout: stateLayout,
      label,
      svg_label_text: svgLabelText,
      latex_label: levelLabelLatex(state),
      term_parts: parts,
      label_side: labelSide
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
    if (theme.mathjax_labels) {
      const latex = mjxLabelLatex(visual.state);
      const mjx = latex ? renderMathJaxSvg(latex) : undefined;
      if (mjx) {
        const fontSize = visual.label.fontSize ?? theme.state_font_size;
        const wAxes = (mjx.width * fontSize * theme.layout_policy.mathjax_scale) / (layout.fig_width * 72);
        const hAxes = (mjx.height * fontSize * theme.layout_policy.mathjax_scale) / (layout.fig_height * 72);
        boxes.push([[visual.label.x, visual.label.y], wAxes, hAxes, 0]);
        return;
      }
    }
    if (visual.term_parts) {
      termSymbolFragments(visual, layout, theme).forEach((fragment) => {
        const baseFontSize = visual.label.fontSize ?? theme.state_font_size;
        const fontSize = fragment.role === "main" || fragment.role === "prefix" ? baseFontSize : termScriptFontSize(theme, baseFontSize);
        boxes.push([[fragment.x, fragment.y], estimateTextWidthAxes(fragment.text, fontSize, layout, theme), estimateTextHeightAxes(fontSize, layout, theme), 0]);
      });
      return;
    }
    const fontSize = visual.label.fontSize ?? theme.state_font_size;
    boxes.push([[visual.label.x, visual.label.y], estimateTextWidthAxes(visual.svg_label_text, fontSize, layout, theme), estimateTextBlockHeightAxes(visual.svg_label_text, fontSize, layout, theme), 0]);
  });
  return boxes;
}

export function termSymbolFragments(visual: StateVisual, layout: LayoutResult, theme: Theme): Array<LabelVisual & { role: string }> {
  if (!visual.term_parts) {
    return [{ ...visual.label, role: "main" }];
  }
  const parts = visual.term_parts;
  const baseFontSize = visual.label.fontSize ?? theme.state_font_size;
  const mainWidth = estimateTermMainWidthAxes(theme, layout, baseFontSize);
  const mainHeight = estimateTextHeightAxes(baseFontSize, layout, theme);
  const scriptHeight = estimateTextHeightAxes(termScriptFontSize(theme, baseFontSize), layout, theme);
  const fragments: Array<LabelVisual & { role: string }> = [
    { text: parts.main_text, x: visual.label.x, y: visual.label.y, ha: "center", va: "center", role: "main", fontSize: baseFontSize }
  ];
  if (parts.leading_prefix) {
    fragments.push({ text: parts.leading_prefix, x: visual.label.x - mainWidth * 0.62, y: visual.label.y, ha: "right", va: "center", role: "prefix", fontSize: baseFontSize });
  }
  if (parts.leading_superscript) {
    fragments.push({
      text: parts.leading_superscript,
      x: visual.label.x - mainWidth * theme.layout_policy.term_leading_sup_scale_x,
      y: visual.label.y + mainHeight * theme.layout_policy.term_leading_sup_scale_y,
      ha: "right",
      va: "center",
      role: "superscript",
      fontSize: termScriptFontSize(theme, baseFontSize)
    });
  }
  if (parts.trailing_superscript) {
    fragments.push({
      text: parts.trailing_superscript,
      x: visual.label.x + mainWidth * theme.layout_policy.term_trailing_sup_scale_x,
      y: visual.label.y + mainHeight * theme.layout_policy.term_trailing_sup_scale_y,
      ha: "left",
      va: "center",
      role: "trailing-superscript",
      fontSize: termScriptFontSize(theme, baseFontSize)
    });
  }
  if (parts.subscript) {
    fragments.push({
      text: parts.subscript,
      x: visual.label.x + mainWidth * theme.layout_policy.term_subscript_scale_x,
      y: visual.label.y - scriptHeight * theme.layout_policy.term_subscript_scale_y,
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
  theme: Theme
): string {
  if (state.label_side !== "auto") {
    return state.label_side;
  }
  const stateLayout = layout.states[state.id];
  const parts = buildTermParts(state);
  const baseFontSize = state.font_size ?? theme.state_font_size;
  const mainWidth = estimateTermMainWidthAxes(theme, layout, baseFontSize);
  const [leftExtent, rightExtent] = parts ? estimateTermHorizontalExtentsAxes(parts, layout, theme, baseFontSize) : [mainWidth / 2, mainWidth / 2];
  const y = stateLayout.y;
  const leftCandidate: [number, number][] = [[stateLayout.x_left - theme.layout_policy.state_label_gap - rightExtent, y]];
  const rightCandidate: [number, number][] = [[stateLayout.x_right + theme.layout_policy.state_label_gap + leftExtent, y]];
  const leftPenalty = transitionPenalty(leftCandidate[0], transitions) + (preferredSide === "left" ? 0 : 0.005);
  const rightPenalty = transitionPenalty(rightCandidate[0], transitions) + (preferredSide === "right" ? 0 : 0.005);
  return leftPenalty <= rightPenalty ? "left" : "right";
}

function transitionPenalty(point: [number, number], transitions: TransitionVisual[]): number {
  let penalty = 0;
  for (const transition of transitions) {
    penalty += 1 / Math.max(polylineDistance([point, point], transition.points), 1e-3);
  }
  return penalty;
}
