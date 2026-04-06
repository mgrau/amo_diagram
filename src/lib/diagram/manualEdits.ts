import YAML, { isMap, isSeq } from "yaml";
import type { TransitionEndpointInteraction } from "./types";

export type EditableTransitionSide = "upper" | "lower";

export type TransitionEndpointEditTarget = {
  kind: "transition-endpoint";
  transition_index: number;
  side: EditableTransitionSide;
};

export function clampAnchor(anchor: number): number {
  if (!Number.isFinite(anchor)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, anchor));
}

export function roundAnchor(anchor: number): number {
  return Math.round(clampAnchor(anchor) * 1000) / 1000;
}

export function roundPlotCoordinate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function roundLabelAngle(angle: number): number {
  return Math.round(angle * 10) / 10;
}

export function roundFontSize(fontSize: number): number {
  return Math.round(Math.max(1, fontSize) * 100) / 100;
}

export function endpointHandlePosition(endpoint: TransitionEndpointInteraction, anchor = endpoint.anchor): {
  x: number;
  y: number;
} {
  return {
    x: endpoint.state_line.x1 + (endpoint.state_line.x2 - endpoint.state_line.x1) * clampAnchor(anchor),
    y: endpoint.state_line.y
  };
}

export function anchorFromStateLineX(endpoint: TransitionEndpointInteraction, x: number): number {
  const width = endpoint.state_line.x2 - endpoint.state_line.x1;
  if (Math.abs(width) < 1e-9) {
    return endpoint.anchor;
  }
  return clampAnchor((x - endpoint.state_line.x1) / width);
}

export function setTransitionAnchorInYaml(
  source: string,
  transitionIndex: number,
  side: EditableTransitionSide,
  anchor: number
): string {
  const document = YAML.parseDocument(source);
  if (document.errors.length > 0) {
    throw document.errors[0];
  }

  const root = document.contents;
  if (!isMap(root)) {
    throw new Error("YAML document must be a mapping.");
  }

  const transitionsNode = root.get("transitions", true);
  if (!isSeq(transitionsNode)) {
    throw new Error("YAML document does not contain a `transitions` sequence.");
  }

  const transitionNode = transitionsNode.items[transitionIndex];
  if (!isMap(transitionNode)) {
    throw new Error(`Transition at index ${transitionIndex} is not a mapping.`);
  }

  transitionNode.set(side === "upper" ? "upper_anchor" : "lower_anchor", roundAnchor(anchor));
  return document.toString();
}

export function updateTransitionStyleInYaml(
  source: string,
  transitionIndex: number,
  updates: {
    color?: string;
    linewidth?: number;
    arrowsize?: number;
  }
): string {
  const document = YAML.parseDocument(source);
  if (document.errors.length > 0) {
    throw document.errors[0];
  }

  const root = document.contents;
  if (!isMap(root)) {
    throw new Error("YAML document must be a mapping.");
  }

  const transitionsNode = root.get("transitions", true);
  if (!isSeq(transitionsNode)) {
    throw new Error("YAML document does not contain a `transitions` sequence.");
  }

  const transitionNode = transitionsNode.items[transitionIndex];
  if (!isMap(transitionNode)) {
    throw new Error(`Transition at index ${transitionIndex} is not a mapping.`);
  }

  if (updates.color !== undefined) {
    transitionNode.set("color", updates.color);
  }
  if (updates.linewidth !== undefined) {
    transitionNode.set("linewidth", Math.round(Math.max(0.25, updates.linewidth) * 100) / 100);
  }
  if (updates.arrowsize !== undefined) {
    transitionNode.set("arrowsize", Math.round(Math.max(1, updates.arrowsize) * 100) / 100);
  }

  return document.toString();
}

export function updateTransitionLabelInYaml(
  source: string,
  transitionIndex: number,
  updates: {
    plotX?: number;
    plotY?: number;
    rotation?: number;
    fontSize?: number;
  }
): string {
  const document = YAML.parseDocument(source);
  if (document.errors.length > 0) {
    throw document.errors[0];
  }

  const root = document.contents;
  if (!isMap(root)) {
    throw new Error("YAML document must be a mapping.");
  }

  const transitionsNode = root.get("transitions", true);
  if (!isSeq(transitionsNode)) {
    throw new Error("YAML document does not contain a `transitions` sequence.");
  }

  const transitionNode = transitionsNode.items[transitionIndex];
  if (!isMap(transitionNode)) {
    throw new Error(`Transition at index ${transitionIndex} is not a mapping.`);
  }

  if (updates.plotX !== undefined) {
    transitionNode.set("label_x", roundPlotCoordinate(updates.plotX));
  }
  if (updates.plotY !== undefined) {
    transitionNode.set("label_y", roundPlotCoordinate(updates.plotY));
  }
  if (updates.rotation !== undefined) {
    transitionNode.set("label_rotation", roundLabelAngle(updates.rotation));
  }
  if (updates.fontSize !== undefined) {
    transitionNode.set("font_size", roundFontSize(updates.fontSize));
  }

  return document.toString();
}

export function updateTransitionLabelPositionInYaml(
  source: string,
  transitionIndex: number,
  plotX: number,
  plotY: number
): string {
  return updateTransitionLabelInYaml(source, transitionIndex, { plotX, plotY });
}
