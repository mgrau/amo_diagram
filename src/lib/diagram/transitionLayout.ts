import type { LayoutPolicy, LayoutResult, StateLayout, TransitionSpec } from "./types";

export type AnchorKey = `${number}:${"upper" | "lower"}`;

type EndpointSpec = {
  transitionIndex: number;
  side: "upper" | "lower";
  stateId: string;
  targetX: number;
  targetY: number;
};

type PolylineBuilder = (index: number, transition: TransitionSpec, anchors: Record<AnchorKey, number>, layout: LayoutResult) => [number, number][];

export function computeAutoTransitionAnchors(
  transitions: TransitionSpec[],
  layout: LayoutResult,
  policy: LayoutPolicy,
  polylineBuilder: PolylineBuilder
): Record<AnchorKey, number> {
  const anchors: Record<AnchorKey, number> = {};
  const endpointSpecs = new Map<AnchorKey, EndpointSpec>();
  const stateEndpoints = new Map<string, AnchorKey[]>();

  transitions.forEach((transition, index) => {
    if (!(transition.upper in layout.states) || !(transition.lower in layout.states)) {
      return;
    }
    const upperKey = anchorKey(index, "upper");
    const lowerKey = anchorKey(index, "lower");
    anchors[upperKey] = transition.upper_anchor ?? 0.5;
    anchors[lowerKey] = transition.lower_anchor ?? 0.5;
    endpointSpecs.set(upperKey, {
      transitionIndex: index,
      side: "upper",
      stateId: transition.upper,
      targetX: layout.states[transition.lower].x_center,
      targetY: layout.states[transition.lower].y
    });
    endpointSpecs.set(lowerKey, {
      transitionIndex: index,
      side: "lower",
      stateId: transition.lower,
      targetX: layout.states[transition.upper].x_center,
      targetY: layout.states[transition.upper].y
    });
    if (transition.upper_anchor === undefined) {
      const groupKey = `${transition.upper}:upper`;
      stateEndpoints.set(groupKey, [...(stateEndpoints.get(groupKey) ?? []), upperKey]);
    }
    if (transition.lower_anchor === undefined) {
      const groupKey = `${transition.lower}:lower`;
      stateEndpoints.set(groupKey, [...(stateEndpoints.get(groupKey) ?? []), lowerKey]);
    }
  });

  // Phase 1: Center initialize (already done above — all auto-anchors default to 0.5)

  // Phase 2: Even distribute per (state, side) group
  if (policy.anchor_even_distribute) {
    for (const [, keys] of stateEndpoints) {
      const ordered = [...keys].sort((left, right) => endpointAngleKey(endpointSpecs.get(left)!, layout) - endpointAngleKey(endpointSpecs.get(right)!, layout));
      const N = ordered.length;
      for (let i = 0; i < N; i++) {
        anchors[ordered[i]] = (i + 1) / (N + 1);
      }
    }
  }

  // Phase 3: Simulated annealing
  if (policy.anchor_sa) {
    simulatedAnnealing(anchors, transitions, layout, stateEndpoints, policy, polylineBuilder);
  }

  return anchors;
}

export function anchorX(state: StateLayout, anchor: number): number {
  return state.x_left + anchor * (state.x_right - state.x_left);
}

export function anchorFromX(state: StateLayout, x: number): number {
  return (x - state.x_left) / Math.max(state.x_right - state.x_left, 1e-9);
}

export function clampAnchor(anchor: number): number {
  return Math.max(0.08, Math.min(0.92, anchor));
}

function endpointAngleKey(spec: EndpointSpec, layout: LayoutResult): number {
  const state = layout.states[spec.stateId];
  return Math.atan2(spec.targetY - state.y, spec.targetX - state.x_center);
}

