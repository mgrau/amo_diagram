import { pointAlongPolyline, trimPolylineEndpoints } from "./polyline";
import { estimateTextBlockHeightAxes, estimateTextWidthAxes } from "./textMetrics";
import { termSymbolFragments } from "./visuals";
import { renderMathJaxSvg } from "./mathjax";
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
  const frame: SvgFrame = { width, height, padding, plotWidth, plotHeight, plotTop, bottomMargin };

  const point = ([x, y]: [number, number]) => `${scaleX(x, padding, plotWidth, theme)} ${scaleY(y, plotTop, plotHeight, theme)}`;
  const linecap = "butt";

  const stateGroups = Object.values(scene.state_visuals).map((visual) => {
    const stateLine = `<line class="state-line" x1="${scaleX(visual.layout.x_left, padding, plotWidth, theme)}" y1="${scaleY(visual.layout.y, plotTop, plotHeight, theme)}" x2="${scaleX(visual.layout.x_right, padding, plotWidth, theme)}" y2="${scaleY(visual.layout.y, plotTop, plotHeight, theme)}" stroke="${theme.state_color}" stroke-width="${theme.state_linewidth}" stroke-linecap="${linecap}" />`;
    const label = renderStateLabel(visual, layout, theme, padding, plotWidth, plotTop, plotHeight);
    const sharedLabel = renderSharedStateLabel(visual, layout, theme, padding, plotWidth, plotTop, plotHeight);
    return [
      `    <g class="state" id="${safeId(visual.state.id)}">`,
      `      ${stateLine}`,
      `      ${label}`,
      sharedLabel ? `      ${sharedLabel}` : "",
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
  const canvas = expandCanvasToFit(scene, layout, theme, frame);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}" width="${canvas.width}" height="${canvas.height}">`,
    indentBlock(renderMetadata(sourceYaml), 1),
    `  <style>`,
    `    text { fill: #172033; }`,
    `    .transition-line, .state-line { fill: none; stroke-linecap: butt; }`,
    `    .transition-arrowhead { stroke-linecap: butt; stroke-linejoin: miter; }`,
    `    .transition-arrowhead-triangle, .transition-arrowhead-stealth { stroke: none; }`,
    `    .transition-arrowhead-angle { fill: none; }`,
    `  </style>`,
    `  <g class="diagram-root"${canvas.offsetX || canvas.offsetY ? ` transform="translate(${canvas.offsetX} ${canvas.offsetY})"` : ""}>`,
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

type SvgFrame = {
  width: number;
  height: number;
  padding: number;
  plotWidth: number;
  plotHeight: number;
  plotTop: number;
  bottomMargin: number;
};

type PixelBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function expandCanvasToFit(scene: Scene, layout: LayoutResult, theme: Theme, frame: SvgFrame): {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
} {
  const bounds = measureSceneBounds(scene, layout, theme, frame);
  const edgePadding = 6;
  const overflowLeft = Math.max(0, edgePadding - bounds.minX);
  const overflowTop = Math.max(0, edgePadding - bounds.minY);
  const overflowRight = Math.max(0, bounds.maxX - (frame.width - edgePadding));
  const overflowBottom = Math.max(0, bounds.maxY - (frame.height - edgePadding));
  return {
    width: Math.ceil(frame.width + overflowLeft + overflowRight),
    height: Math.ceil(frame.height + overflowTop + overflowBottom),
    offsetX: Math.ceil(overflowLeft),
    offsetY: Math.ceil(overflowTop)
  };
}

function measureSceneBounds(scene: Scene, layout: LayoutResult, theme: Theme, frame: SvgFrame): PixelBounds {
  const bounds: PixelBounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  };

  Object.values(scene.state_visuals).forEach((visual) => {
    includePoint(bounds, scaleX(visual.layout.x_left, frame.padding, frame.plotWidth, theme), scaleY(visual.layout.y, frame.plotTop, frame.plotHeight, theme), theme.state_linewidth / 2);
    includePoint(bounds, scaleX(visual.layout.x_right, frame.padding, frame.plotWidth, theme), scaleY(visual.layout.y, frame.plotTop, frame.plotHeight, theme), theme.state_linewidth / 2);
    includeStructuredStateLabelBounds(bounds, visual.label, visual.svg_label_text, visual.latex_label, visual.term_parts, layout, theme, frame);
    if (visual.shared_label && visual.shared_svg_label_text) {
      includeStructuredStateLabelBounds(
        bounds,
        visual.shared_label,
        visual.shared_svg_label_text,
        visual.shared_latex_label,
        visual.shared_term_parts,
        layout,
        theme,
        frame
      );
    }
  });

  scene.transition_visuals.forEach((visual) => {
    visual.points.forEach(([x, y]) => {
      includePoint(bounds, scaleX(x, frame.padding, frame.plotWidth, theme), scaleY(y, frame.plotTop, frame.plotHeight, theme), visual.linewidth / 2);
    });
    if (visual.start_marker) {
      arrowheadVertices(visual.points[1], visual.points[0], theme, visual.arrowhead).forEach(([x, y]) => {
        includePoint(bounds, scaleX(x, frame.padding, frame.plotWidth, theme), scaleY(y, frame.plotTop, frame.plotHeight, theme), visual.linewidth / 2);
      });
    }
    if (visual.end_marker) {
      arrowheadVertices(visual.points.at(-2)!, visual.points.at(-1)!, theme, visual.arrowhead).forEach(([x, y]) => {
        includePoint(bounds, scaleX(x, frame.padding, frame.plotWidth, theme), scaleY(y, frame.plotTop, frame.plotHeight, theme), visual.linewidth / 2);
      });
    }
    if (visual.label) {
      includeTextLabelBounds(bounds, visual.label, visual.label.text, visual.label.fontSize ?? theme.transition_font_size, layout, theme, frame, "plot");
    }
  });

  if (scene.title) {
    includeHeaderFooterBounds(bounds, scene.title, frame.width / 2, 0, theme.title_font_size, theme, "center", "top", layout, frame);
  }
  if (scene.footer) {
    includeHeaderFooterBounds(bounds, scene.footer, frame.width / 2, frame.height - frame.bottomMargin, theme.footer_font_size, theme, "center", "bottom", layout, frame);
  }

  if (!Number.isFinite(bounds.minX)) {
    return { minX: 0, minY: 0, maxX: frame.width, maxY: frame.height };
  }
  return bounds;
}

function includeStructuredStateLabelBounds(
  bounds: PixelBounds,
  label: Scene["state_visuals"][string]["label"],
  svgLabelText: string,
  latexLabel: string | undefined,
  termParts: Scene["state_visuals"][string]["term_parts"],
  layout: LayoutResult,
  theme: Theme,
  frame: SvgFrame
): void {
  if (theme.mathjax_labels && latexLabel) {
    const mjx = renderMathJaxSvg(latexLabel);
    if (mjx) {
      const fontSize = label.fontSize ?? theme.state_font_size;
      const scale = fontSize * theme.layout_policy.mathjax_scale;
      const width = mjx.width * scale;
      const height = mjx.height * scale;
      const cx = scaleX(label.x, frame.padding, frame.plotWidth, theme);
      const cy = scaleY(label.y, frame.plotTop, frame.plotHeight, theme);
      includeRect(bounds, cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2);
      return;
    }
  }
  if (termParts) {
    termSymbolFragments({
      state: {} as Scene["state_visuals"][string]["state"],
      layout: {} as Scene["state_visuals"][string]["layout"],
      label,
      svg_label_text: svgLabelText,
      latex_label: latexLabel,
      term_parts: termParts,
      label_side: "right"
    }, layout, theme).forEach((fragment) => {
      includeTextLabelBounds(bounds, fragment, fragment.text, fragment.fontSize ?? theme.state_font_size, layout, theme, frame, "plot");
    });
    return;
  }
  includeTextLabelBounds(bounds, label, svgLabelText, label.fontSize ?? theme.state_font_size, layout, theme, frame, "plot");
}

function includeHeaderFooterBounds(
  bounds: PixelBounds,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  theme: Theme,
  ha: "left" | "center" | "right",
  va: "top" | "center" | "bottom",
  layout: LayoutResult,
  frame: SvgFrame
): void {
  if (theme.mathjax_labels && text.startsWith("$") && text.endsWith("$")) {
    const mjx = renderMathJaxSvg(text.slice(1, -1));
    if (mjx) {
      const scale = fontSize * theme.layout_policy.mathjax_scale;
      const width = mjx.width * scale;
      const height = mjx.height * scale;
      const left = ha === "center" ? x - width / 2 : ha === "right" ? x - width : x;
      const top = va === "top" ? y : va === "bottom" ? y - height : y - height / 2;
      includeRect(bounds, left, top, left + width, top + height);
      return;
    }
  }
  includeTextLabelBounds(bounds, { x, y, ha, va }, text, fontSize, layout, theme, frame, "pixel");
}

function includeTextLabelBounds(
  bounds: PixelBounds,
  label: Pick<Scene["state_visuals"][string]["label"], "x" | "y" | "ha" | "va" | "rotation">,
  text: string,
  fontSize: number,
  layout: LayoutResult,
  theme: Theme,
  frame: SvgFrame,
  coordinateSpace: "plot" | "pixel"
): void {
  const x = coordinateSpace === "plot" ? scaleX(label.x, frame.padding, frame.plotWidth, theme) : label.x;
  const y = coordinateSpace === "plot" ? scaleY(label.y, frame.plotTop, frame.plotHeight, theme) : label.y;
  const width = estimateTextWidthPx(text, fontSize, layout, theme);
  const height = estimateTextBlockHeightPx(text, fontSize, layout, theme);
  const left = label.ha === "center" ? x - width / 2 : label.ha === "right" ? x - width : x;
  const top = label.va === "top" ? y : label.va === "bottom" ? y - height : y - height / 2;
  includeRotatedRect(bounds, left, top, width, height, x, y, label.rotation ?? 0);
}

function includeRotatedRect(
  bounds: PixelBounds,
  left: number,
  top: number,
  width: number,
  height: number,
  originX: number,
  originY: number,
  rotationDegrees: number
): void {
  const corners: Array<[number, number]> = [
    [left, top],
    [left + width, top],
    [left + width, top + height],
    [left, top + height]
  ];
  if (Math.abs(rotationDegrees) < 1e-9) {
    corners.forEach(([x, y]) => includePoint(bounds, x, y));
    return;
  }
  const radians = rotationDegrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  corners.forEach(([x, y]) => {
    const dx = x - originX;
    const dy = y - originY;
    includePoint(bounds, originX + dx * cos - dy * sin, originY + dx * sin + dy * cos);
  });
}

function arrowheadVertices(
  start: [number, number],
  end: [number, number],
  theme: Theme,
  style: "triangle" | "angle" | "stealth"
): Array<[number, number]> {
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
    return [left, end, right];
  }
  if (style === "stealth") {
    const notch: [number, number] = [end[0] - ux * arrowLength * 0.56, end[1] - uy * arrowLength * 0.56];
    const rear: [number, number] = [end[0] - ux * arrowLength * 1.08, end[1] - uy * arrowLength * 1.08];
    const rearLeft: [number, number] = [rear[0] + nx * arrowWidth * 0.68, rear[1] + ny * arrowWidth * 0.68];
    const rearRight: [number, number] = [rear[0] - nx * arrowWidth * 0.68, rear[1] - ny * arrowWidth * 0.68];
    return [end, left, rearLeft, notch, rearRight, right];
  }
  return [end, left, right];
}

