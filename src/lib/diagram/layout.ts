import { buildTermParts, levelLabelText } from "./termSymbols";
import { estimateTermHorizontalExtentsAxes, estimateTextHeightAxes, estimateTextWidthAxes, termScriptFontSize } from "./textMetrics";
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
  const horizontalLayouts = computeHorizontalStateLayouts(states, xCenters, columnWidths, theme);

  const resolvedY = new Map<string, number>();
  for (const column of columns) {
    const columnStates = states
      .filter((state) => resolveColumnId(state) === column.id)
      .map((state) => ({ id: state.id, y: state.y_position ?? energyToY(state.energy) }))
      .sort((left, right) => left.y - right.y);

    for (let index = 1; index < columnStates.length; index += 1) {
      if (
        stateLinesHorizontallyOverlap(
          horizontalLayouts[columnStates[index - 1].id],
          horizontalLayouts[columnStates[index].id]
        ) &&
        columnStates[index].y - columnStates[index - 1].y < theme.layout_policy.state_overlap_threshold
      ) {
        columnStates[index].y = columnStates[index - 1].y + theme.layout_policy.state_overlap_threshold;
      }
    }

    for (const placement of columnStates) {
      resolvedY.set(placement.id, placement.y);
    }
  }

  adjustYPositionsForLabelClearance(states, resolvedY, horizontalLayouts, figWidth, figHeight, theme);

  const resultStates: Record<string, StateLayout> = {};
  for (const state of states) {
    const horizontal = horizontalLayouts[state.id];
    resultStates[state.id] = {
      state_id: state.id,
      x_center: horizontal.x_center,
      y: resolvedY.get(state.id) ?? energyToY(state.energy),
      x_left: horizontal.x_left,
      x_right: horizontal.x_right,
      column_id: horizontal.column_id
    };
  }

  return {
    states: resultStates,
    column_x_centers: xCenters,
    fig_width: figWidth,
    fig_height: figHeight,
    energy_min: energyMin,
    energy_max: energyMax
  };
}

type HorizontalStateLayout = Pick<StateLayout, "x_center" | "x_left" | "x_right" | "column_id">;

function stateLinesHorizontallyOverlap(left: HorizontalStateLayout, right: HorizontalStateLayout): boolean {
  return left.x_left <= right.x_right && right.x_left <= left.x_right;
}

