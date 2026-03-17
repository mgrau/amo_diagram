import { estimateTextBlockHeightAxes, estimateTextWidthAxes } from "./textMetrics";
import type { LayoutResult, Theme, TransitionVisual } from "./types";

export function pointOnPolyline(points: [number, number][], t: number): [number, number] {
  if (points.length === 1) {
    return points[0];
  }
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
    lengths.push(total);
  }
  const target = total * Math.max(0, Math.min(1, t));
  for (let index = 0; index < lengths.length; index += 1) {
    const previousLength = index === 0 ? 0 : lengths[index - 1];
    if (target <= lengths[index]) {
      const segmentT = (target - previousLength) / Math.max(lengths[index] - previousLength, 1e-9);
      return mix(points[index], points[index + 1], segmentT);
    }
  }
  return points.at(-1)!;
}

export function polylineAngle(points: [number, number][], t: number): number {
  if (points.length < 2) {
    return 0;
  }
  const point = pointOnPolyline(points, t);
  let nearestIndex = 1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const mid = mix(points[index - 1], points[index], 0.5);
    const segmentDistance = distance(point, mid);
    if (segmentDistance < nearestDistance) {
      nearestDistance = segmentDistance;
      nearestIndex = index;
    }
  }
  const [x1, y1] = points[nearestIndex - 1];
  const [x2, y2] = points[nearestIndex];
  return Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
}

export function normalizeTextAngle(angle: number): number {
  let normalized = angle;
  while (normalized > 90) normalized -= 180;
  while (normalized < -90) normalized += 180;
  return normalized;
}

export function polylineDistance(left: [number, number][], right: [number, number][]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < left.length; i += 1) {
    for (let j = 1; j < right.length; j += 1) {
      best = Math.min(best, segmentDistance(left[i - 1], left[i], right[j - 1], right[j]));
    }
  }
  return best;
}

export function optimizeTransitionLabelPositions(
  transitionVisuals: TransitionVisual[],
  staticBoxes: ReadonlyArray<[[number, number], number, number, number]>,
  layout: LayoutResult,
  theme: Theme
): void {
  const placed: Array<[[number, number], number, number, number]> = [];
  for (const visual of transitionVisuals) {
    if (!visual.label) {
      continue;
    }
    const base = pointOnPolyline(visual.points, visual.transition.label_position);
    const transitionAngle = polylineAngle(visual.points, visual.transition.label_position);
    const angle = visual.transition.alignment === "horizontal" ? 0 : normalizeTextAngle(transitionAngle);
    const fontSize = visual.label.fontSize ?? theme.transition_font_size;
    const width = estimateTextWidthAxes(visual.label.text, fontSize, layout, theme);
    const height = estimateTextBlockHeightAxes(visual.label.text, fontSize, layout, theme);
    const position = visual.transition.position;
    const resolved = position === "transition"
      ? base
      : chooseLabelPosition({
          base,
          textAngle: angle,
          transitionAngle,
          width,
          height,
          points: visual.points,
          position,
          staticBoxes,
          placed,
          theme
        });

    visual.label.x = visual.transition.label_x ?? (resolved[0] + visual.transition.label_offset_x);
    visual.label.y = visual.transition.label_y ?? (resolved[1] + visual.transition.label_offset_y);
    visual.label.rotation = visual.transition.label_rotation || angle;
    placed.push([[visual.label.x, visual.label.y], width, height, visual.label.rotation ?? 0]);
  }
}

function chooseLabelPosition({
  base,
  textAngle,
  transitionAngle,
  width,
  height,
  points,
  position,
  staticBoxes,
  placed,
  theme
}: {
  base: [number, number];
  textAngle: number;
  transitionAngle: number;
  width: number;
  height: number;
  points: [number, number][];
  position: "left" | "right" | "auto";
  staticBoxes: ReadonlyArray<[[number, number], number, number, number]>;
  placed: ReadonlyArray<[[number, number], number, number, number]>;
  theme: Theme;
}): [number, number] {
  const normal = normalForAngle(transitionAngle);
  const minimumOffset = minimumTransitionLabelOffset(width, height, textAngle, transitionAngle, theme);
  const step = Math.max(theme.layout_policy.transition_label_step_min, height * theme.layout_policy.transition_label_step_scale);
  const maxDistance = minimumOffset + height * Math.min(theme.layout_policy.transition_label_max_distance_scale, 0.9);
  const candidates = position === "auto" ? ([-1, 1] as const) : ([position === "left" ? -1 : 1] as const);
  let best = base;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const sign of candidates) {
    for (let offset = minimumOffset; offset <= maxDistance; offset += step) {
      const candidate: [number, number] = [
        base[0] + normal[0] * sign * offset,
        base[1] + normal[1] * sign * offset
      ];
      const box: [[number, number], number, number, number] = [candidate, width, height, textAngle];
      const score = candidateScore(box, points, staticBoxes, placed, offset, theme);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
        if (score <= offset * 4 + 1e-9) {
          break;
        }
      }
    }
  }
  return best;
}