function estimateTextWidthPx(text: string, fontSize: number, layout: LayoutResult, theme: Theme): number {
  return estimateTextWidthAxes(text, fontSize, layout, theme) * layout.fig_width * 96;
}

function estimateTextBlockHeightPx(text: string, fontSize: number, layout: LayoutResult, theme: Theme): number {
  return estimateTextBlockHeightAxes(text, fontSize, layout, theme) * layout.fig_height * 96;
}

function includeRect(bounds: PixelBounds, left: number, top: number, right: number, bottom: number): void {
  bounds.minX = Math.min(bounds.minX, left);
  bounds.minY = Math.min(bounds.minY, top);
  bounds.maxX = Math.max(bounds.maxX, right);
  bounds.maxY = Math.max(bounds.maxY, bottom);
}

function includePoint(bounds: PixelBounds, x: number, y: number, pad = 0): void {
  includeRect(bounds, x - pad, y - pad, x + pad, y + pad);
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
  return renderStructuredStateLabel(
    visual.label,
    visual.svg_label_text,
    visual.latex_label,
    visual.term_parts,
    layout,
    theme,
    padding,
    plotWidth,
    plotTop,
    plotHeight
  );
}

function renderSharedStateLabel(
  visual: Scene["state_visuals"][string],
  layout: LayoutResult,
  theme: Theme,
  padding: number,
  plotWidth: number,
  plotTop: number,
  plotHeight: number
): string {
  if (!visual.shared_label || !visual.shared_svg_label_text) {
    return "";
  }
  return renderStructuredStateLabel(
    visual.shared_label,
    visual.shared_svg_label_text,
    visual.shared_latex_label,
    visual.shared_term_parts,
    layout,
    theme,
    padding,
    plotWidth,
    plotTop,
    plotHeight
  );
}

