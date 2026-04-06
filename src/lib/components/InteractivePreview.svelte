<script lang="ts">
  import { onDestroy } from "svelte";
  import type { RenderedDiagram } from "../diagram/render";
  import {
    anchorFromStateLineX,
    endpointHandlePosition,
    setTransitionAnchorInYaml,
    updateTransitionLabelInYaml,
    updateTransitionStyleInYaml,
    type EditableTransitionSide
  } from "../diagram/manualEdits";
  import type { LabelInteraction, TransitionEndpointInteraction, TransitionInteraction } from "../diagram/types";

  export let rendered: RenderedDiagram | null = null;
  export let error = "";
  export let isRendering = false;
  export let yamlText = "";
  export let onChange: (value: string, immediate?: boolean) => void = () => {};

  type DragState = {
    transitionIndex: number;
    side: EditableTransitionSide;
    upperAnchor: number;
    lowerAnchor: number;
  };

  type LabelDragState = {
    transitionIndex: number;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    svgX: number;
    svgY: number;
    plotX: number;
    plotY: number;
  };

  type LabelRotateState = {
    transitionIndex: number;
    pointerId: number;
    centerX: number;
    centerY: number;
    startSvgAngle: number;
    startRotation: number;
  };

  type InspectorKind = "transition" | "label";

  type InspectorPosition = {
    x: number;
    y: number;
  };

  type InspectorDragState = {
    kind: InspectorKind;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
  };

  type DisplayedLabelState = {
    text: string;
    svgX: number;
    svgY: number;
    plotX: number;
    plotY: number;
    rotation: number;
    fontSize: number;
    width: number;
    height: number;
    ha: "left" | "center" | "right";
    va: "top" | "center" | "bottom";
    fontstyle?: string;
  };

  let previewSurface: HTMLDivElement;
  let transitionInspectorPanel: HTMLDivElement;
  let labelInspectorPanel: HTMLDivElement;
  let overlaySvg: SVGSVGElement;
  let selectedTransitionIndex: number | null = null;
  let selectedLabelTransitionIndex: number | null = null;
  let dragState: DragState | null = null;
  let labelDragState: LabelDragState | null = null;
  let labelRotateState: LabelRotateState | null = null;
  let activePointerId: number | null = null;
  let inspectorDragState: InspectorDragState | null = null;
  let transitionInspectorPosition: InspectorPosition | null = null;
  let labelInspectorPosition: InspectorPosition | null = null;
  let transitions: TransitionInteraction[] = [];
  let selectedTransition: TransitionInteraction | null = null;
  let selectedLabelTransition: TransitionInteraction | null = null;
  let styleDraftTransitionIndex: number | null = null;
  let styleDraftColor = "#2563eb";
  let styleDraftLinewidth = 2;
  let styleDraftArrowsize = 16;
  let labelDraftTransitionIndex: number | null = null;
  let labelDraftRotation = 0;
  let labelDraftFontSize = 14;
  let displayedLabelsByTransitionIndex: Record<number, DisplayedLabelState> = {};
  let transitionPanelPosition: InspectorPosition = { x: 12, y: 12 };
  let labelPanelPosition: InspectorPosition = { x: 12, y: 12 };

  $: transitions = rendered?.interaction.transitions ?? [];
  $: if (selectedTransitionIndex !== null && !transitions.some((transition) => transition.index === selectedTransitionIndex)) {
    selectedTransitionIndex = null;
  }
  $: if (
    selectedLabelTransitionIndex !== null &&
    !transitions.some((transition) => transition.index === selectedLabelTransitionIndex && transition.label)
  ) {
    selectedLabelTransitionIndex = null;
  }
  $: selectedTransition = selectedTransitionIndex === null
    ? null
    : transitions.find((transition) => transition.index === selectedTransitionIndex) ?? null;
  $: selectedLabelTransition = selectedLabelTransitionIndex === null
    ? null
    : transitions.find((transition) => transition.index === selectedLabelTransitionIndex && transition.label) ?? null;
  $: if (!selectedTransition) {
    styleDraftTransitionIndex = null;
  } else if (!transitionInspectorPosition && previewSurface) {
    transitionInspectorPosition = defaultInspectorPosition("transition");
  } else if (styleDraftTransitionIndex !== selectedTransition.index) {
    styleDraftTransitionIndex = selectedTransition.index;
    styleDraftColor = selectedTransition.color;
    styleDraftLinewidth = selectedTransition.linewidth;
    styleDraftArrowsize = selectedTransition.arrowsize;
  }
  $: if (!selectedLabelTransition?.label) {
    labelDraftTransitionIndex = null;
  } else if (!labelInspectorPosition && previewSurface) {
    labelInspectorPosition = defaultInspectorPosition("label");
  } else if (labelDraftTransitionIndex !== selectedLabelTransition.index) {
    labelDraftTransitionIndex = selectedLabelTransition.index;
    labelDraftRotation = normalizeSignedDegrees(selectedLabelTransition.label.rotation);
    labelDraftFontSize = selectedLabelTransition.label.font_size;
  }
  $: displayedLabelsByTransitionIndex = buildDisplayedLabelIndex(
    transitions,
    labelDragState,
    selectedLabelTransitionIndex,
    labelDraftTransitionIndex,
    labelDraftRotation,
    labelDraftFontSize
  );
  $: transitionPanelPosition = transitionInspectorPosition ?? defaultInspectorPosition("transition");
  $: labelPanelPosition = labelInspectorPosition ?? defaultInspectorPosition("label");

  function transitionPoints(points: [number, number][]): string {
    return points.map(([x, y]) => `${x},${y}`).join(" ");
  }

  function selectedPreviewColor(transition: TransitionInteraction): string {
    return styleDraftTransitionIndex === transition.index ? styleDraftColor : transition.color;
  }

  function selectedPreviewLinewidth(transition: TransitionInteraction): number {
    return styleDraftTransitionIndex === transition.index ? styleDraftLinewidth : transition.linewidth;
  }

  function selectedPreviewArrowsize(transition: TransitionInteraction): number {
    return styleDraftTransitionIndex === transition.index ? styleDraftArrowsize : transition.arrowsize;
  }

  function normalizeColorInput(color: string, fallback: string): string {
    const trimmed = color.trim();
    return /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(trimmed) ? trimmed : fallback;
  }

  function defaultInspectorPosition(kind: InspectorKind): InspectorPosition {
    if (!previewSurface) {
      return { x: 12, y: 12 };
    }
    const panel = kind === "transition" ? transitionInspectorPanel : labelInspectorPanel;
    const width = panel?.offsetWidth ?? 224;
    return kind === "transition"
      ? { x: Math.max(12, previewSurface.clientWidth - width - 12), y: 12 }
      : { x: 12, y: 12 };
  }

  function setInspectorPosition(kind: InspectorKind, position: InspectorPosition | null): void {
    if (kind === "transition") {
      transitionInspectorPosition = position;
      return;
    }
    labelInspectorPosition = position;
  }

  function displayedTransitionPoints(
    transition: TransitionInteraction,
    upperAnchor: number,
    lowerAnchor: number
  ): [number, number][] {
    if (upperAnchor === transition.upper.anchor && lowerAnchor === transition.lower.anchor) {
      return transition.points;
    }
    const originalUpper = { x: transition.upper.handle_x, y: transition.upper.handle_y };
    const originalLower = { x: transition.lower.handle_x, y: transition.lower.handle_y };
    const nextUpper = displayedHandle(transition.upper, upperAnchor);
    const nextLower = displayedHandle(transition.lower, lowerAnchor);
    return transformPolylineByEndpoints(transition.points, originalUpper, originalLower, nextUpper, nextLower);
  }

  function displayedAnchor(
    transitionIndex: number,
    side: EditableTransitionSide,
    fallback: number,
    currentDragState: DragState | null
  ): number {
    if (currentDragState?.transitionIndex !== transitionIndex) {
      return fallback;
    }
    return side === "upper" ? currentDragState.upperAnchor : currentDragState.lowerAnchor;
  }

  function displayedHandle(endpoint: TransitionEndpointInteraction, anchor: number): { x: number; y: number } {
    return endpointHandlePosition(endpoint, anchor);
  }

  function buildDisplayedLabelState(
    label: LabelInteraction,
    drag: LabelDragState | null,
    selected: boolean,
    draftRotation: number,
    draftFontSize: number
  ): DisplayedLabelState {
    const fontSize = selected ? draftFontSize : label.font_size;
    const rotation = selected ? draftRotation : label.rotation;
    const scale = label.font_size > 0 ? fontSize / label.font_size : 1;
    return {
      text: label.text,
      svgX: drag?.svgX ?? label.x,
      svgY: drag?.svgY ?? label.y,
      plotX: drag?.plotX ?? label.plot_x,
      plotY: drag?.plotY ?? label.plot_y,
      rotation,
      fontSize,
      width: Math.max(1, label.width * scale),
      height: Math.max(1, label.height * scale),
      ha: label.ha,
      va: label.va,
      fontstyle: label.fontstyle
    };
  }

  function buildDisplayedLabelIndex(
    items: TransitionInteraction[],
    drag: LabelDragState | null,
    selectedIndex: number | null,
    draftIndex: number | null,
    draftRotation: number,
    draftFontSize: number
  ): Record<number, DisplayedLabelState> {
    return Object.fromEntries(
      items
        .filter((transition) => transition.label)
        .map((transition) => {
          const label = transition.label!;
          return [
            transition.index,
            buildDisplayedLabelState(
              label,
              drag?.transitionIndex === transition.index ? drag : null,
              selectedIndex === transition.index && draftIndex === transition.index,
              draftRotation,
              draftFontSize
            )
          ];
        })
    );
  }

  function labelBox(
    label: Pick<DisplayedLabelState, "svgX" | "svgY" | "ha" | "va" | "width" | "height">,
    padding = 0
  ): { left: number; top: number; width: number; height: number } {
    const width = label.width + padding * 2;
    const height = label.height + padding * 2;
    const baseLeft = label.ha === "center"
      ? label.svgX - label.width / 2
      : label.ha === "right"
        ? label.svgX - label.width
        : label.svgX;
    const baseTop = label.va === "top"
      ? label.svgY
      : label.va === "bottom"
        ? label.svgY - label.height
        : label.svgY - label.height / 2;
    return {
      left: baseLeft - padding,
      top: baseTop - padding,
      width,
      height
    };
  }

  function selectTransition(index: number): void {
    selectedLabelTransitionIndex = null;
    clearLabelDragState();
    clearLabelRotateState();
    selectedTransitionIndex = index;
  }

  function selectLabel(index: number): void {
    selectedTransitionIndex = null;
    clearDragState();
    clearLabelDragState();
    clearLabelRotateState();
    selectedLabelTransitionIndex = index;
  }

  function beginEndpointDrag(event: PointerEvent, transition: TransitionInteraction, side: EditableTransitionSide): void {
    event.preventDefault();
    event.stopPropagation();
    activePointerId = event.pointerId;
    if (event.currentTarget instanceof Element && "setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    selectedLabelTransitionIndex = null;
    selectedTransitionIndex = transition.index;
    dragState = {
      transitionIndex: transition.index,
      side,
      upperAnchor: transition.upper.anchor,
      lowerAnchor: transition.lower.anchor
    };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
  }

  function handleWindowPointerMove(event: PointerEvent): void {
    if (!dragState || !overlaySvg || (activePointerId !== null && event.pointerId !== activePointerId)) {
      return;
    }
    const currentDragState = dragState;
    const transition = transitions.find((candidate) => candidate.index === currentDragState.transitionIndex);
    if (!transition) {
      clearDragState();
      return;
    }
    const nextPoint = clientToSvgPoint(overlaySvg, event.clientX, event.clientY);
    if (!nextPoint) {
      return;
    }
    const endpoint = currentDragState.side === "upper" ? transition.upper : transition.lower;
    const nextAnchor = anchorFromStateLineX(endpoint, nextPoint.x);
    dragState = currentDragState.side === "upper"
      ? { ...currentDragState, upperAnchor: nextAnchor }
      : { ...currentDragState, lowerAnchor: nextAnchor };
  }

  function handleWindowPointerUp(): void {
    if (!dragState) {
      return;
    }
    try {
      const nextAnchor = dragState.side === "upper" ? dragState.upperAnchor : dragState.lowerAnchor;
      const nextSource = setTransitionAnchorInYaml(yamlText, dragState.transitionIndex, dragState.side, nextAnchor);
      clearDragState();
      onChange(nextSource, true);
    } finally {
      clearDragState();
    }
  }

  function clearDragState(): void {
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", handleWindowPointerUp);
    window.removeEventListener("pointercancel", handleWindowPointerUp);
    activePointerId = null;
    dragState = null;
  }

  function beginLabelDrag(event: PointerEvent, transition: TransitionInteraction): void {
    if (!transition.label || !overlaySvg) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectLabel(transition.index);
    const pointerPoint = clientToSvgPoint(overlaySvg, event.clientX, event.clientY);
    const currentLabel = displayedLabelsByTransitionIndex[transition.index]
      ?? buildDisplayedLabelState(transition.label, null, false, transition.label.rotation, transition.label.font_size);
    labelDragState = {
      transitionIndex: transition.index,
      pointerId: event.pointerId,
      offsetX: currentLabel.svgX - (pointerPoint?.x ?? currentLabel.svgX),
      offsetY: currentLabel.svgY - (pointerPoint?.y ?? currentLabel.svgY),
      svgX: currentLabel.svgX,
      svgY: currentLabel.svgY,
      plotX: currentLabel.plotX,
      plotY: currentLabel.plotY
    };
    if (event.currentTarget instanceof Element && "setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    window.addEventListener("pointermove", handleLabelPointerMove);
    window.addEventListener("pointerup", handleLabelPointerUp);
    window.addEventListener("pointercancel", handleLabelPointerUp);
  }

  function handleLabelPointerMove(event: PointerEvent): void {
    if (!labelDragState || !overlaySvg || event.pointerId !== labelDragState.pointerId || !rendered) {
      return;
    }
    const nextPoint = clientToSvgPoint(overlaySvg, event.clientX, event.clientY);
    if (!nextPoint) {
      return;
    }
    const nextSvgX = nextPoint.x + labelDragState.offsetX;
    const nextSvgY = nextPoint.y + labelDragState.offsetY;
    const nextPlot = svgPointToPlotPoint(nextSvgX, nextSvgY, rendered.interaction.plot);
    labelDragState = {
      ...labelDragState,
      svgX: nextSvgX,
      svgY: nextSvgY,
      plotX: nextPlot.x,
      plotY: nextPlot.y
    };
  }

  function handleLabelPointerUp(event: PointerEvent): void {
    if (!labelDragState || event.pointerId !== labelDragState.pointerId) {
      return;
    }
    try {
      const nextSource = updateTransitionLabelInYaml(yamlText, labelDragState.transitionIndex, {
        plotX: labelDragState.plotX,
        plotY: labelDragState.plotY
      });
      clearLabelDragState();
      onChange(nextSource, true);
    } finally {
      clearLabelDragState();
    }
  }

  function clearLabelDragState(): void {
    window.removeEventListener("pointermove", handleLabelPointerMove);
    window.removeEventListener("pointerup", handleLabelPointerUp);
    window.removeEventListener("pointercancel", handleLabelPointerUp);
    labelDragState = null;
  }

  function beginLabelRotate(event: PointerEvent, transition: TransitionInteraction): void {
    if (!transition.label || !overlaySvg) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectLabel(transition.index);
    const currentLabel = displayedLabelsByTransitionIndex[transition.index]
      ?? buildDisplayedLabelState(transition.label, null, false, transition.label.rotation, transition.label.font_size);
    const pointerPoint = clientToSvgPoint(overlaySvg, event.clientX, event.clientY);
    if (!pointerPoint) {
      return;
    }
    labelDraftRotation = normalizeSignedDegrees(currentLabel.rotation);
    labelRotateState = {
      transitionIndex: transition.index,
      pointerId: event.pointerId,
      centerX: currentLabel.svgX,
      centerY: currentLabel.svgY,
      startSvgAngle: svgPointerAngle(pointerPoint.x, pointerPoint.y, currentLabel.svgX, currentLabel.svgY),
      startRotation: currentLabel.rotation
    };
    if (event.currentTarget instanceof Element && "setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    window.addEventListener("pointermove", handleLabelRotatePointerMove);
    window.addEventListener("pointerup", handleLabelRotatePointerUp);
    window.addEventListener("pointercancel", handleLabelRotatePointerUp);
  }

  function handleLabelRotatePointerMove(event: PointerEvent): void {
    if (!labelRotateState || !overlaySvg || event.pointerId !== labelRotateState.pointerId) {
      return;
    }
    const point = clientToSvgPoint(overlaySvg, event.clientX, event.clientY);
    if (!point) {
      return;
    }
    const currentSvgAngle = svgPointerAngle(point.x, point.y, labelRotateState.centerX, labelRotateState.centerY);
    labelDraftRotation = normalizeSignedDegrees(labelRotateState.startRotation - (currentSvgAngle - labelRotateState.startSvgAngle));
  }

  function handleLabelRotatePointerUp(event: PointerEvent): void {
    if (!labelRotateState || event.pointerId !== labelRotateState.pointerId) {
      return;
    }
    try {
      const transitionIndex = labelRotateState.transitionIndex;
      clearLabelRotateState();
      onChange(updateTransitionLabelInYaml(yamlText, transitionIndex, { rotation: labelDraftRotation }), false);
    } finally {
      clearLabelRotateState();
    }
  }

  function clearLabelRotateState(): void {
    window.removeEventListener("pointermove", handleLabelRotatePointerMove);
    window.removeEventListener("pointerup", handleLabelRotatePointerUp);
    window.removeEventListener("pointercancel", handleLabelRotatePointerUp);
    labelRotateState = null;
  }

  function applyTransitionColor(color: string): void {
    if (!selectedTransition) {
      return;
    }
    styleDraftColor = normalizeColorInput(color, selectedTransition.color);
  }

  function applyTransitionLinewidth(linewidth: number): void {
    if (!selectedTransition || !Number.isFinite(linewidth)) {
      return;
    }
    styleDraftLinewidth = Math.max(0.25, linewidth);
  }

  function applyTransitionArrowsize(arrowsize: number): void {
    if (!selectedTransition || !Number.isFinite(arrowsize)) {
      return;
    }
    styleDraftArrowsize = Math.max(1, arrowsize);
  }

  function commitTransitionColor(): void {
    if (!selectedTransition) {
      return;
    }
    onChange(updateTransitionStyleInYaml(yamlText, selectedTransition.index, { color: styleDraftColor }), false);
  }

  function commitTransitionLinewidth(): void {
    if (!selectedTransition) {
      return;
    }
    onChange(updateTransitionStyleInYaml(yamlText, selectedTransition.index, { linewidth: styleDraftLinewidth }), false);
  }

  function commitTransitionArrowsize(): void {
    if (!selectedTransition) {
      return;
    }
    onChange(updateTransitionStyleInYaml(yamlText, selectedTransition.index, { arrowsize: styleDraftArrowsize }), false);
  }

  function applyLabelRotation(rotation: number): void {
    if (!selectedLabelTransition?.label || !Number.isFinite(rotation)) {
      return;
    }
    labelDraftRotation = normalizeSignedDegrees(rotation);
  }

  function applyLabelFontSize(fontSize: number): void {
    if (!selectedLabelTransition?.label || !Number.isFinite(fontSize)) {
      return;
    }
    labelDraftFontSize = Math.max(1, fontSize);
  }

  function commitLabelRotation(): void {
    if (!selectedLabelTransition?.label) {
      return;
    }
    onChange(updateTransitionLabelInYaml(yamlText, selectedLabelTransition.index, { rotation: labelDraftRotation }), false);
  }

  function commitLabelFontSize(): void {
    if (!selectedLabelTransition?.label) {
      return;
    }
    onChange(updateTransitionLabelInYaml(yamlText, selectedLabelTransition.index, { fontSize: labelDraftFontSize }), false);
  }

  function beginInspectorDrag(kind: InspectorKind, event: PointerEvent): void {
    if (!previewSurface) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const origin = kind === "transition" ? transitionPanelPosition : labelPanelPosition;
    setInspectorPosition(kind, origin);
    inspectorDragState = {
      kind,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: origin.x,
      originY: origin.y
    };
    if (event.currentTarget instanceof Element && "setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    window.addEventListener("pointermove", handleInspectorPointerMove);
    window.addEventListener("pointerup", handleInspectorPointerUp);
    window.addEventListener("pointercancel", handleInspectorPointerUp);
  }

  function handleInspectorPointerMove(event: PointerEvent): void {
    if (!inspectorDragState || event.pointerId !== inspectorDragState.pointerId || !previewSurface) {
      return;
    }
    const panel = inspectorDragState.kind === "transition" ? transitionInspectorPanel : labelInspectorPanel;
    const width = panel?.offsetWidth ?? 224;
    const height = panel?.offsetHeight ?? 180;
    const x = inspectorDragState.originX + (event.clientX - inspectorDragState.startClientX);
    const y = inspectorDragState.originY + (event.clientY - inspectorDragState.startClientY);
    setInspectorPosition(inspectorDragState.kind, {
      x: Math.max(8, Math.min(previewSurface.clientWidth - width - 8, x)),
      y: Math.max(8, Math.min(previewSurface.clientHeight - height - 8, y))
    });
  }

  function handleInspectorPointerUp(event: PointerEvent): void {
    if (!inspectorDragState || event.pointerId !== inspectorDragState.pointerId) {
      return;
    }
    clearInspectorDragState();
  }

  function clearInspectorDragState(): void {
    window.removeEventListener("pointermove", handleInspectorPointerMove);
    window.removeEventListener("pointerup", handleInspectorPointerUp);
    window.removeEventListener("pointercancel", handleInspectorPointerUp);
    inspectorDragState = null;
  }

  function clientToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): DOMPoint | null {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const viewBox = svg.viewBox.baseVal;
    const viewBoxX = Number.isFinite(viewBox?.x) ? viewBox.x : 0;
    const viewBoxY = Number.isFinite(viewBox?.y) ? viewBox.y : 0;
    const viewBoxWidth = Number.isFinite(viewBox?.width) && viewBox.width > 0 ? viewBox.width : rect.width;
    const viewBoxHeight = Number.isFinite(viewBox?.height) && viewBox.height > 0 ? viewBox.height : rect.height;
    const x = viewBoxX + ((clientX - rect.left) / rect.width) * viewBoxWidth;
    const y = viewBoxY + ((clientY - rect.top) / rect.height) * viewBoxHeight;
    return new DOMPoint(x, y);
  }

  function svgPointToPlotPoint(
    svgX: number,
    svgY: number,
    plot: RenderedDiagram["interaction"]["plot"]
  ): { x: number; y: number } {
    return {
      x: plot.axes_x_min + ((svgX - plot.left) / plot.width) * (plot.axes_x_max - plot.axes_x_min),
      y: plot.axes_y_max - ((svgY - plot.top) / plot.height) * (plot.axes_y_max - plot.axes_y_min)
    };
  }

  function transformPolylineByEndpoints(
    points: [number, number][],
    originalStart: { x: number; y: number },
    originalEnd: { x: number; y: number },
    nextStart: { x: number; y: number },
    nextEnd: { x: number; y: number }
  ): [number, number][] {
    const originalDx = originalEnd.x - originalStart.x;
    const originalDy = originalEnd.y - originalStart.y;
    const originalLength = Math.hypot(originalDx, originalDy);
    if (originalLength < 1e-9) {
      const shiftX = nextStart.x - originalStart.x;
      const shiftY = nextStart.y - originalStart.y;
      return points.map(([x, y]) => [x + shiftX, y + shiftY]);
    }

    const nextDx = nextEnd.x - nextStart.x;
    const nextDy = nextEnd.y - nextStart.y;
    const nextLength = Math.hypot(nextDx, nextDy);
    const scale = nextLength / originalLength;

    const originalUx = originalDx / originalLength;
    const originalUy = originalDy / originalLength;
    const originalNx = -originalUy;
    const originalNy = originalUx;

    const nextUx = nextLength < 1e-9 ? originalUx : nextDx / nextLength;
    const nextUy = nextLength < 1e-9 ? originalUy : nextDy / nextLength;
    const nextNx = -nextUy;
    const nextNy = nextUx;

    return points.map(([x, y]) => {
      const relX = x - originalStart.x;
      const relY = y - originalStart.y;
      const parallel = relX * originalUx + relY * originalUy;
      const perpendicular = relX * originalNx + relY * originalNy;
      return [
        nextStart.x + (parallel * scale) * nextUx + (perpendicular * scale) * nextNx,
        nextStart.y + (parallel * scale) * nextUy + (perpendicular * scale) * nextNy
      ];
    });
  }

  function arrowheadPoints(
    style: TransitionInteraction["arrowhead"],
    start: [number, number],
    end: [number, number],
    arrowsize: number
  ): string {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) {
      return "";
    }
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const arrowLength = arrowsize * 0.75;
    const arrowWidth = arrowLength * 0.32;
    const base: [number, number] = [end[0] - ux * arrowLength, end[1] - uy * arrowLength];
    const left: [number, number] = [base[0] + nx * arrowWidth, base[1] + ny * arrowWidth];
    const right: [number, number] = [base[0] - nx * arrowWidth, base[1] - ny * arrowWidth];
    if (style === "angle") {
      return [left, end, right].map(([x, y]) => `${x},${y}`).join(" ");
    }
    if (style === "stealth") {
      const notch: [number, number] = [end[0] - ux * arrowLength * 0.56, end[1] - uy * arrowLength * 0.56];
      const rear: [number, number] = [end[0] - ux * arrowLength * 1.08, end[1] - uy * arrowLength * 1.08];
      const rearLeft: [number, number] = [rear[0] + nx * arrowWidth * 0.68, rear[1] + ny * arrowWidth * 0.68];
      const rearRight: [number, number] = [rear[0] - nx * arrowWidth * 0.68, rear[1] - ny * arrowWidth * 0.68];
      return [end, left, rearLeft, notch, rearRight, right].map(([x, y]) => `${x},${y}`).join(" ");
    }
    return [end, left, right].map(([x, y]) => `${x},${y}`).join(" ");
  }

  function labelPreviewActive(isDragging: boolean, label: LabelInteraction, displayed: DisplayedLabelState): boolean {
    return isDragging
      || Math.abs(displayed.rotation - label.rotation) > 1e-6
      || Math.abs(displayed.fontSize - label.font_size) > 1e-6;
  }

  function labelPositionChanged(label: LabelInteraction, displayed: DisplayedLabelState): boolean {
    return Math.abs(displayed.svgX - label.x) > 1e-6 || Math.abs(displayed.svgY - label.y) > 1e-6;
  }

  function labelTextAnchor(ha: LabelInteraction["ha"]): "start" | "middle" | "end" {
    return ha === "left" ? "start" : ha === "right" ? "end" : "middle";
  }

  function labelDominantBaseline(va: LabelInteraction["va"]): "text-before-edge" | "middle" | "text-after-edge" {
    return va === "top" ? "text-before-edge" : va === "bottom" ? "text-after-edge" : "middle";
  }

  function labelLineStartY(label: DisplayedLabelState): number {
    const lineHeight = label.fontSize * 1.1;
    const totalHeight = (label.text.split("\n").length - 1) * lineHeight;
    if (label.va === "top") {
      return label.svgY;
    }
    if (label.va === "bottom") {
      return label.svgY - totalHeight;
    }
    return label.svgY - totalHeight / 2;
  }

  function svgRotationTransform(rotation: number, x: number, y: number): string | undefined {
    return Math.abs(rotation) > 1e-6 ? `rotate(${-rotation} ${x} ${y})` : undefined;
  }

  function normalizeSignedDegrees(rotation: number): number {
    let normalized = rotation % 360;
    if (normalized <= -180) {
      normalized += 360;
    } else if (normalized > 180) {
      normalized -= 360;
    }
    return normalized;
  }

  function svgPointerAngle(pointerX: number, pointerY: number, centerX: number, centerY: number): number {
    return Math.atan2(pointerY - centerY, pointerX - centerX) * 180 / Math.PI;
  }

  function rotationHandleGeometry(label: DisplayedLabelState): {
    stemX: number;
    stemY: number;
    handleX: number;
    handleY: number;
  } {
    const stemRadius = label.height / 2 + 8;
    const handleRadius = label.height / 2 + 24;
    const angle = (-label.rotation - 90) * Math.PI / 180;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    return {
      stemX: label.svgX + ux * stemRadius,
      stemY: label.svgY + uy * stemRadius,
      handleX: label.svgX + ux * handleRadius,
      handleY: label.svgY + uy * handleRadius
    };
  }

  onDestroy(() => {
    clearDragState();
    clearLabelDragState();
    clearLabelRotateState();
    clearInspectorDragState();
  });
</script>

{#if error}
  <div class="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-600">
    {error}
  </div>
{/if}
{#if rendered}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    bind:this={previewSurface}
    class="relative min-h-full w-full"
    on:click={() => {
      if (!dragState && !labelDragState && !labelRotateState && !inspectorDragState) {
        selectedTransitionIndex = null;
        selectedLabelTransitionIndex = null;
      }
    }}
  >
    <div class="flex min-h-full items-start justify-center">
      <div class="relative rounded-sm border border-gray-300 bg-white">
        {@html rendered.svg}
        <svg
          bind:this={overlaySvg}
          class="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${rendered.interaction.width} ${rendered.interaction.height}`}
          aria-hidden="true"
          style="touch-action:none"
        >
          {#each transitions as transition}
            {@const upperAnchor = displayedAnchor(transition.index, "upper", transition.upper.anchor, dragState)}
            {@const lowerAnchor = displayedAnchor(transition.index, "lower", transition.lower.anchor, dragState)}
            {@const livePoints = displayedTransitionPoints(transition, upperAnchor, lowerAnchor)}
            {@const previewColor = selectedPreviewColor(transition)}
            {@const previewLinewidth = selectedPreviewLinewidth(transition)}
            {@const previewArrowsize = selectedPreviewArrowsize(transition)}
            <polyline
              points={transitionPoints(livePoints)}
              fill="none"
              stroke={selectedTransitionIndex === transition.index ? "#2563eb" : "transparent"}
              stroke-opacity={selectedTransitionIndex === transition.index ? "0.18" : "0.001"}
              stroke-width={selectedTransitionIndex === transition.index ? "10" : "16"}
              vector-effect="non-scaling-stroke"
              pointer-events="none"
            />
            {#if selectedTransitionIndex === transition.index}
              <polyline
                points={transitionPoints(livePoints)}
                fill="none"
                stroke={previewColor}
                stroke-opacity="0.95"
                stroke-width={previewLinewidth}
                vector-effect="non-scaling-stroke"
                pointer-events="none"
              />
              {#if transition.start_marker}
                {#if transition.arrowhead === "angle"}
                  <polyline
                    points={arrowheadPoints(transition.arrowhead, livePoints[1], livePoints[0], previewArrowsize)}
                    fill="none"
                    stroke={previewColor}
                    stroke-width={previewLinewidth}
                    vector-effect="non-scaling-stroke"
                    pointer-events="none"
                  />
                {:else}
                  <polygon
                    points={arrowheadPoints(transition.arrowhead, livePoints[1], livePoints[0], previewArrowsize)}
                    fill={previewColor}
                    stroke={transition.arrowhead === "stealth" ? "none" : previewColor}
                    stroke-width={transition.arrowhead === "stealth" ? 0 : previewLinewidth}
                    vector-effect="non-scaling-stroke"
                    pointer-events="none"
                  />
                {/if}
              {/if}
              {#if transition.end_marker}
                {#if transition.arrowhead === "angle"}
                  <polyline
                    points={arrowheadPoints(transition.arrowhead, livePoints[livePoints.length - 2], livePoints[livePoints.length - 1], previewArrowsize)}
                    fill="none"
                    stroke={previewColor}
                    stroke-width={previewLinewidth}
                    vector-effect="non-scaling-stroke"
                    pointer-events="none"
                  />
                {:else}
                  <polygon
                    points={arrowheadPoints(transition.arrowhead, livePoints[livePoints.length - 2], livePoints[livePoints.length - 1], previewArrowsize)}
                    fill={previewColor}
                    stroke={transition.arrowhead === "stealth" ? "none" : previewColor}
                    stroke-width={transition.arrowhead === "stealth" ? 0 : previewLinewidth}
                    vector-effect="non-scaling-stroke"
                    pointer-events="none"
                  />
                {/if}
              {/if}
            {/if}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <polyline
              points={transitionPoints(livePoints)}
              fill="none"
              stroke="transparent"
              stroke-width="16"
              vector-effect="non-scaling-stroke"
              class="cursor-pointer"
              pointer-events="stroke"
              on:click|stopPropagation={() => selectTransition(transition.index)}
            />

            {#if transition.label}
              {@const interactiveLabel = displayedLabelsByTransitionIndex[transition.index]}
              {@const interactiveLabelHitBox = labelBox(interactiveLabel, 6)}
              <rect
                x={interactiveLabelHitBox.left}
                y={interactiveLabelHitBox.top}
                width={interactiveLabelHitBox.width}
                height={interactiveLabelHitBox.height}
                fill="transparent"
                stroke="none"
                transform={svgRotationTransform(interactiveLabel.rotation, interactiveLabel.svgX, interactiveLabel.svgY)}
                pointer-events="all"
                class={selectedLabelTransitionIndex === transition.index ? "cursor-move" : "cursor-pointer"}
                on:click|stopPropagation={() => selectLabel(transition.index)}
                on:pointerdown|stopPropagation={(event) => {
                  if (selectedLabelTransitionIndex === transition.index) {
                    beginLabelDrag(event, transition);
                  }
                }}
              />
            {/if}
          {/each}

          {#if selectedTransition}
            {@const selectedUpperAnchor = displayedAnchor(selectedTransition.index, "upper", selectedTransition.upper.anchor, dragState)}
            {@const selectedLowerAnchor = displayedAnchor(selectedTransition.index, "lower", selectedTransition.lower.anchor, dragState)}
            <line
              x1={selectedTransition.upper.state_line.x1}
              y1={selectedTransition.upper.state_line.y}
              x2={selectedTransition.upper.state_line.x2}
              y2={selectedTransition.upper.state_line.y}
              stroke="#60a5fa"
              stroke-opacity="0.65"
              stroke-width="4"
              vector-effect="non-scaling-stroke"
              pointer-events="none"
            />
            <line
              x1={selectedTransition.lower.state_line.x1}
              y1={selectedTransition.lower.state_line.y}
              x2={selectedTransition.lower.state_line.x2}
              y2={selectedTransition.lower.state_line.y}
              stroke="#60a5fa"
              stroke-opacity="0.65"
              stroke-width="4"
              vector-effect="non-scaling-stroke"
              pointer-events="none"
            />

            {@const upperHandle = displayedHandle(selectedTransition.upper, selectedUpperAnchor)}
            {@const lowerHandle = displayedHandle(selectedTransition.lower, selectedLowerAnchor)}
            {#if dragState?.transitionIndex === selectedTransition.index}
              <line
                x1={upperHandle.x}
                y1={upperHandle.y}
                x2={lowerHandle.x}
                y2={lowerHandle.y}
                stroke="#1d4ed8"
                stroke-opacity="0.85"
                stroke-width="2"
                stroke-dasharray="6 4"
                vector-effect="non-scaling-stroke"
                pointer-events="none"
              />
            {/if}

            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle
              cx={upperHandle.x}
              cy={upperHandle.y}
              r="6"
              fill="#ffffff"
              stroke="#2563eb"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
              class="cursor-ew-resize"
              pointer-events="all"
              style="touch-action:none"
              on:pointerdown|stopPropagation={(event) => beginEndpointDrag(event, selectedTransition, "upper")}
            />
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle
              cx={lowerHandle.x}
              cy={lowerHandle.y}
              r="6"
              fill="#ffffff"
              stroke="#2563eb"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
              class="cursor-ew-resize"
              pointer-events="all"
              style="touch-action:none"
              on:pointerdown|stopPropagation={(event) => beginEndpointDrag(event, selectedTransition, "lower")}
            />
          {/if}

          {#if selectedLabelTransition?.label}
            {@const displayedLabel = displayedLabelsByTransitionIndex[selectedLabelTransition.index]}
            {@const visibleLabelBox = labelBox(displayedLabel, 3)}
            {@const previewingLabel = labelPreviewActive(labelDragState?.transitionIndex === selectedLabelTransition.index || labelRotateState?.transitionIndex === selectedLabelTransition.index, selectedLabelTransition.label, displayedLabel)}
            {@const movedLabel = labelPositionChanged(selectedLabelTransition.label, displayedLabel)}
            {@const labelLines = displayedLabel.text.split("\n")}
            {@const labelStartY = labelLineStartY(displayedLabel)}
            {@const rotateHandle = rotationHandleGeometry(displayedLabel)}
            {#if movedLabel}
              <line
                x1={selectedLabelTransition.label.x}
                y1={selectedLabelTransition.label.y}
                x2={displayedLabel.svgX}
                y2={displayedLabel.svgY}
                stroke="#1d4ed8"
                stroke-opacity="0.6"
                stroke-width="1.5"
                stroke-dasharray="4 3"
                vector-effect="non-scaling-stroke"
                pointer-events="none"
              />
            {/if}
            {#if previewingLabel}
              <text
                x={displayedLabel.svgX}
                y={displayedLabel.svgY}
                text-anchor={labelTextAnchor(displayedLabel.ha)}
                dominant-baseline={labelDominantBaseline(displayedLabel.va)}
                font-size={displayedLabel.fontSize}
                font-family={rendered.interaction.font_family}
                font-style={displayedLabel.fontstyle ?? "normal"}
                fill="#1d4ed8"
                fill-opacity="0.95"
                transform={svgRotationTransform(displayedLabel.rotation, displayedLabel.svgX, displayedLabel.svgY)}
                pointer-events="none"
              >
                {#each labelLines as line, index}
                  <tspan x={displayedLabel.svgX} y={labelStartY + index * displayedLabel.fontSize * 1.1}>{line}</tspan>
                {/each}
              </text>
            {/if}
            <rect
              x={visibleLabelBox.left}
              y={visibleLabelBox.top}
              width={visibleLabelBox.width}
              height={visibleLabelBox.height}
              fill="#dbeafe"
              fill-opacity="0.18"
              stroke="#2563eb"
              stroke-width="1.5"
              stroke-dasharray="5 3"
              vector-effect="non-scaling-stroke"
              transform={svgRotationTransform(displayedLabel.rotation, displayedLabel.svgX, displayedLabel.svgY)}
              pointer-events="all"
              class="cursor-move"
              style="touch-action:none"
              on:pointerdown|stopPropagation={(event) => beginLabelDrag(event, selectedLabelTransition)}
            />
            <line
              x1={displayedLabel.svgX}
              y1={displayedLabel.svgY}
              x2={rotateHandle.stemX}
              y2={rotateHandle.stemY}
              stroke="#2563eb"
              stroke-width="1.5"
              stroke-dasharray="4 3"
              vector-effect="non-scaling-stroke"
              pointer-events="none"
            />
            <circle
              cx={rotateHandle.handleX}
              cy={rotateHandle.handleY}
              r="5.5"
              fill="#eff6ff"
              stroke="#2563eb"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
              class="cursor-alias"
              pointer-events="all"
              style="touch-action:none"
              on:pointerdown|stopPropagation={(event) => beginLabelRotate(event, selectedLabelTransition)}
            />
            <circle
              cx={displayedLabel.svgX}
              cy={displayedLabel.svgY}
              r="5"
              fill="#ffffff"
              stroke="#2563eb"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
              class="cursor-move"
              pointer-events="all"
              style="touch-action:none"
              on:pointerdown|stopPropagation={(event) => beginLabelDrag(event, selectedLabelTransition)}
            />
          {/if}
        </svg>
      </div>
    </div>

    {#if selectedTransition}
      <div
        bind:this={transitionInspectorPanel}
        class="absolute z-10 w-56 rounded border border-gray-200 bg-white/96 p-3 shadow-lg backdrop-blur"
        style:left={`${transitionPanelPosition.x}px`}
        style:top={`${transitionPanelPosition.y}px`}
        on:click|stopPropagation
        on:pointerdown|stopPropagation
      >
        <button
          type="button"
          class="flex w-full cursor-move items-center justify-between rounded border border-dashed border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:border-gray-300 hover:bg-gray-100"
          on:pointerdown={(event) => beginInspectorDrag("transition", event)}
        >
          <span>Transition {selectedTransition.index + 1}</span>
          <span>Move</span>
        </button>
        <div class="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Selected Transition
        </div>
        <div class="mt-1 text-xs text-gray-700">
          {selectedTransition.upper_state_id} → {selectedTransition.lower_state_id}
        </div>

        <label class="mt-3 block text-xs font-medium text-gray-700" for="transition-color-text">
          Color
        </label>
        <div class="mt-1 flex items-center gap-2">
          <input
            id="transition-color-picker"
            class="h-9 w-10 cursor-pointer rounded border border-gray-300 bg-white p-1"
            type="color"
            value={styleDraftColor}
            on:input={(event) => applyTransitionColor((event.currentTarget as HTMLInputElement).value)}
            on:change={commitTransitionColor}
          />
          <input
            id="transition-color-text"
            class="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 font-mono text-xs text-gray-700"
            type="text"
            value={styleDraftColor}
            on:input={(event) => applyTransitionColor((event.currentTarget as HTMLInputElement).value.trim() || selectedTransition.color)}
            on:change={commitTransitionColor}
          />
        </div>

        <label class="mt-3 block text-xs font-medium text-gray-700" for="transition-linewidth-number">
          Line Width
        </label>
        <div class="mt-1 flex items-center gap-2">
          <input
            id="transition-linewidth-range"
            class="flex-1"
            type="range"
            min="0.25"
            max="8"
            step="0.05"
            value={styleDraftLinewidth}
            on:input={(event) => applyTransitionLinewidth(Number((event.currentTarget as HTMLInputElement).value))}
            on:change={commitTransitionLinewidth}
          />
          <input
            id="transition-linewidth-number"
            class="w-16 rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700"
            type="number"
            min="0.25"
            max="8"
            step="0.05"
            value={styleDraftLinewidth}
            on:input={(event) => applyTransitionLinewidth(Number((event.currentTarget as HTMLInputElement).value))}
            on:change={commitTransitionLinewidth}
          />
        </div>

        <label class="mt-3 block text-xs font-medium text-gray-700" for="transition-arrowsize-number">
          Arrowhead Size
        </label>
        <div class="mt-1 flex items-center gap-2">
          <input
            id="transition-arrowsize-range"
            class="flex-1"
            type="range"
            min="1"
            max="36"
            step="0.25"
            value={styleDraftArrowsize}
            on:input={(event) => applyTransitionArrowsize(Number((event.currentTarget as HTMLInputElement).value))}
            on:change={commitTransitionArrowsize}
          />
          <input
            id="transition-arrowsize-number"
            class="w-16 rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700"
            type="number"
            min="1"
            max="36"
            step="0.25"
            value={styleDraftArrowsize}
            on:input={(event) => applyTransitionArrowsize(Number((event.currentTarget as HTMLInputElement).value))}
            on:change={commitTransitionArrowsize}
          />
        </div>
      </div>
    {/if}

    {#if selectedLabelTransition?.label}
      <div
        bind:this={labelInspectorPanel}
        class="absolute z-10 w-60 rounded border border-gray-200 bg-white/96 p-3 shadow-lg backdrop-blur"
        style:left={`${labelPanelPosition.x}px`}
        style:top={`${labelPanelPosition.y}px`}
        on:click|stopPropagation
        on:pointerdown|stopPropagation
      >
        <button
          type="button"
          class="flex w-full cursor-move items-center justify-between rounded border border-dashed border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:border-gray-300 hover:bg-gray-100"
          on:pointerdown={(event) => beginInspectorDrag("label", event)}
        >
          <span>Label {selectedLabelTransition.index + 1}</span>
          <span>Move</span>
        </button>
        <div class="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Selected Label
        </div>
        <div class="mt-1 text-xs text-gray-700">
          {selectedLabelTransition.upper_state_id} → {selectedLabelTransition.lower_state_id}
        </div>
        <div class="mt-1 text-[11px] text-gray-500">
          Drag the label in the preview to reposition it.
        </div>

        <label class="mt-3 block text-xs font-medium text-gray-700" for="transition-label-rotation-number">
          Rotation
        </label>
        <div class="mt-1 flex items-center gap-2">
          <input
            id="transition-label-rotation-range"
            class="flex-1"
            type="range"
            min="-180"
            max="180"
            step="1"
            value={labelDraftRotation}
            on:input={(event) => applyLabelRotation(Number((event.currentTarget as HTMLInputElement).value))}
            on:change={commitLabelRotation}
          />
          <input
            id="transition-label-rotation-number"
            class="w-16 rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700"
            type="number"
            min="-180"
            max="180"
            step="0.1"
            value={labelDraftRotation}
            on:input={(event) => applyLabelRotation(Number((event.currentTarget as HTMLInputElement).value))}
            on:change={commitLabelRotation}
          />
        </div>

        <label class="mt-3 block text-xs font-medium text-gray-700" for="transition-label-font-size-number">
          Font Size
        </label>
        <div class="mt-1 flex items-center gap-2">
          <input
            id="transition-label-font-size-range"
            class="flex-1"
            type="range"
            min="6"
            max="48"
            step="0.25"
            value={labelDraftFontSize}
            on:input={(event) => applyLabelFontSize(Number((event.currentTarget as HTMLInputElement).value))}
            on:change={commitLabelFontSize}
          />
          <input
            id="transition-label-font-size-number"
            class="w-16 rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700"
            type="number"
            min="1"
            max="96"
            step="0.25"
            value={labelDraftFontSize}
            on:input={(event) => applyLabelFontSize(Number((event.currentTarget as HTMLInputElement).value))}
            on:change={commitLabelFontSize}
          />
        </div>
      </div>
    {/if}
  </div>
{:else if isRendering}
  <div class="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-[#003057]">
    Rendering preview…
  </div>
{/if}
