import { pointAlongPolyline, trimPolylineEndpoints } from "./polyline";
import { termSymbolFragments } from "./visuals";
import { renderMathJaxSvg } from "./mathjax";
import { mjxLabelLatex } from "./termSymbols";
import type { LayoutResult, Scene, Theme, TransitionVisual } from "./types";

export function sceneToSvg(scene: Scene, layout: LayoutResult, theme: Theme, sourceYaml = ""): string {
  const width = Math.round(layout.fig_width * 96);
  const height = Math.round(layout.fig_height * 96);
  const padding = Math.max(theme.layout_policy.svg_padding_min_px, Math.min(width, height) * theme.layout_policy.svg_padding_fraction);
  const topMargin = Math.max(12, Math.round(padding * 0.45));
  const bottomMargin = Math.max(12, Math.round(padding * 0.45));
  const titleGap = scene.title ? Math.max(18, Math.round(theme.title_font_size * 0.75)) : 0;
  const titleBlockHeight = scene.title ? Math.round(theme.title_font_size * 1.1) + titleGap : 0;
  const footerGap = scene.footer ? Math.max(10, Math.round(theme.footer_font_size * 0.35)) : 0;
  const footerBlockHeight = scene.footer
    ? Math.round(theme.footer_font_size * 1.1) + footerGap
    : 0;
  const plotTop = topMargin + titleBlockHeight;
  const plotWidth = width - padding * 2;
  const plotHeight = Math.max(1, height - plotTop - bottomMargin - footerBlockHeight);

  const point = ([x, y]: [number, number]) => `${scaleX(x, padding, plotWidth, theme)} ${scaleY(y, plotTop, plotHeight, theme)}`;
  const linecap = "butt";

  const stateGroups = Object.values(scene.state_visuals).map((visual) => {
    const stateLine = `<line class="state-line" x1="${scaleX(visual.layout.x_left, padding, plotWidth, theme)}" y1="${scaleY(visual.layout.y, plotTop, plotHeight, theme)}" x2="${scaleX(visual.layout.x_right, padding, plotWidth, theme)}" y2="${scaleY(visual.layout.y, plotTop, plotHeight, theme)}" stroke="${theme.state_color}" stroke-width="${theme.state_linewidth}" stroke-linecap="${linecap}" />`;
    const label = renderStateLabel(visual, layout, theme, padding, plotWidth, plotTop, plotHeight);
    return [
      `    <g class="state" id="${safeId(visual.state.id)}">`,
      `      ${stateLine}`,
      `      ${label}`,
      `    </g>`
    ].join("\n");
  }).join("\n");

  const transitionGroups = scene.transition_visuals
    .map((visual) => renderTransition(visual, layout, theme, padding, plotWidth, plotTop, plotHeight, point))
    .join("\n");

  const title = scene.title
    ? renderMathJaxOrText(scene.title, width / 2, 0, theme.title_font_size, theme, "center", "top", "diagram-title")
    : "";
  const footer = scene.footer
    ? renderMathJaxOrText(scene.footer, width / 2, height - bottomMargin, theme.footer_font_size, theme, "center", "bottom", "diagram-footer")
    : "";

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    indentBlock(renderMetadata(sourceYaml), 1),
    `  <style>`,
    `    text { fill: #172033; }`,
    `    .transition-line, .state-line { fill: none; stroke-linecap: butt; }`,
    `    .transition-arrowhead { stroke-linecap: butt; stroke-linejoin: miter; }`,
    `    .transition-arrowhead-triangle, .transition-arrowhead-stealth { stroke: none; }`,
    `    .transition-arrowhead-angle { fill: none; }`,
    `  </style>`,
    `  <g class="diagram-root">`,
    title ? `    ${title}` : "",
    `    <g class="states">`,
    stateGroups,
    `    </g>`,
    `    <g class="transitions">`,
    transitionGroups,
    `    </g>`,
    footer ? `    ${footer}` : "",
    `  </g>`,
    `</svg>`
  ].filter(Boolean).join("\n");
}