function renderStructuredStateLabel(
  label: Scene["state_visuals"][string]["label"],
  svgLabelText: string,
  latexLabel: string | undefined,
  termParts: Scene["state_visuals"][string]["term_parts"],
  layout: LayoutResult,
  theme: Theme,
  padding: number,
  plotWidth: number,
  plotTop: number,
  plotHeight: number
): string {
  if (theme.mathjax_labels && latexLabel) {
    const mjxSvg = renderMathJaxStateLabel(label, latexLabel, theme, padding, plotWidth, plotTop, plotHeight);
    if (mjxSvg) return mjxSvg;
  }
  return termParts
    ? renderTermLabel(label, termParts, layout, theme, padding, plotWidth, plotTop, plotHeight, latexLabel)
    : renderText(
        svgLabelText,
        scaleX(label.x, padding, plotWidth, theme),
        scaleY(label.y, plotTop, plotHeight, theme),
        label.fontSize ?? theme.state_font_size,
        theme.font_family,
        label.ha,
        label.va,
        label.rotation ?? 0
      );
}

function renderMathJaxStateLabel(
  label: Scene["state_visuals"][string]["label"],
  latex: string,
  theme: Theme,
  padding: number,
  plotWidth: number,
  plotTop: number,
  plotHeight: number
): string {
  const mjx = renderMathJaxSvg(latex);
  if (!mjx) return "";
  const fontSize = label.fontSize ?? theme.state_font_size;
  const scale = fontSize * theme.layout_policy.mathjax_scale;
  const wPx = mjx.width * scale;
  const hPx = mjx.height * scale;
  const cx = scaleX(label.x, padding, plotWidth, theme);
  const cy = scaleY(label.y, plotTop, plotHeight, theme);
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
  const startArrow = visual.start_marker ? renderArrowhead(visual.arrowhead, visual.points[1], visual.points[0], visual.color, visual.linewidth, layout, theme, padding, plotWidth, plotTop, plotHeight) : "";
  const endArrow = visual.end_marker ? renderArrowhead(visual.arrowhead, visual.points.at(-2)!, visual.points.at(-1)!, visual.color, visual.linewidth, layout, theme, padding, plotWidth, plotTop, plotHeight) : "";
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
  linewidth: number,
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
    return `<polyline class="transition-arrowhead transition-arrowhead-angle" points="${anglePoints}" fill="none" stroke="${color}" stroke-width="${linewidth}" stroke-linecap="butt" stroke-linejoin="miter" />`;
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
  label: Scene["state_visuals"][string]["label"],
  termParts: NonNullable<Scene["state_visuals"][string]["term_parts"]>,
  layout: LayoutResult,
  theme: Theme,
  padding: number,
  plotWidth: number,
  plotTop: number,
  plotHeight: number,
  latexLabel?: string
): string {
  const fragments = termSymbolFragments({
    state: {} as Scene["state_visuals"][string]["state"],
    layout: {} as Scene["state_visuals"][string]["layout"],
    label,
    svg_label_text: label.text,
    term_parts: termParts,
    label_side: "right",
    latex_label: latexLabel
  }, layout, theme);
  const tspans = fragments.map((fragment) => {
    const className = `term-${fragment.role}`;
    return `<tspan class="${className}" x="${scaleX(fragment.x, padding, plotWidth, theme)}" y="${scaleY(fragment.y, plotTop, plotHeight, theme)}" font-size="${fragment.fontSize ?? (fragment.role === "main" || fragment.role === "prefix" ? theme.state_font_size : theme.state_font_size * theme.layout_policy.term_script_font_scale)}">${escape(fragment.text)}</tspan>`;
  }).join("");
  const latex = latexLabel ? ` data-latex="${escape(latexLabel)}"` : "";
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