// Mulberry32 seeded PRNG — deterministic, fast, good quality for SA
function makePrng(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianRandom(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function simulatedAnnealing(
  anchors: Record<AnchorKey, number>,
  transitions: TransitionSpec[],
  layout: LayoutResult,
  stateEndpoints: Map<string, AnchorKey[]>,
  policy: LayoutPolicy,
  polylineBuilder: PolylineBuilder
): void {
  const allKeys: AnchorKey[] = [...stateEndpoints.values()].flat();
  if (allKeys.length === 0) return;

  const rng = makePrng(0xdeadbeef);
  let energy = anchorScore(anchors, transitions, layout, stateEndpoints, policy, polylineBuilder);
  let best = { ...anchors };
  let bestEnergy = energy;
  let T = policy.anchor_sa_t_initial;

  while (T > policy.anchor_sa_t_final) {
    for (let step = 0; step < policy.anchor_sa_steps_per_temp; step++) {
      const candidate = { ...anchors };

      const key = allKeys[Math.floor(rng() * allKeys.length)];
      candidate[key] = clampAnchor(anchors[key] + gaussianRandom(rng) * policy.anchor_sa_perturb_sigma);

      const newEnergy = anchorScore(candidate, transitions, layout, stateEndpoints, policy, polylineBuilder);
      const dE = newEnergy - energy;
      if (dE < 0 || rng() < Math.exp(-dE / T)) {
        Object.assign(anchors, candidate);
        energy = newEnergy;
        if (energy < bestEnergy) {
          bestEnergy = energy;
          best = { ...anchors };
        }
      }
    }
    T *= policy.anchor_sa_cooling_rate;
  }

  Object.assign(anchors, best);
}

function anchorScore(
  anchors: Record<AnchorKey, number>,
  transitions: TransitionSpec[],
  layout: LayoutResult,
  stateEndpoints: Map<string, AnchorKey[]>,
  policy: LayoutPolicy,
  polylineBuilder: PolylineBuilder
): number {
  const crossings = countCrossings(anchors, transitions, layout, polylineBuilder);
  const center = centerAttractionPenalty(anchors, stateEndpoints);
  const repulsion = repulsionPenalty(anchors, stateEndpoints);
  const lineRepulsion = lineRepulsionPenalty(anchors, transitions, layout, polylineBuilder);
  const parallel = parallelPenalty(anchors, transitions, layout);
  return (
    crossings * policy.anchor_score_crossing_weight +
    center * policy.anchor_score_center_weight +
    repulsion * policy.anchor_score_repulsion_weight +
    lineRepulsion * policy.anchor_score_line_repulsion_weight +
    parallel * policy.anchor_score_parallel_weight
  );
}

function countCrossings(
  anchors: Record<AnchorKey, number>,
  transitions: TransitionSpec[],
  layout: LayoutResult,
  polylineBuilder: PolylineBuilder
): number {
  let crossings = 0;
  for (let leftIndex = 0; leftIndex < transitions.length; leftIndex += 1) {
    const leftPoints = polylineBuilder(leftIndex, transitions[leftIndex], anchors, layout);
    for (let rightIndex = leftIndex + 1; rightIndex < transitions.length; rightIndex += 1) {
      const rightPoints = polylineBuilder(rightIndex, transitions[rightIndex], anchors, layout);
      if (polylinesCross(leftPoints, rightPoints)) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

function lineRepulsionPenalty(
  anchors: Record<AnchorKey, number>,
  transitions: TransitionSpec[],
  layout: LayoutResult,
  polylineBuilder: PolylineBuilder
): number {
  const N = 8;
  const polylines: [number, number][][] = transitions.map((t, i) =>
    samplePolyline(polylineBuilder(i, t, anchors, layout), N)
  );
  let penalty = 0;
  const invNN = 1 / (N * N);
  for (let i = 0; i < polylines.length; i++) {
    for (let j = i + 1; j < polylines.length; j++) {
      const pi = polylines[i];
      const pj = polylines[j];
      let sum = 0;
      for (let a = 0; a < N; a++) {
        for (let b = 0; b < N; b++) {
          const dx = pi[a][0] - pj[b][0];
          const dy = pi[a][1] - pj[b][1];
          sum += 1 / Math.max(Math.sqrt(dx * dx + dy * dy), 1e-6);
        }
      }
      penalty += invNN * sum;
    }
  }
  return penalty;
}

function samplePolyline(points: [number, number][], N: number): [number, number][] {
  if (points.length < 2) return points.length === 1 ? Array(N).fill(points[0]) : [];
  const segLengths: number[] = [];
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    totalLength += len;
  }
  if (totalLength < 1e-12) return Array(N).fill(points[0]);
  const samples: [number, number][] = [];
  for (let k = 0; k < N; k++) {
    const target = (k + 0.5) / N * totalLength;
    let cumulative = 0;
    for (let i = 0; i < segLengths.length; i++) {
      if (cumulative + segLengths[i] >= target || i === segLengths.length - 1) {
        const t = segLengths[i] > 1e-12 ? (target - cumulative) / segLengths[i] : 0;
        samples.push([
          points[i][0] + t * (points[i + 1][0] - points[i][0]),
          points[i][1] + t * (points[i + 1][1] - points[i][1])
        ]);
        break;
      }
      cumulative += segLengths[i];
    }
  }
  return samples;
}

function parallelPenalty(anchors: Record<AnchorKey, number>, transitions: TransitionSpec[], layout: LayoutResult): number {
  const buckets = new Map<string, number[]>();
  transitions.forEach((transition, index) => {
    const upper = layout.states[transition.upper];
    const lower = layout.states[transition.lower];
    if (transition.wavy || upper.column_id === lower.column_id) {
      return;
    }
    const dx = anchorX(lower, anchors[anchorKey(index, "lower")]) - anchorX(upper, anchors[anchorKey(index, "upper")]);
    const dy = lower.y - upper.y;
    const angle = Math.atan2(dy, dx);
    const bucketKey = `${upper.column_id}->${lower.column_id}`;
    buckets.set(bucketKey, [...(buckets.get(bucketKey) ?? []), angle]);
  });
  let penalty = 0;
  for (const angles of buckets.values()) {
    angles.sort((a, b) => a - b);
    for (let index = 1; index < angles.length; index += 1) {
      penalty += Math.abs(angles[index] - angles[index - 1]);
    }
  }
  return penalty;
}

function repulsionPenalty(anchors: Record<AnchorKey, number>, stateEndpoints: Map<string, AnchorKey[]>): number {
  let penalty = 0;
  for (const keys of stateEndpoints.values()) {
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const dist = Math.abs(anchors[keys[i]] - anchors[keys[j]]);
        penalty += 1 / Math.max(dist, 1e-6);
      }
    }
  }
  return penalty;
}

function centerAttractionPenalty(anchors: Record<AnchorKey, number>, stateEndpoints: Map<string, AnchorKey[]>): number {
  let penalty = 0;
  for (const keys of stateEndpoints.values()) {
    for (const key of keys) {
      const d = anchors[key] - 0.5;
      penalty += d * d;
    }
  }
  return penalty;
}

function polylinesCross(left: [number, number][], right: [number, number][]): boolean {
  for (let i = 1; i < left.length; i += 1) {
    for (let j = 1; j < right.length; j += 1) {
      if (segmentsIntersect(left[i - 1], left[i], right[j - 1], right[j])) {
        return true;
      }
    }
  }
  return false;
}

function segmentsIntersect(a1: [number, number], a2: [number, number], b1: [number, number], b2: [number, number]): boolean {
  const denominator = (a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0]);
  if (Math.abs(denominator) < 1e-9) return false;
  const ua = ((b2[0] - b1[0]) * (a1[1] - b1[1]) - (b2[1] - b1[1]) * (a1[0] - b1[0])) / denominator;
  const ub = ((a2[0] - a1[0]) * (a1[1] - b1[1]) - (a2[1] - a1[1]) * (a1[0] - b1[0])) / denominator;
  return ua > 0 && ua < 1 && ub > 0 && ub < 1;
}

function anchorKey(index: number, side: "upper" | "lower"): AnchorKey {
  return `${index}:${side}`;
}
