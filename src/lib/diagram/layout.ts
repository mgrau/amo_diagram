import { buildTermParts } from "./termSymbols";
import { estimateTextHeightAxes, termScriptFontSize } from "./textMetrics";
import type { ColumnSpec, DiagramSpec, LayoutResult, StateLayout, StateSpec, Theme } from "./types";

export function computeLayout(spec: DiagramSpec, theme: Theme): LayoutResult {
  const states = spec.states;
  if (states.length === 0) {
    throw new Error("At least one state is required.");
  }

  const columns = resolveColumns(spec);
  const xCenters = computeColumnCenters(columns, theme);
  const columnWidths = computeColumnWidths(columns, theme);

  const energies = states.map((state) => state.energy);
  const energyMin = spec.metadata.energy_min ?? Math.min(...energies);
  const energyMax = spec.metadata.energy_max ?? Math.max(...energies);
  const energyRange = energyMax === energyMin ? 1 : energyMax - energyMin;
  const energyToY = (energy: number) =>
    theme.layout_policy.axes_y_min + ((energy - energyMin) / energyRange) * (theme.layout_policy.axes_y_max - theme.layout_policy.axes_y_min);

  const figWidth = spec.style.figure_width ?? (columns.length * theme.layout_policy.figure_auto_width_per_group + theme.layout_policy.figure_auto_width_base);
  const figHeight = spec.style.figure_height ?? Math.max(theme.layout_policy.figure_auto_height_min, energyRange / theme.layout_policy.figure_auto_height_energy_scale);

  const resolvedY = new Map<string, number>();
  for (const column of columns) {
    const columnStates = states
      .filter((state) => resolveColumnId(state) === column.id)
      .map((state) => ({ id: state.id, y: state.y_position ?? energyToY(state.energy) }))
      .sort((left, right) => left.y - right.y);

    for (let index = 1; index < columnStates.length; index += 1) {
      if (columnStates[index].y - columnStates[index - 1].y < theme.layout_policy.state_overlap_threshold) {
        columnStates[index].y = columnStates[index - 1].y + theme.layout_policy.state_overlap_threshold;
      }
    }

    for (const placement of columnStates) {
      resolvedY.set(placement.id, placement.y);
    }
  }

  adjustYPositionsForLabelClearance(states, resolvedY, xCenters, figHeight, theme);

  const resultStates: Record<string, StateLayout> = {};
  for (const state of states) {
    const columnId = resolveColumnId(state);
    const center = xCenters[columnId];
    const width = columnWidths[columnId];
    const halfLine = 0.5 * theme.state_length * width;
    resultStates[state.id] = {
      state_id: state.id,
      x_center: center,
      y: resolvedY.get(state.id) ?? energyToY(state.energy),
      x_left: center - halfLine,
      x_right: center + halfLine,
      column_id: columnId
    };
  }

  return {
    states: resultStates,
    group_x_centers: xCenters,
    fig_width: figWidth,
    fig_height: figHeight
  };
}

function resolveColumns(spec: DiagramSpec): ColumnSpec[] {
  if (spec.columns.length === 0) {
    return inferColumnsFromStates(spec.states);
  }
  const groupMap = new Map(spec.columns.map((column) => [column.id, column]));
  for (const state of spec.states) {
    const groupId = resolveColumnId(state);
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, {
        id: groupId,
        column_order: groupMap.size,
        column_width: 1
      });
    }
  }
  return [...groupMap.values()].sort((left, right) => left.column_order - right.column_order || left.id.localeCompare(right.id));
}

function inferColumnsFromStates(states: StateSpec[]): ColumnSpec[] {
  const columnIds = [...new Set(states.map((state) => resolveColumnId(state)))];
  const numericColumns = columnIds
    .map((id) => ({ id, value: Number(id) }))
    .filter((entry) => Number.isInteger(entry.value));

  if (numericColumns.length === columnIds.length && numericColumns.length > 0) {
    const min = Math.min(...numericColumns.map((entry) => entry.value));
    const max = Math.max(...numericColumns.map((entry) => entry.value));
    return Array.from({ length: max - min + 1 }, (_, index) => {
      const value = min + index;
      return {
        id: String(value),
        column_order: index,
        column_width: 1
      };
    });
  }

  return columnIds
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((id, index) => ({
      id,
      column_order: index,
      column_width: 1
    }));
}

