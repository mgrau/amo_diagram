import { computeLayout } from "./layout";
import { parseDiagramYaml } from "./load";
import { DEFAULT_THEME } from "./policy";
import { buildScene } from "./scene";
import { sceneToSvg } from "./svg";
import type { DiagramSpec, Theme } from "./types";

export interface RenderedDiagram {
  name?: string;
  svg: string;
}

export function renderDiagram(source: string): RenderedDiagram {
  const spec = parseDiagramYaml(source);
  const theme = applyLayoutOverrides(applyStyle(DEFAULT_THEME, spec), spec);
  const layout = computeLayout(spec, theme);
  const scene = buildScene(spec, layout, theme);
  const svg = sceneToSvg(scene, layout, theme, source);
  return {
    name: spec.metadata.name ?? spec.metadata.element,
    svg
  };
}

function applyLayoutOverrides(theme: Theme, spec: DiagramSpec): Theme {
  const overrides = spec.layout;
  const policy = { ...theme.layout_policy };
  for (const [key, value] of Object.entries(overrides) as [keyof typeof overrides, number | boolean | undefined][]) {
    if (value !== undefined) {
      (policy as Record<string, number | boolean>)[key] = value;
    }
  }
  return { ...theme, layout_policy: policy };
}

function applyStyle(theme: Theme, spec: DiagramSpec): Theme {
  const baseFontSize = spec.style.font_size;
  return {
    ...theme,
    arrowhead: spec.style.arrowhead ?? theme.arrowhead,
    endpoint_clearance: spec.style.endpoint_clearance ?? theme.endpoint_clearance,
    state_linewidth: spec.style.state_linewidth ?? theme.state_linewidth,
    state_length: spec.style.state_length ?? theme.state_length,
    state_font_size: spec.style.state_font_size ?? baseFontSize ?? theme.state_font_size,
    label_font_size: spec.style.label_font_size ?? baseFontSize ?? theme.label_font_size,
    title_font_size: spec.style.title_font_size ?? baseFontSize ?? theme.title_font_size,
    footer_font_size: spec.style.footer_font_size ?? baseFontSize ?? theme.footer_font_size,
    column_label_font_size: spec.style.column_label_font_size ?? baseFontSize ?? theme.column_label_font_size,
    transition_linewidth: spec.style.transition_linewidth ?? theme.transition_linewidth,
    transition_font_size: spec.style.transition_font_size ?? baseFontSize ?? theme.transition_font_size,
    arrowsize: spec.style.arrowsize ?? theme.arrowsize,
    font_family: spec.style.font_family ?? theme.font_family,
    show_energy_axis: spec.style.show_energy_axis ?? theme.show_energy_axis,
    show_energy_labels: spec.style.show_energy_labels ?? theme.show_energy_labels,
    show_column_labels: spec.style.show_column_labels ?? theme.show_column_labels,
    mathjax_labels: spec.style.mathjax_labels ?? theme.mathjax_labels
  };
}