function renderStateLabel(
  visual: Scene["state_visuals"][string],
  layout: LayoutResult,
  theme: Theme,
  padding: number,
  plotWidth: number,
  plotTop: number,
  plotHeight: number
): string {
  if (theme.mathjax_labels) {
    const mjxSvg = renderMathJaxStateLabel(visual, theme, padding, plotWidth, plotTop, plotHeight);
    if (mjxSvg) return mjxSvg;
  }
  return visual.term_parts
    ? renderTermLabel(visual, layout, theme, padding, plotWidth, plotTop, plotHeight)
    : renderText(
        visual.label.text,
        scaleX(visual.label.x, padding, plotWidth, theme),
        scaleY(visual.label.y, plotTop, plotHeight, theme),
        visual.label.fontSize ?? theme.state_font_size,
        theme.font_family,
        visual.label.ha,
        visual.label.va,
        visual.label.rotation ?? 0
      );
}

function renderMathJaxStateLabel(
  visual: Scene["state_visuals"][string],
  theme: Theme,
  padding: number,
  plotWidth: number,
  plotTop: number,
  plotHeight: number
): string {
  const latex = mjxLabelLatex(visual.state);
  if (!latex) return "";
  const mjx = renderMathJaxSvg(latex);
  if (!mjx) return "";
  const fontSize = visual.label.fontSize ?? theme.state_font_size;
  const scale = fontSize * theme.layout_policy.mathjax_scale;
  const wPx = mjx.width * scale;
  const hPx = mjx.height * scale;
  const cx = scaleX(visual.label.x, padding, plotWidth, theme);
  const cy = scaleY(visual.label.y, plotTop, plotHeight, theme);
  return `<svg class="state-label" x="${cx - wPx / 2}" y="${cy - hPx / 2}" width="${wPx}" height="${hPx}" viewBox="${mjx.minX} ${mjx.minY} ${mjx.width} ${mjx.height}" overflow="visible">${mjx.innerSvg}</svg>`;
}

function renderMetadata(sourceYaml: string): string {
  const embeddedYaml = sourceYaml ? wrapCdata(sourceYaml) : "";
  return [
    `<metadata>`,
    `  <state-diagram-source format="application/yaml" version="1">${embeddedYaml}</state-diagram-source>`,
    `</metadata>`
  ].join("\n");
}

function renderTransition(
  visual: TransitionVisual,
  layout: LayoutResult,
  theme: Theme,
  padding: number,
  plotWidth: number,
  plotTop: number,
  plotHeight: number,
  pointFormatter: (point: [number, number]) => string
): string {
  const arrowLength = theme.arrowsize * theme.layout_policy.arrowhead_length_scale;
  const shaftInset = arrowheadShaftInset(visual.arrowhead, arrowLength);
  const shaftPoints = trimPolylineEndpoints(
    visual.points,
    visual.start_marker ? shaftInset : 0,
    visual.end_marker ? shaftInset : 0
  );
  const element = shaftPoints.length === 2
    ? `<line class="transition-line" x1="${scaleX(shaftPoints[0][0], padding, plotWidth, theme)}" y1="${scaleY(shaftPoints[0][1], plotTop, plotHeight, theme)}" x2="${scaleX(shaftPoints[1][0], padding, plotWidth, theme)}" y2="${scaleY(shaftPoints[1][1], plotTop, plotHeight, theme)}" stroke="${visual.color}" stroke-width="${visual.linewidth}" />`
    : `<polyline class="transition-line" points="${shaftPoints.map(pointFormatter).join(" ")}" stroke="${visual.color}" stroke-width="${visual.linewidth}" fill="none" />`;
  const startArrow = visual.start_marker ? renderArrowhead(visual.arrowhead, visual.points[1], visual.points[0], visual.color, layout, theme, padding, plotWidth, plotTop, plotHeight) : "";
  const endArrow = visual.end_marker ? renderArrowhead(visual.arrowhead, visual.points.at(-2)!, visual.points.at(-1)!, visual.color, layout, theme, padding, plotWidth, plotTop, plotHeight) : "";
  const label = visual.label
    ? renderText(
        visual.label.text,
        scaleX(visual.label.x, padding, plotWidth, theme),
        scaleY(visual.label.y, plotTop, plotHeight, theme),
        visual.label.fontSize ?? theme.transition_font_size,
        theme.font_family,
        visual.label.ha,
        visual.label.va,
        visual.label.rotation ?? 0,
        "transition-label",
        visual.label.fontstyle
      )
    : "";
  return [
    `      <g class="transition" id="${safeId(`${visual.transition.upper}-${visual.transition.lower}`)}">`,
    `        ${element}`,
    startArrow ? `        ${startArrow}` : "",
    endArrow ? `        ${endArrow}` : "",
    label ? `        ${label}` : "",
    `      </g>`
  ].filter(Boolean).join("\n");
}

