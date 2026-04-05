import { buildTransitionVisuals } from "./transitionGeometry";
import { optimizeTransitionLabelPositions } from "./transitionLabels";
import { buildStateVisuals, collectStaticLabelBoxes } from "./visuals";
import type { DiagramSpec, Scene, Theme } from "./types";
import type { LayoutResult } from "./types";

export function buildScene(spec: DiagramSpec, layout: LayoutResult, theme: Theme): Scene {
  const transitionVisuals = buildTransitionVisuals(spec.transitions, layout, theme);
  const stateVisuals = buildStateVisuals(spec.states, transitionVisuals, layout, theme);
  const staticBoxes = collectStaticLabelBoxes(stateVisuals, layout, theme);
  optimizeTransitionLabelPositions(transitionVisuals, staticBoxes, layout, theme);
  return {
    state_visuals: stateVisuals,
    transition_visuals: transitionVisuals,
    group_labels: [],
    axis_ticks: [],
    title: spec.metadata.title,
    footer: spec.metadata.footer
  };
}