function computeColumnCenters(groups: ColumnSpec[], theme: Theme): Record<string, number> {
  const output: Record<string, number> = {};
  const span = theme.layout_policy.axes_x_max - theme.layout_policy.axes_x_min;
  if (groups.some((group) => group.x_position !== undefined)) {
    const fallbackStep = groups.length > 1 ? span / (groups.length - 1) : 0;
    groups.forEach((group, index) => {
      output[group.id] = group.x_position ?? (theme.layout_policy.axes_x_min + index * fallbackStep);
    });
    return output;
  }

  const totalWidth = groups.reduce((sum, group) => sum + Math.max(group.column_width, theme.layout_policy.group_min_column_width), 0) || 1;
  let cursor = theme.layout_policy.axes_x_min;
  for (const group of groups) {
    const width = span * Math.max(group.column_width, theme.layout_policy.group_min_column_width) / totalWidth;
    output[group.id] = cursor + width / 2;
    cursor += width;
  }
  return output;
}

function computeColumnWidths(groups: ColumnSpec[], theme: Theme): Record<string, number> {
  const span = theme.layout_policy.axes_x_max - theme.layout_policy.axes_x_min;
  const totalWidth = groups.reduce((sum, group) => sum + Math.max(group.column_width, theme.layout_policy.group_min_column_width), 0) || 1;
  return Object.fromEntries(groups.map((group) => [group.id, span * Math.max(group.column_width, theme.layout_policy.group_min_column_width) / totalWidth]));
}

function adjustYPositionsForLabelClearance(
  states: StateSpec[],
  resolvedY: Map<string, number>,
  xCenters: Record<string, number>,
  figHeight: number,
  theme: Theme
): void {
  const midpoint = (theme.layout_policy.axes_x_min + theme.layout_policy.axes_x_max) / 2;
  const groups = new Map<string, StateSpec[]>();

  for (const state of states) {
    const groupId = resolveColumnId(state);
    const side = state.label_side === "auto" ? (xCenters[groupId] <= midpoint ? "left" : "right") : state.label_side;
    if (side !== "left" && side !== "right") {
      continue;
    }
    const key = `${groupId}:${side}`;
    groups.set(key, [...(groups.get(key) ?? []), state]);
  }

  for (const groupStates of groups.values()) {
    const ordered = [...groupStates].sort((left, right) => (resolvedY.get(left.id) ?? 0) - (resolvedY.get(right.id) ?? 0));
    const minimum = theme.layout_policy.axes_y_min + theme.layout_policy.axes_margin;
    const maximum = theme.layout_policy.axes_y_max - theme.layout_policy.axes_margin;
    for (let index = 1; index < ordered.length; index += 1) {
      const previousState = ordered[index - 1];
      const currentState = ordered[index];
      const minGap = minimumLevelLabelGap(previousState, currentState, figHeight, theme);
      const previousY = resolvedY.get(previousState.id) ?? minimum;
      const currentY = resolvedY.get(currentState.id) ?? previousY + minGap;
      resolvedY.set(currentState.id, Math.max(currentY, previousY + minGap));
    }
    const last = ordered.at(-1);
    if (last) {
      const overflow = (resolvedY.get(last.id) ?? maximum) - maximum;
      if (overflow > 0) {
        for (const state of ordered) {
          resolvedY.set(state.id, (resolvedY.get(state.id) ?? 0) - overflow);
        }
      }
    }
    for (const state of ordered) {
      const current = resolvedY.get(state.id) ?? minimum;
      resolvedY.set(state.id, Math.min(maximum, Math.max(minimum, current)));
    }
  }
}

function minimumLevelLabelGap(lower: StateSpec, upper: StateSpec, figHeight: number, theme: Theme): number {
  return (
    estimatedLevelLabelHeight(lower, figHeight, theme) +
    estimatedLevelLabelHeight(upper, figHeight, theme)
  ) / 2 + theme.layout_policy.state_label_clearance_padding;
}

function estimatedLevelLabelHeight(state: StateSpec, figHeight: number, theme: Theme): number {
  const fontSize = state.font_size ?? theme.state_font_size;
  if (buildTermParts(state)) {
    const mainHeight = estimateTextHeightAxes(fontSize, { fig_height: figHeight, fig_width: 5, states: {}, group_x_centers: {} }, theme);
    const scriptHeight = estimateTextHeightAxes(termScriptFontSize(theme, fontSize), { fig_height: figHeight, fig_width: 5, states: {}, group_x_centers: {} }, theme);
    return mainHeight + scriptHeight * theme.layout_policy.term_height_script_scale;
  }
  return estimateTextHeightAxes(fontSize, { fig_height: figHeight, fig_width: 5, states: {}, group_x_centers: {} }, theme);
}

export function resolveColumnId(state: StateSpec): string {
  if (state.column !== undefined) {
    return String(state.column);
  }
  if (state.L !== undefined) {
    return String(state.L);
  }
  return state.config ?? "default";
}