function renderArrowhead(
  style: "triangle" | "angle" | "stealth",
  start: [number, number],
  end: [number, number],
  color: string,
  layout: LayoutResult,
  theme: Theme,
  padding: number,
  plotWidth: number,
  plotTop: number,
  plotHeight: number
): string {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  const ux = dx / Math.max(length, 1e-9);
  const uy = dy / Math.max(length, 1e-9);
  const nx = -uy;
  const ny = ux;
  const arrowLength = theme.arrowsize * theme.layout_policy.arrowhead_length_scale;
  const arrowWidth = arrowLength * theme.layout_policy.arrowhead_width_scale;
  const base: [number, number] = [end[0] - ux * arrowLength, end[1] - uy * arrowLength];
  const left: [number, number] = [base[0] + nx * arrowWidth, base[1] + ny * arrowWidth];
  const right: [number, number] = [base[0] - nx * arrowWidth, base[1] - ny * arrowWidth];
  if (style === "angle") {
    const anglePoints = [left, end, right]
      .map(([x, y]) => `${scaleX(x, padding, plotWidth, theme)},${scaleY(y, plotTop, plotHeight, theme)}`)
      .join(" ");
    return `<polyline class="transition-arrowhead transition-arrowhead-angle" points="${anglePoints}" fill="none" stroke="${color}" stroke-width="${theme.transition_linewidth}" stroke-linecap="butt" stroke-linejoin="miter" />`;
  }
  if (style === "stealth") {
    const notch: [number, number] = [end[0] - ux * arrowLength * 0.56, end[1] - uy * arrowLength * 0.56];
    const rear: [number, number] = [end[0] - ux * arrowLength * 1.08, end[1] - uy * arrowLength * 1.08];
    const rearLeft: [number, number] = [rear[0] + nx * arrowWidth * 0.68, rear[1] + ny * arrowWidth * 0.68];
    const rearRight: [number, number] = [rear[0] - nx * arrowWidth * 0.68, rear[1] - ny * arrowWidth * 0.68];
    const stealthPoints = [end, left, rearLeft, notch, rearRight, right]
      .map(([x, y]) => `${scaleX(x, padding, plotWidth, theme)},${scaleY(y, plotTop, plotHeight, theme)}`)
      .join(" ");
    return `<polygon class="transition-arrowhead transition-arrowhead-stealth" points="${stealthPoints}" fill="${color}" />`;
  }
  const trianglePoints = [end, left, right]
    .map(([x, y]) => `${scaleX(x, padding, plotWidth, theme)},${scaleY(y, plotTop, plotHeight, theme)}`)
    .join(" ");
  return `<polygon class="transition-arrowhead transition-arrowhead-triangle" points="${trianglePoints}" fill="${color}" />`;
}

function arrowheadShaftInset(style: "triangle" | "angle" | "stealth", arrowLength: number): number {
  if (style === "triangle") {
    return arrowLength * 0.55;
  }
  if (style === "stealth") {
    return arrowLength * 0.42;
  }
  return 0;
}