export function resolveColumns(spec: DiagramSpec): ColumnSpec[] {
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
  horizontalLayouts: Record<string, HorizontalStateLayout>,
  figWidth: number,
  figHeight: number,
  theme: Theme
): void {
  const midpoint = (theme.layout_policy.axes_x_min + theme.layout_policy.axes_x_max) / 2;
  const groups = new Map<string, StateSpec[]>();

  for (const state of states) {
    if (state.zeeman) {
      continue;
    }
    const horizontal = horizontalLayouts[state.id];
    const side = state.label_side === "auto" ? (horizontal.x_center <= midpoint ? "left" : "right") : state.label_side;
    if (side !== "left" && side !== "right") {
      continue;
    }
    const key = `${horizontal.column_id}:${side}`;
    groups.set(key, [...(groups.get(key) ?? []), state]);
  }

  for (const groupStates of groups.values()) {
    const ordered = [...groupStates].sort((left, right) => (resolvedY.get(left.id) ?? 0) - (resolvedY.get(right.id) ?? 0));
    const minimum = theme.layout_policy.axes_y_min + theme.layout_policy.axes_margin;
    const maximum = theme.layout_policy.axes_y_max - theme.layout_policy.axes_margin;
    for (let index = 1; index < ordered.length; index += 1) {
      const previousState = ordered[index - 1];
      const currentState = ordered[index];
      const minGap = labelsHorizontallyOverlap(previousState, currentState, horizontalLayouts, figWidth, figHeight, theme)
        ? minimumLevelLabelGap(previousState, currentState, figWidth, figHeight, theme)
        : 0;
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

function minimumLevelLabelGap(lower: StateSpec, upper: StateSpec, figWidth: number, figHeight: number, theme: Theme): number {
  return (
    estimatedLevelLabelHeight(lower, figWidth, figHeight, theme) +
    estimatedLevelLabelHeight(upper, figWidth, figHeight, theme)
  ) / 2 + theme.layout_policy.state_label_clearance_padding;
}

function estimatedLevelLabelHeight(state: StateSpec, figWidth: number, figHeight: number, theme: Theme): number {
  const metricsLayout = {
    fig_height: figHeight,
    fig_width: figWidth,
    states: {},
    column_x_centers: {},
    energy_min: 0,
    energy_max: 1
  };
  const fontSize = state.font_size ?? theme.state_font_size;
  if (buildTermParts(state)) {
    const mainHeight = estimateTextHeightAxes(fontSize, metricsLayout, theme);
    const scriptHeight = estimateTextHeightAxes(termScriptFontSize(theme, fontSize), metricsLayout, theme);
    return mainHeight + scriptHeight * theme.layout_policy.term_height_script_scale;
  }
  return estimateTextHeightAxes(fontSize, metricsLayout, theme);
}

function labelsHorizontallyOverlap(
  left: StateSpec,
  right: StateSpec,
  horizontalLayouts: Record<string, HorizontalStateLayout>,
  figWidth: number,
  figHeight: number,
  theme: Theme
): boolean {
  const leftBounds = estimatedLabelHorizontalBounds(left, horizontalLayouts[left.id], figWidth, figHeight, theme);
  const rightBounds = estimatedLabelHorizontalBounds(right, horizontalLayouts[right.id], figWidth, figHeight, theme);
  return leftBounds[0] <= rightBounds[1] && rightBounds[0] <= leftBounds[1];
}

function estimatedLabelHorizontalBounds(
  state: StateSpec,
  horizontal: HorizontalStateLayout,
  figWidth: number,
  figHeight: number,
  theme: Theme
): [number, number] {
  const layout = { fig_height: figHeight, fig_width: figWidth, states: {}, column_x_centers: {}, energy_min: 0, energy_max: 1 };
  const fontSize = state.font_size ?? theme.state_font_size;
  const parts = buildTermParts(state);
  const [leftExtent, rightExtent] = parts
    ? estimateTermHorizontalExtentsAxes(parts, layout, theme, fontSize)
    : (() => {
        const width = estimateTextWidthAxes(levelLabelText(state), fontSize, layout, theme);
        return [width / 2, width / 2] as [number, number];
      })();
  const gap = theme.layout_policy.state_label_gap;
  const midpoint = (theme.layout_policy.axes_x_min + theme.layout_policy.axes_x_max) / 2;
  const side = state.label_side === "auto" ? (horizontal.x_center <= midpoint ? "left" : "right") : state.label_side;
  if (side === "left" || side === "below-left") {
    return [horizontal.x_left - gap - leftExtent - rightExtent, horizontal.x_left - gap];
  }
  return [horizontal.x_right + gap, horizontal.x_right + gap + leftExtent + rightExtent];
}

function computeHorizontalStateLayouts(
  states: StateSpec[],
  xCenters: Record<string, number>,
  columnWidths: Record<string, number>,
  theme: Theme
): Record<string, HorizontalStateLayout> {
  const grouped = new Map<string, StateSpec[]>();
  for (const state of states) {
    const columnId = resolveColumnId(state);
    const key = state.zeeman ? `${columnId}:${state.zeeman.parent_id}` : `${columnId}:${state.id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), state]);
  }

  const output: Record<string, HorizontalStateLayout> = {};
  for (const statesInGroup of grouped.values()) {
    const columnId = resolveColumnId(statesInGroup[0]);
    const baseCenter = xCenters[columnId];
    const columnWidth = columnWidths[columnId];
    const fullStateWidth = theme.state_length * columnWidth;
    const zeemanLineFill = 0.95;
    const ordered = [...statesInGroup].sort((left, right) => {
      const magneticDelta = (left.zeeman?.magnetic_quantum_number ?? 0) - (right.zeeman?.magnetic_quantum_number ?? 0);
      return Math.abs(magneticDelta) > 1e-9
        ? magneticDelta
        : left.id.localeCompare(right.id, undefined, { numeric: true });
    });
    const zeemanGroup = ordered.length > 1 && ordered.some((state) => state.zeeman);
    const slotWidth = zeemanGroup
      ? fullStateWidth * (ordered[0].zeeman?.width_scale ?? 0.25)
      : fullStateWidth;
    const lineWidth = zeemanGroup ? slotWidth * zeemanLineFill : slotWidth;
    const halfLine = lineWidth / 2;
    ordered.forEach((state, index) => {
      const xCenter = zeemanGroup
        ? baseCenter + (index - (ordered.length - 1) / 2) * slotWidth
        : baseCenter;
      output[state.id] = {
        x_center: xCenter,
        x_left: xCenter - halfLine,
        x_right: xCenter + halfLine,
        column_id: columnId
      };
    });
  }

  return output;
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
