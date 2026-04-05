import type { LayoutResult, TermSymbolParts, Theme } from "./types";

const textWidthCache = new Map<string, number>();
const textHeightCache = new Map<string, number>();
const textBlockHeightCache = new Map<string, number>();
const termExtentCache = new Map<string, [number, number]>();

export function estimateTextWidthAxes(text: string, fontSize: number, layout: LayoutResult, theme: Theme): number {
  const cacheKey = `${text}|${fontSize}|${layout.fig_width}|${theme.layout_policy.text_width_factor}`;
  const cached = textWidthCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const lineWidth = Math.max(...text.split("\n").map((line) => line.length), 1);
  const measured = (lineWidth * fontSize * theme.layout_policy.text_width_factor) / Math.max(layout.fig_width * 72, 1);
  textWidthCache.set(cacheKey, measured);
  return measured;
}

export function estimateTextHeightAxes(fontSize: number, layout: LayoutResult, theme: Theme): number {
  const cacheKey = `${fontSize}|${layout.fig_height}|${theme.layout_policy.text_height_factor}`;
  const cached = textHeightCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const measured = (fontSize * theme.layout_policy.text_height_factor) / Math.max(layout.fig_height * 72, 1);
  textHeightCache.set(cacheKey, measured);
  return measured;
}

export function estimateTextBlockHeightAxes(text: string, fontSize: number, layout: LayoutResult, theme: Theme): number {
  const cacheKey = `${text.split("\n").length}|${fontSize}|${layout.fig_height}|${theme.layout_policy.text_height_factor}`;
  const cached = textBlockHeightCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const lines = Math.max(text.split("\n").length, 1);
  const measured = estimateTextHeightAxes(fontSize, layout, theme) * lines;
  textBlockHeightCache.set(cacheKey, measured);
  return measured;
}

export function termScriptFontSize(theme: Theme, baseFontSize = theme.state_font_size): number {
  return baseFontSize * theme.layout_policy.term_script_font_scale;
}

export function estimateTermMainWidthAxes(theme: Theme, layout: LayoutResult, baseFontSize = theme.state_font_size): number {
  return estimateTextWidthAxes("D", baseFontSize, layout, theme);
}

export function estimateTermHorizontalExtentsAxes(parts: TermSymbolParts, layout: LayoutResult, theme: Theme, baseFontSize = theme.state_font_size): [number, number] {
  const cacheKey = [
    parts.leading_prefix ?? "",
    parts.main_text,
    parts.leading_superscript ?? "",
    parts.trailing_superscript ?? "",
    parts.subscript ?? "",
    baseFontSize,
    layout.fig_width,
    layout.fig_height,
    theme.layout_policy.term_script_font_scale,
    theme.layout_policy.text_width_factor
  ].join("|");
  const cached = termExtentCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const mainWidth = estimateTermMainWidthAxes(theme, layout, baseFontSize);
  const smallFont = termScriptFontSize(theme, baseFontSize);
  const prefixWidth = parts.leading_prefix ? estimateTextWidthAxes(parts.leading_prefix, baseFontSize, layout, theme) : 0;
  const leadingSupWidth = parts.leading_superscript ? estimateTextWidthAxes(parts.leading_superscript, smallFont, layout, theme) : 0;
  const subWidth = parts.subscript ? estimateTextWidthAxes(parts.subscript, smallFont, layout, theme) : 0;
  const trailingSupWidth = parts.trailing_superscript ? estimateTextWidthAxes(parts.trailing_superscript, smallFont, layout, theme) : 0;
  const measured: [number, number] = [
    prefixWidth + mainWidth * 0.55 + leadingSupWidth,
    mainWidth * 0.55 + Math.max(subWidth, trailingSupWidth)
  ];
  termExtentCache.set(cacheKey, measured);
  return measured;
}
