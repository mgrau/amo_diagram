import YAML from "yaml";
import defaultsRaw from "./defaults.yaml?raw";
import type { ColumnSpec, DiagramSpec, LayoutPolicyOverrides, StateSpec, Style, TransitionSpec } from "./types";

type JsonObject = Record<string, unknown>;

const builtInDefaults = YAML.parse(defaultsRaw) as JsonObject;

export function parseDiagramYaml(source: string): DiagramSpec {
  const parsed = YAML.parse(source);
  if (parsed !== null && typeof parsed !== "object") {
    throw new Error("YAML document must be a mapping.");
  }

  const mergedWithDefaults = deepMerge(deepClone(builtInDefaults), (parsed as JsonObject | null) ?? {});
  const collectionDefaults = objectAt(mergedWithDefaults, "defaults");
  const merged = applyCollectionDefaults(mergedWithDefaults);
  const metadata = objectAt(merged, "metadata");
  const style = objectAt(merged, "style");
  const layout = objectAt(merged, "layout");
  const columns = arrayAt(merged, "columns", "groups").map(normalizeColumn);
  const states = stateEntriesAt(merged, "states").map(([id, state]) =>
    normalizeState(id, mergeItemDefaults(state, collectionDefaults.state))
  );
  const transitions = arrayAt(merged, "transitions").map(normalizeTransition);

  const stateIdSet = new Set(states.map((state) => state.id));
  for (const transition of transitions) {
    if (!stateIdSet.has(transition.upper) || !stateIdSet.has(transition.lower)) {
      throw new Error(`Transition ${transition.upper} -> ${transition.lower} references an unknown state.`);
    }
  }

  return {
    metadata: {
      name: stringOrUndefined(metadata.name),
      element: stringOrUndefined(metadata.element),
      ion_charge: numberOr(metadata.ion_charge, 0),
      title: stringOrUndefined(metadata.title),
      footer: stringOrUndefined(metadata.footer),
      energy_unit: stringOr(metadata.energy_unit, "cm-1"),
      energy_min: numberMaybe(metadata.energy_min) ?? numberMaybe(objectAt(merged, "energy_range").min),
      energy_max: numberMaybe(metadata.energy_max) ?? numberMaybe(objectAt(merged, "energy_range").max)
    },
    style: normalizeStyle(style),
    layout: normalizeLayoutOverrides(layout),
    columns,
    states,
    transitions
  };
}

function applyCollectionDefaults(raw: JsonObject): JsonObject {
  const defaults = objectAt(raw, "defaults");
  const output = deepClone(raw);
  const collections: Array<[keyof DiagramSpec | "columns" | "transitions", "column" | "group" | "transition"]> = [
    ["columns", "column"],
    ["transitions", "transition"]
  ];
  for (const [collectionName, defaultName] of collections) {
    const items = collectionName === "columns" ? arrayAt(output, "columns", "groups") : arrayAt(output, collectionName);
    const itemDefaults = defaults[defaultName] ?? (defaultName === "column" ? defaults.group : undefined);
    if (!isObject(itemDefaults)) {
      continue;
    }
    const mergedItems = items.map((item) => isObject(item) ? deepMerge(deepClone(itemDefaults), item) : item);
    if (collectionName === "columns") {
      output.columns = mergedItems;
      delete output.groups;
    } else {
      output[collectionName] = mergedItems;
    }
  }
  delete output.defaults;
  return output;
}

function normalizeStyle(input: JsonObject): Style {
  return {
    theme: stringOr(input.theme, "default"),
    arrowhead: asArrowhead(input.arrowhead),
    endpoint_clearance: numberMaybe(input.endpoint_clearance),
    figure_width: numberMaybe(input.figure_width),
    figure_height: numberMaybe(input.figure_height),
    state_linewidth: numberMaybe(input.state_linewidth),
    state_length: numberMaybe(input.state_length),
    state_font_size: numberMaybe(input.state_font_size),
    label_font_size: numberMaybe(input.label_font_size),
    title_font_size: numberMaybe(input.title_font_size),
    footer_font_size: numberMaybe(input.footer_font_size),
    column_label_font_size: numberMaybe(input.column_label_font_size),
    transition_linewidth: numberMaybe(input.transition_linewidth),
    transition_font_size: numberMaybe(input.transition_font_size ?? input.transition_label_size),
    arrowsize: numberMaybe(input.arrowsize),
    font_family: stringOrUndefined(input.font_family),
    show_energy_axis: booleanMaybe(input.show_energy_axis),
    show_energy_labels: booleanMaybe(input.show_energy_labels),
    show_column_labels: booleanMaybe(input.show_column_labels),
    mathjax_labels: booleanMaybe(input.mathjax_labels)
  };
}

