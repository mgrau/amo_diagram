import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

export function downloadSvg(filename: string, svg: string): void {
  downloadBlob(filename, createSvgBlob(svg));
}

export async function downloadPng(filename: string, svg: string): Promise<void> {
  downloadBlob(filename, await createPngBlob(svg));
}

export async function downloadPdf(filename: string, svgElement: SVGSVGElement): Promise<void> {
  downloadBlob(filename, await createPdfBlobFromSvgElement(svgElement));
}

export function createSvgBlob(svg: string): Blob {
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

export async function createPngBlob(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(createSvgBlob(svg));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context is unavailable.");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob) {
      throw new Error("Failed to create PNG.");
    }
    return pngBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createPdfBlob(svgSource: string): Promise<Blob> {
  const parser = new DOMParser();
  const document = parser.parseFromString(svgSource, "image/svg+xml");
  const svgElement = document.querySelector("svg");
  if (!(svgElement instanceof SVGElement)) {
    throw new Error("Unable to parse SVG for PDF export.");
  }
  return createPdfBlobFromSvgElement(svgElement as unknown as SVGSVGElement);
}

export function embedEditorLinkInSvg(svgSource: string, editorUrl: string): string {
  if (!editorUrl) {
    return svgSource;
  }
  const parser = new DOMParser();
  const document = parser.parseFromString(svgSource, "image/svg+xml");
  const svgElement = document.querySelector("svg");
  if (!(svgElement instanceof SVGElement)) {
    return svgSource;
  }

  const svg = svgElement as unknown as SVGSVGElement;
  const { width, height } = svgDimensions(svg);
  const viewBox = svg.getAttribute("viewBox")?.trim().split(/\s+/).map(Number) ?? [0, 0, width, height];
  const linkBounds = viewBox.length === 4 && viewBox.every((value) => Number.isFinite(value))
    ? viewBox
    : [0, 0, width, height];

  const metadata = document.querySelector("metadata") ?? document.createElementNS("http://www.w3.org/2000/svg", "metadata");
  if (!metadata.parentNode) {
    svg.insertBefore(metadata, svg.firstChild);
  }
  const editorLinkNode = document.createElementNS("http://www.w3.org/2000/svg", "state-diagram-editor-link");
  editorLinkNode.textContent = editorUrl;
  metadata.appendChild(editorLinkNode);

  const anchor = document.createElementNS("http://www.w3.org/2000/svg", "a");
  anchor.setAttribute("href", editorUrl);
  anchor.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", editorUrl);
  anchor.setAttribute("target", "_blank");
  anchor.setAttribute("rel", "noopener noreferrer");

  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  overlay.setAttribute("x", `${linkBounds[0]}`);
  overlay.setAttribute("y", `${linkBounds[1]}`);
  overlay.setAttribute("width", `${linkBounds[2]}`);
  overlay.setAttribute("height", `${linkBounds[3]}`);
  overlay.setAttribute("fill", "#ffffff");
  overlay.setAttribute("fill-opacity", "0.001");
  overlay.setAttribute("pointer-events", "all");

  anchor.appendChild(overlay);
  svg.appendChild(anchor);

  return new XMLSerializer().serializeToString(document);
}

async function createPdfBlobFromSvgElement(svgElement: SVGSVGElement): Promise<Blob> {
  const { width, height } = svgDimensions(svgElement);
  const orientation = width >= height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "pt",
    format: [width, height]
  });
  await svg2pdf(svgElement, pdf, { x: 0, y: 0, width, height });
  return pdf.output("blob");
}

export function extractYamlFromSvg(svgSource: string): string | null {
  const parser = new DOMParser();
  const document = parser.parseFromString(svgSource, "image/svg+xml");
  const embedded = document.querySelector("metadata > state-diagram-source");
  const yaml = embedded?.textContent ?? "";
  if (!yaml) {
    return null;
  }
  return yaml.startsWith("\n") && yaml.endsWith("\n")
    ? yaml.slice(1, -1)
    : yaml;
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function svgDimensions(svgElement: SVGSVGElement): { width: number; height: number } {
  const widthAttr = Number(svgElement.getAttribute("width"));
  const heightAttr = Number(svgElement.getAttribute("height"));
  if (Number.isFinite(widthAttr) && Number.isFinite(heightAttr) && widthAttr > 0 && heightAttr > 0) {
    return { width: widthAttr, height: heightAttr };
  }
  const viewBox = svgElement.getAttribute("viewBox")?.trim().split(/\s+/).map(Number) ?? [];
  if (viewBox.length === 4 && viewBox.every((value) => Number.isFinite(value))) {
    return { width: viewBox[2], height: viewBox[3] };
  }
  return { width: 800, height: 600 };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load SVG image."));
    image.src = url;
  });
}
