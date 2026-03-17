import type { LayoutResult, TermSymbolParts, Theme } from "./types";

export function estimateTextWidthAxes(text: string, fontSize: number, layout: LayoutResult, theme: Theme): number {
  const lineWidth = Math.max(...text.split("\n").map((line) => line.length), 1);
  return (lineWidth * fontSize * theme.layout_policy.text_width_factor) / Math.max(layout.fig_width * 72, 1);
}

export function estimateTextHeightAxes(fontSize: number, layout: LayoutResult, theme: Theme): number {
  return (fontSize * theme.layout_policy.text_height_factor) / Math.max(layout.fig_height * 72, 1);
}

export function estimateTextBlockHeightAxes(text: string, fontSize: number, layout: LayoutResult, theme: Theme): number {
  const lines = Math.max(text.split("\n").length, 1);
  return estimateTextHeightAxes(fontSize, layout, theme) * lines;
}

export function termScriptFontSize(theme: Theme, baseFontSize = theme.state_font_size): number {
  return baseFontSize * theme.layout_policy.term_script_font_scale;
}

export function estimateTermMainWidthAxes(theme: Theme, layout: LayoutResult, baseFontSize = theme.state_font_size): number {
  return estimateTextWidthAxes("D", baseFontSize, layout, theme);
}

export function estimateTermHorizontalExtentsAxes(parts: TermSymbolParts, layout: LayoutResult, theme: Theme, baseFontSize = theme.state_font_size): [number, number] {
  const mainWidth = estimateTermMainWidthAxes(theme, layout, baseFontSize);
  const smallFont = termScriptFontSize(theme, baseFontSize);
  const prefixWidth = parts.leading_prefix ? estimateTextWidthAxes(parts.leading_prefix, baseFontSize, layout, theme) : 0;
  const leadingSupWidth = parts.leading_superscript ? estimateTextWidthAxes(parts.leading_superscript, smallFont, layout, theme) : 0;
  const subWidth = parts.subscript ? estimateTextWidthAxes(parts.subscript, smallFont, layout, theme) : 0;
  const trailingSupWidth = parts.trailing_superscript ? estimateTextWidthAxes(parts.trailing_superscript, smallFont, layout, theme) : 0;
  return [
    prefixWidth + mainWidth * 0.55 + leadingSupWidth,
    mainWidth * 0.55 + Math.max(subWidth, trailingSupWidth)
  ];
}