function normalizeLayoutOverrides(input: JsonObject): LayoutPolicyOverrides {
  return {
    anchor_even_distribute: booleanMaybe(input.anchor_even_distribute),
    anchor_sa: booleanMaybe(input.anchor_sa),
    anchor_score_crossing_weight: numberMaybe(input.anchor_score_crossing_weight),
    anchor_score_parallel_weight: numberMaybe(input.anchor_score_parallel_weight),
    anchor_score_repulsion_weight: numberMaybe(input.anchor_score_repulsion_weight),
    anchor_score_center_weight: numberMaybe(input.anchor_score_center_weight),
    anchor_score_line_repulsion_weight: numberMaybe(input.anchor_score_line_repulsion_weight),
    anchor_sa_t_initial: numberMaybe(input.anchor_sa_t_initial),
    anchor_sa_t_final: numberMaybe(input.anchor_sa_t_final),
    anchor_sa_cooling_rate: numberMaybe(input.anchor_sa_cooling_rate),
    anchor_sa_steps_per_temp: numberMaybe(input.anchor_sa_steps_per_temp),
    anchor_sa_perturb_sigma: numberMaybe(input.anchor_sa_perturb_sigma)
  };
}

function normalizeColumn(input: unknown): ColumnSpec {
  const column = asObject(input, "column");
  return {
    id: String(column.id ?? ""),
    label: stringOrUndefined(column.label),
    column_order: numberOr(column.column_order, 0),
    column_width: numberOr(column.column_width, 1),
    x_position: numberMaybe(column.x_position)
  };
}

function normalizeState(id: string, input: unknown): StateSpec {
  const state = asObject(input, "state");
  const inferred = inferStateIdentity(id);
  return {
    id,
    label: stringOrUndefined(state.label),
    energy: numberOr(state.energy ?? state.energy_cm, 0),
    config: stringOrUndefined(state.config) ?? inferred.config,
    term: stringOrUndefined(state.term),
    S: numberMaybe(state.S) ?? inferred.S ?? 0,
    L: numberMaybe(state.L) ?? inferred.L ?? 0,
    J: numberMaybe(state.J) ?? inferred.J ?? 0,
    parity: stringOrUndefined(state.parity),
    column: stringOrNumberOrUndefined(state.column ?? state.group),
    y_position: numberMaybe(state.y_position),
    label_side: asLabelSide(state.label_side),
    label_va: asLabelVa(state.label_va),
    font_size: numberMaybe(state.font_size ?? state.label_font_size),
    label_offset_x: numberOr(state.label_offset_x, 0),
    label_offset_y: numberOr(state.label_offset_y, 0),
    label_x: numberMaybe(state.label_x),
    label_y: numberMaybe(state.label_y)
  };
}

function inferStateIdentity(id: string): { config?: string; S?: number; L?: number; J?: number } {
  const trimmed = id.trim();
  const lOnly = lValueFromSymbol(trimmed);
  if (lOnly !== undefined) {
    return { L: lOnly };
  }

  const jOnly = parseAngularMomentum(trimmed);
  if (jOnly !== undefined) {
    return { J: jOnly };
  }

  const principalNotation = trimmed.match(/^(?<n>\d+)(?<L>[SPDFGHIK])(?<parity>o)?(?:(?<J>\d+(?:\/\d+)?))?$/i);
  if (principalNotation?.groups) {
    const L = lValueFromSymbol(principalNotation.groups.L);
    const J = parseAngularMomentum(principalNotation.groups.J);
    return {
      config: principalNotation.groups.n,
      S: J !== undefined ? 0.5 : undefined,
      L,
      J
    };
  }

  const termNotation = trimmed.match(/^(?<L>[SPDFGHIK])(?<parity>o)?(?:(?<J>\d+(?:\/\d+)?))?$/i);
  if (termNotation?.groups) {
    const L = lValueFromSymbol(termNotation.groups.L);
    const J = parseAngularMomentum(termNotation.groups.J);
    const S = L !== undefined && J !== undefined ? Math.abs(J - L) : undefined;
    return { S, L, J };
  }

  return {};
}

