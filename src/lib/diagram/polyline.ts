export function trimPolylineEndpoints(points: [number, number][], startTrim: number, endTrim: number): [number, number][] {
  if (points.length < 2) {
    return points;
  }
  const totalLength = polylineLength(points);
  if (totalLength < 1e-9) {
    const point = points[0];
    return [point, point];
  }

  if (startTrim + endTrim >= totalLength) {
    const collapsedDistance = Math.max(0, Math.min(totalLength, (totalLength + startTrim - endTrim) / 2));
    const point = pointAlongPolyline(points, collapsedDistance);
    return [point, point];
  }

  const startTrimmed = trimPolylineStart(points, startTrim);
  return trimPolylineStart([...startTrimmed].reverse(), endTrim).reverse();
}

export function pointAlongPolyline(points: [number, number][], distance: number): [number, number] {
  if (points.length === 0) {
    return [0, 0];
  }
  if (distance <= 0 || points.length === 1) {
    return points[0];
  }
  let remaining = distance;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength < 1e-9) {
      continue;
    }
    if (remaining <= segmentLength) {
      const t = remaining / segmentLength;
      return [start[0] + dx * t, start[1] + dy * t];
    }
    remaining -= segmentLength;
  }
  return points.at(-1)!;
}

function trimPolylineStart(points: [number, number][], trimDistance: number): [number, number][] {
  if (points.length < 2 || trimDistance <= 0) {
    return [...points];
  }

  const epsilon = 1e-9;
  let remaining = trimDistance;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength < epsilon) {
      continue;
    }
    if (remaining < segmentLength - epsilon) {
      const t = remaining / segmentLength;
      return [[start[0] + dx * t, start[1] + dy * t], ...points.slice(index)];
    }
    remaining -= segmentLength;
    if (remaining <= epsilon) {
      return points.slice(index);
    }
  }

  const point = points.at(-1)!;
  return [point, point];
}

function polylineLength(points: [number, number][]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  return total;
}
