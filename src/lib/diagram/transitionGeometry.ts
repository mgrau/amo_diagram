import { wavelengthToHex } from "./color";
import { trimPolylineEndpoints } from "./polyline";
import { normalizeTextAngle, pointOnPolyline, polylineAngle, polylineEndpointAngle } from "./transitionLabels";
import { anchorX, computeAutoTransitionAnchors, sameVisualColumn, type AnchorKey } from "./transitionLayout";
import type { LabelVisual, LayoutResult, Theme, TransitionSpec, TransitionVisual } from "./types";

export function buildTransitionVisuals(
  transitions: TransitionSpec[],
  layout: LayoutResult,
  theme: Theme
): TransitionVisual[] {
  const autoAnchors = computeAutoTransitionAnchors(
    transitions,
    layout,
    theme.layout_policy,
    (index, transition, anchors, nextLayout) => transitionPolylineForAnchors(index, transition, anchors, nextLayout, theme.endpoint_clearance)
  );
  const visuals = transitions
    .filter((transition) => transition.upper in layout.states && transition.lower in layout.states)
    .map((transition, index) => {
      const upper = layout.states[transition.upper];
      const lower = layout.states[transition.lower];
      const upperAnchor = transition.upper_anchor ?? autoAnchors[anchorKey(index, "upper")];
      const lowerAnchor = transition.lower_anchor ?? autoAnchors[anchorKey(index, "lower")];
      const sameColumn = sameVisualColumn(upper, lower);
      const { start, end } = sameColumn
        ? alignedSameColumnEndpoints(upper, lower, upperAnchor, lowerAnchor, transition)
        : {
            start: [anchorX(upper, upperAnchor) + transition.start_x_offset, upper.y] as [number, number],
            end: [anchorX(lower, lowerAnchor) + transition.end_x_offset, lower.y] as [number, number]
          };
      const rawPoints = transition.wavy ? buildWavyPoints(start, end, theme.layout_policy) : [start, end];
      const endpointClearance = transition.endpoint_clearance ?? theme.endpoint_clearance;
      const points = trimPolylineEndpoints(rawPoints, endpointClearance, endpointClearance);
      const color = transition.color ?? wavelengthToHex(transition.wavelength_nm, theme.transition_color);
      return {
        transition,
        index,
        points,
        label: buildTransitionLabel(transition, points),
        start_marker: transition.arrows === "double",
        end_marker: transition.arrows !== "none",
        color,
        linewidth: transition.linewidth ?? theme.transition_linewidth,
        linestyle: transition.linestyle,
        arrowhead: transition.arrowhead ?? theme.arrowhead,
        upper_anchor: upperAnchor,
        lower_anchor: lowerAnchor
      } satisfies TransitionVisual;
    });
  return visuals;
}

export function transitionPolylineForAnchors(
  index: number,
  transition: TransitionSpec,
  anchors: Record<AnchorKey, number>,
  layout: LayoutResult,
  defaultEndpointClearance: number
): [number, number][] {
  const upper = layout.states[transition.upper];
  const lower = layout.states[transition.lower];
  const sameColumn = sameVisualColumn(upper, lower);
  const { start, end } = sameColumn
    ? alignedSameColumnEndpoints(upper, lower, anchors[anchorKey(index, "upper")], anchors[anchorKey(index, "lower")], transition)
    : {
        start: [anchorX(upper, anchors[anchorKey(index, "upper")]) + transition.start_x_offset, upper.y] as [number, number],
        end: [anchorX(lower, anchors[anchorKey(index, "lower")]) + transition.end_x_offset, lower.y] as [number, number]
      };
  const rawPoints = transition.wavy
    ? buildWavyPoints(start, end, {
        wavy_steps: 160,
        wavy_cycles: 8,
        wavy_amplitude: 0.012,
        wavy_straight_fraction: 0.08,
        wavy_ramp_fraction: 0.07
      })
    : [start, end];
  const endpointClearance = transition.endpoint_clearance ?? defaultEndpointClearance;
  return trimPolylineEndpoints(rawPoints, endpointClearance, endpointClearance);
}

