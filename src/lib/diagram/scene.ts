import { buildTransitionVisuals } from "./transitionGeometry";
import { optimizeTransitionLabelPositions } from "./transitionLabels";
import { resolveColumns } from "./layout";
import { buildStateVisuals, collectStaticLabelBoxes } from "./visuals";
import type { DiagramSpec, LabelVisual, Scene, Theme } from "./types";
import type { LayoutResult } from "./types";

export function buildScene(spec: DiagramSpec, layout: LayoutResult, theme: Theme): Scene {
  const transitionVisuals = buildTransitionVisuals(spec.transitions, layout, theme);
  const stateVisuals = buildStateVisuals(spec.states, transitionVisuals, layout, theme);
  const staticBoxes = collectStaticLabelBoxes(stateVisuals, layout, theme);
  optimizeTransitionLabelPositions(transitionVisuals, staticBoxes, layout, theme);
  return {
    state_visuals: stateVisuals,
    transition_visuals: transitionVisuals,
    column_labels: buildColumnLabels(spec, layout, theme),
    energy_axis: buildEnergyAxis(spec, layout, theme),
    title: spec.metadata.title,
    footer: spec.metadata.footer
  };
}

function buildColumnLabels(spec: DiagramSpec, layout: LayoutResult, theme: Theme): LabelVisual[] {
  if (!theme.show_column_labels) {
    return [];
  }
  return resolveColumns(spec)
    .map((column): LabelVisual => ({
      text: column.label ?? column.id,
      x: layout.column_x_centers[column.id],
      y: theme.layout_policy.axes_y_max + theme.layout_policy.group_label_y_offset,
      ha: "center",
      va: "bottom",
      fontSize: theme.column_label_font_size
    }))
    .filter((label) => Boolean(label.text.trim()));
}

function buildEnergyAxis(spec: DiagramSpec, layout: LayoutResult, theme: Theme): Scene["energy_axis"] | undefined {
  if (!theme.show_energy_axis && !theme.show_energy_labels) {
    return undefined;
  }
  const x = theme.layout_policy.axes_x_min - theme.layout_policy.axis_line_x_offset;
  const ticks = buildAxisTicks(layout.energy_min, layout.energy_max).map((tick) => ({
    y: energyToY(tick.value, layout, theme),
    label: theme.show_energy_labels ? tick.label : undefined
  }));
  return {
    x,
    ticks,
    label: {
      text: spec.metadata.energy_unit ? `Energy (${spec.metadata.energy_unit})` : "Energy",
      x: x - theme.layout_policy.axis_label_x_offset,
      y: (theme.layout_policy.axes_y_min + theme.layout_policy.axes_y_max) / 2,
      ha: "center",
      va: "center",
      rotation: 90,
      fontSize: theme.label_font_size
    }
  };
}

function buildAxisTicks(minimum: number, maximum: number): Array<{ value: number; label: string }> {
  const range = Math.max(maximum - minimum, 1e-9);
  const roughStep = range / 5;
  const step = niceStep(roughStep);
  const start = Math.ceil(minimum / step) * step;
  const end = Math.floor(maximum / step) * step;
  const decimals = tickDecimals(step);
  const ticks: Array<{ value: number; label: string }> = [];
  for (let value = start; value <= end + step * 0.25; value += step) {
    const normalized = normalizeTickValue(value, decimals);
    ticks.push({
      value: normalized,
      label: normalized.toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")
    });
  }
  if (ticks.length === 0) {
    const midpoint = normalizeTickValue((minimum + maximum) / 2, decimals);
    ticks.push({ value: midpoint, label: midpoint.toFixed(decimals).replace(/\.0+$/, "") });
  }
  return ticks;
}

function energyToY(energy: number, layout: LayoutResult, theme: Theme): number {
  const range = layout.energy_max === layout.energy_min ? 1 : layout.energy_max - layout.energy_min;
  return theme.layout_policy.axes_y_min + ((energy - layout.energy_min) / range) * (theme.layout_policy.axes_y_max - theme.layout_policy.axes_y_min);
}

function niceStep(value: number): number {
  const exponent = Math.floor(Math.log10(Math.max(value, 1e-9)));
  const scale = Math.pow(10, exponent);
  const normalized = value / scale;
  if (normalized <= 1) return scale;
  if (normalized <= 2) return 2 * scale;
  if (normalized <= 5) return 5 * scale;
  return 10 * scale;
}

function tickDecimals(step: number): number {
  if (step >= 1) {
    return 0;
  }
  return Math.min(6, Math.max(0, Math.ceil(-Math.log10(step))));
}

function normalizeTickValue(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}