function normalizeTransition(input: unknown): TransitionSpec {
  const transition = asObject(input, "transition");
  return {
    upper: stringOr(transition.upper, ""),
    lower: stringOr(transition.lower, ""),
    arrowhead: asArrowhead(transition.arrowhead),
    endpoint_clearance: numberMaybe(transition.endpoint_clearance),
    wavelength_nm: numberMaybe(transition.wavelength_nm),
    einstein_A: numberMaybe(transition.einstein_A),
    linestyle: stringOr(transition.linestyle, "solid"),
    linewidth: numberMaybe(transition.linewidth),
    color: stringOrUndefined(transition.color),
    label: stringOrUndefined(transition.label),
    show_wavelength: booleanOr(transition.show_wavelength, false),
    arrow: booleanOr(transition.arrow, true),
    arrow_both_ends: booleanOr(transition.arrow_both_ends, false),
    wavy: booleanOr(transition.wavy, false),
    label_offset_x: numberOr(transition.label_offset_x, 0),
    label_offset_y: numberOr(transition.label_offset_y, 0),
    label_rotation: numberOr(transition.label_rotation, 0),
    start_x_offset: numberOr(transition.start_x_offset, 0),
    end_x_offset: numberOr(transition.end_x_offset, 0),
    label_position: numberOr(transition.label_position, 0.5),
    position: asTransitionPosition(transition.position),
    upper_anchor: numberMaybe(transition.upper_anchor),
    lower_anchor: numberMaybe(transition.lower_anchor),
    label_ha: asHa(transition.label_ha),
    label_va: asLabelVa(transition.label_va),
    font_size: numberMaybe(transition.font_size ?? transition.label_font_size),
    label_fontstyle: stringOr(transition.label_fontstyle, "normal"),
    label_x: numberMaybe(transition.label_x),
    label_y: numberMaybe(transition.label_y),
    alignment: transition.alignment === "horizontal" || transition.label_orientation === "horizontal" ? "horizontal" : "transition"
  };
}

function deepMerge(base: JsonObject, override: JsonObject): JsonObject {
  const result: JsonObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    if (isObject(current) && isObject(value)) {
      result[key] = deepMerge(current, value);
    } else {
      result[key] = deepClone(value);
    }
  }
  return result;
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepClone(item)])) as T;
  }
  return value;
}

function mergeItemDefaults(item: unknown, itemDefaults: unknown): unknown {
  if (!isObject(item) || !isObject(itemDefaults)) {
    return item;
  }
  return deepMerge(deepClone(itemDefaults), item);
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) {
    throw new Error(`Expected ${label} to be a mapping.`);
  }
  return value;
}

function objectAt(value: JsonObject, key: string): JsonObject {
  return isObject(value[key]) ? (value[key] as JsonObject) : {};
}

function arrayAt(value: JsonObject, ...keys: string[]): unknown[] {
  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return value[key] as unknown[];
    }
  }
  return [];
}

function stateEntriesAt(value: JsonObject, ...keys: string[]): Array<[string, unknown]> {
  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate.map((item, index) => {
        const state = asObject(item, "state");
        const id = String(state.id ?? state.label ?? `state_${index + 1}`);
        return [id, state];
      });
    }
    if (isObject(candidate)) {
      return Object.entries(candidate);
    }
  }
  return [];
}

function numberMaybe(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringOrNumberOrUndefined(value: unknown): string | number | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return undefined;
}

function lValueFromSymbol(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const symbols = ["S", "P", "D", "F", "G", "H", "I", "K"];
  const index = symbols.indexOf(value.toUpperCase());
  return index >= 0 ? index : undefined;
}

function parseAngularMomentum(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  if (/^\d+\/\d+$/.test(value)) {
    const [numerator, denominator] = value.split("/").map(Number);
    return denominator === 0 ? undefined : numerator / denominator;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

function booleanMaybe(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asHa(value: unknown): "left" | "center" | "right" {
  return value === "left" || value === "right" ? value : "center";
}

function asLabelSide(value: unknown): StateSpec["label_side"] {
  return value === "left" || value === "right" || value === "below-left" ? value : "auto";
}

function asLabelVa(value: unknown): "top" | "center" | "bottom" {
  return value === "top" || value === "bottom" ? value : "center";
}

function asTransitionPosition(value: unknown): "transition" | "left" | "right" | "auto" {
  return value === "transition" || value === "left" || value === "right" ? value : "auto";
}

function asArrowhead(value: unknown): "triangle" | "angle" | "stealth" | undefined {
  return value === "angle" || value === "stealth" || value === "triangle" ? value : undefined;
}