function buildTransitionLabel(transition: TransitionSpec, points: [number, number][]): LabelVisual | undefined {
  const defaultWavelengthLabel = transition.wavelength_nm !== undefined ? formatWavelengthLabel(transition.wavelength_nm) : undefined;
  const text = [transition.label ?? defaultWavelengthLabel, transition.label && transition.show_wavelength && transition.wavelength_nm ? formatWavelengthLabel(transition.wavelength_nm) : undefined]
    .filter(Boolean)
    .join("\n");
  if (!text) return undefined;
  const [x, y] = pointOnPolyline(points, transition.label_position);
  const transitionAngle = transition.wavy
    ? polylineEndpointAngle(points)
    : polylineAngle(points, transition.label_position);
  const angle = transition.alignment === "horizontal" ? 0 : normalizeTextAngle(transitionAngle);
  return {
    text,
    x: transition.label_x ?? x,
    y: transition.label_y ?? y,
    ha: transition.label_ha,
    va: transition.label_va,
    fontSize: transition.font_size ?? undefined,
    rotation: transition.label_rotation || angle,
    fontstyle: transition.label_fontstyle
  };
}

function formatWavelengthLabel(wavelengthNm: number): string {
  return `${Number.isInteger(wavelengthNm) ? wavelengthNm.toFixed(0) : wavelengthNm.toFixed(1)} nm`;
}

function buildWavyPoints(
  start: [number, number],
  end: [number, number],
  policy: Pick<Theme["layout_policy"], "wavy_steps" | "wavy_cycles" | "wavy_amplitude" | "wavy_straight_fraction" | "wavy_ramp_fraction">
): [number, number][] {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  const ux = dx / Math.max(length, 1e-9);
  const uy = dy / Math.max(length, 1e-9);
  const nx = -uy;
  const ny = ux;
  const straight = length * policy.wavy_straight_fraction;
  const ramp = length * policy.wavy_ramp_fraction;
  const points: [number, number][] = [];
  for (let step = 0; step <= policy.wavy_steps; step += 1) {
    const t = step / policy.wavy_steps;
    const distance = length * t;
    const baseX = start[0] + ux * distance;
    const baseY = start[1] + uy * distance;
    let amplitudeScale = 1;
    if (distance < straight) amplitudeScale = 0;
    else if (distance < straight + ramp) amplitudeScale = (distance - straight) / Math.max(ramp, 1e-9);
    else if (distance > length - straight) amplitudeScale = 0;
    else if (distance > length - straight - ramp) amplitudeScale = (length - straight - distance) / Math.max(ramp, 1e-9);
    const oscillation = Math.sin(t * Math.PI * 2 * policy.wavy_cycles) * policy.wavy_amplitude * amplitudeScale;
    points.push([baseX + nx * oscillation, baseY + ny * oscillation]);
  }
  return points;
}

function anchorKey(index: number, side: "upper" | "lower"): AnchorKey {
  return `${index}:${side}`;
}

function alignedSameColumnEndpoints(
  upper: LayoutResult["states"][string],
  lower: LayoutResult["states"][string],
  upperAnchor: number,
  lowerAnchor: number,
  transition: Pick<TransitionSpec, "start_x_offset" | "end_x_offset">
): { start: [number, number]; end: [number, number] } {
  const upperX = anchorX(upper, upperAnchor) + transition.start_x_offset;
  const lowerX = anchorX(lower, lowerAnchor) + transition.end_x_offset;
  const overlapLeft = Math.max(upper.x_left + transition.start_x_offset, lower.x_left + transition.end_x_offset);
  const overlapRight = Math.min(upper.x_right + transition.start_x_offset, lower.x_right + transition.end_x_offset);
  if (overlapLeft <= overlapRight) {
    const sharedX = Math.max(overlapLeft, Math.min(overlapRight, (upperX + lowerX) / 2));
    return {
      start: [sharedX, upper.y],
      end: [sharedX, lower.y]
    };
  }
  return {
    start: [upperX, upper.y],
    end: [lowerX, lower.y]
  };
}