function renderTermLabel(
  visual: Scene["state_visuals"][string],
  layout: LayoutResult,
  theme: Theme,
  padding: number,
  plotWidth: number,
  plotTop: number,
  plotHeight: number
): string {
  const tspans = termSymbolFragments(visual, layout, theme).map((fragment) => {
    const className = `term-${fragment.role}`;
    return `<tspan class="${className}" x="${scaleX(fragment.x, padding, plotWidth, theme)}" y="${scaleY(fragment.y, plotTop, plotHeight, theme)}" font-size="${fragment.fontSize ?? (fragment.role === "main" || fragment.role === "prefix" ? theme.state_font_size : theme.state_font_size * theme.layout_policy.term_script_font_scale)}">${escape(fragment.text)}</tspan>`;
  }).join("");
  const latex = visual.latex_label ? ` data-latex="${escape(visual.latex_label)}"` : "";
  return `<text class="state-label" font-family="${theme.font_family}" dominant-baseline="middle"${latex}>${tspans}</text>`;
}

function renderMathJaxOrText(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  theme: Theme,
  ha: "left" | "center" | "right",
  va: "top" | "center" | "bottom",
  className = "label"
): string {
  if (theme.mathjax_labels && text.startsWith("$") && text.endsWith("$")) {
    const latex = text.slice(1, -1);
    const mjx = renderMathJaxSvg(latex);
    if (mjx) {
      const scale = fontSize * theme.layout_policy.mathjax_scale;
      const wPx = mjx.width * scale;
      const hPx = mjx.height * scale;
      const svgX = ha === "center" ? x - wPx / 2 : ha === "right" ? x - wPx : x;
      const svgY = va === "top" ? y : va === "bottom" ? y - hPx : y - hPx / 2;
      return `<svg class="${className}" x="${svgX}" y="${svgY}" width="${wPx}" height="${hPx}" viewBox="${mjx.minX} ${mjx.minY} ${mjx.width} ${mjx.height}" overflow="visible">${mjx.innerSvg}</svg>`;
    }
  }
  return renderText(text, x, y, fontSize, theme.font_family, ha, va, 0, className);
}

function renderText(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fontFamily: string,
  ha: "left" | "center" | "right",
  va: "top" | "center" | "bottom",
  rotation: number,
  className = "label",
  fontStyle = "normal"
): string {
  const anchor = ha === "left" ? "start" : ha === "right" ? "end" : "middle";
  const baseline = va === "top" ? "text-before-edge" : va === "bottom" ? "text-after-edge" : "middle";
  const lines = text.split("\n");
  const lineHeight = fontSize * 1.1;
  const totalHeight = (lines.length - 1) * lineHeight;
  const startY = va === "top"
    ? y
    : va === "bottom"
      ? y - totalHeight
      : y - totalHeight / 2;
  // Layout angles are computed in a y-up coordinate system; SVG rotates in y-down.
  const svgRotation = -rotation;
  const transform = svgRotation ? ` transform="rotate(${svgRotation} ${x} ${y})"` : "";
  const tspans = lines.map((line, index) => `<tspan x="${x}" y="${startY + index * lineHeight}">${escape(line)}</tspan>`).join("");
  return `<text class="${className}" x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-size="${fontSize}" font-family="${fontFamily}" font-style="${fontStyle}"${transform}>${tspans}</text>`;
}

function scaleX(x: number, padding: number, plotWidth: number, theme: Theme): number {
  const fraction = (x - theme.layout_policy.axes_x_min) / (theme.layout_policy.axes_x_max - theme.layout_policy.axes_x_min);
  return padding + fraction * plotWidth;
}

function scaleY(y: number, plotTop: number, plotHeight: number, theme: Theme): number {
  const fraction = (y - theme.layout_policy.axes_y_min) / (theme.layout_policy.axes_y_max - theme.layout_policy.axes_y_min);
  return plotTop + (1 - fraction) * plotHeight;
}

function wrapCdata(text: string): string {
  return `<![CDATA[\n${text.replaceAll("]]>", "]]]]><![CDATA[>")}\n]]>`;
}


function indentBlock(block: string, depth: number): string {
  const indent = "  ".repeat(depth);
  return block
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

function safeId(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