function candidateScore(
  box: [[number, number], number, number, number],
  points: [number, number][],
  staticBoxes: ReadonlyArray<[[number, number], number, number, number]>,
  placed: ReadonlyArray<[[number, number], number, number, number]>,
  offset: number,
  theme: Theme
): number {
  const overlapPenalty = boxOverlapsPolyline(box, points) ? theme.layout_policy.transition_label_transition_overlap_weight : 0;
  const staticPenalty = overlapsAny(box, staticBoxes) ? theme.layout_policy.transition_label_static_overlap_weight : 0;
  const labelPenalty = overlapsAny(box, placed) ? theme.layout_policy.transition_label_label_overlap_weight : 0;
  const staticGapPenalty = gapPenalty(box, staticBoxes, theme.layout_policy.label_interference_gap) * theme.layout_policy.transition_label_static_gap_weight;
  const labelGapPenalty = gapPenalty(box, placed, theme.layout_policy.label_interference_gap) * theme.layout_policy.transition_label_label_gap_weight;
  return overlapPenalty + staticPenalty + labelPenalty + staticGapPenalty + labelGapPenalty + offset * 4;
}

export function boxOverlapsPolyline(
  box: [[number, number], number, number, number],
  points: [number, number][]
): boolean {
  const [center, width, height] = box;
  for (let index = 1; index < points.length; index += 1) {
    if (segmentIntersectsRect(points[index - 1], points[index], center, width, height)) {
      return true;
    }
  }
  return false;
}

function overlapsAny(box: [[number, number], number, number, number], others: ReadonlyArray<[[number, number], number, number, number]>): boolean {
  return others.some((other) => boxesOverlap(box, other));
}

function boxesOverlap(a: [[number, number], number, number, number], b: [[number, number], number, number, number]): boolean {
  const [centerA, widthA, heightA] = a;
  const [centerB, widthB, heightB] = b;
  return Math.abs(centerA[0] - centerB[0]) * 2 < widthA + widthB &&
    Math.abs(centerA[1] - centerB[1]) * 2 < heightA + heightB;
}

function gapPenalty(
  box: [[number, number], number, number, number],
  others: ReadonlyArray<[[number, number], number, number, number]>,
  desiredGap: number
): number {
  let penalty = 0;
  for (const other of others) {
    const gap = boxGap(box, other);
    if (gap < desiredGap) {
      penalty += Math.pow(desiredGap - gap, 2);
    }
  }
  return penalty;
}

function boxGap(a: [[number, number], number, number, number], b: [[number, number], number, number, number]): number {
  const [centerA, widthA, heightA] = a;
  const [centerB, widthB, heightB] = b;
  const dx = Math.max(0, Math.abs(centerA[0] - centerB[0]) - (widthA + widthB) / 2);
  const dy = Math.max(0, Math.abs(centerA[1] - centerB[1]) - (heightA + heightB) / 2);
  return Math.hypot(dx, dy);
}

function segmentIntersectsRect(
  p1: [number, number],
  p2: [number, number],
  center: [number, number],
  width: number,
  height: number
): boolean {
  const left = center[0] - width / 2;
  const right = center[0] + width / 2;
  const bottom = center[1] - height / 2;
  const top = center[1] + height / 2;
  return lineIntersectsLine(p1, p2, [left, bottom], [right, bottom]) ||
    lineIntersectsLine(p1, p2, [right, bottom], [right, top]) ||
    lineIntersectsLine(p1, p2, [right, top], [left, top]) ||
    lineIntersectsLine(p1, p2, [left, top], [left, bottom]);
}

function lineIntersectsLine(a1: [number, number], a2: [number, number], b1: [number, number], b2: [number, number]): boolean {
  const denominator = (a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0]);
  if (Math.abs(denominator) < 1e-9) return false;
  const ua = ((b2[0] - b1[0]) * (a1[1] - b1[1]) - (b2[1] - b1[1]) * (a1[0] - b1[0])) / denominator;
  const ub = ((a2[0] - a1[0]) * (a1[1] - b1[1]) - (a2[1] - a1[1]) * (a1[0] - b1[0])) / denominator;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

function segmentDistance(a1: [number, number], a2: [number, number], b1: [number, number], b2: [number, number]): number {
  return Math.min(
    pointSegmentDistance(a1, b1, b2),
    pointSegmentDistance(a2, b1, b2),
    pointSegmentDistance(b1, a1, a2),
    pointSegmentDistance(b2, a1, a2)
  );
}

function pointSegmentDistance(point: [number, number], start: [number, number], end: [number, number]): number {
  const [sx, sy] = start;
  const [ex, ey] = end;
  const dx = ex - sx;
  const dy = ey - sy;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return distance(point, start);
  }
  const t = Math.max(0, Math.min(1, ((point[0] - sx) * dx + (point[1] - sy) * dy) / (dx * dx + dy * dy)));
  return distance(point, [sx + dx * t, sy + dy * t]);
}

function distance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function mix(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function normalForAngle(angleDegrees: number): [number, number] {
  const radians = angleDegrees * Math.PI / 180;
  return [-Math.sin(radians), Math.cos(radians)];
}

function minimumTransitionLabelOffset(
  width: number,
  height: number,
  textAngle: number,
  transitionAngle: number,
  theme: Theme
): number {
  const delta = (textAngle - transitionAngle) * Math.PI / 180;
  const halfThickness = Math.abs(Math.sin(delta)) * width / 2 + Math.abs(Math.cos(delta)) * height / 2;
  return halfThickness + theme.layout_policy.label_line_clearance + theme.layout_policy.transition_label_pad_min;
}
