export function trimPolylineEndpoints(points: [number, number][], startTrim: number, endTrim: number): [number, number][] {
  if (points.length < 2) {
    return points;
  }
  const startPoint = pointAlongPolyline(points, startTrim);
  const endPoint = pointAlongPolyline([...points].reverse(), endTrim);
  const trimmedMiddle = points.slice(1, -1);
  return [startPoint, ...trimmedMiddle, endPoint];
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
