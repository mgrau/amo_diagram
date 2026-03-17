import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

export function downloadSvg(filename: string, svg: string): void {
  downloadBlob(filename, new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

export async function downloadPng(filename: string, svg: string): Promise<void> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
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
    downloadBlob(filename, pngBlob);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPdf(filename: string, svgElement: SVGSVGElement): Promise<void> {
  const width = Number(svgElement.getAttribute("width")) || svgElement.viewBox.baseVal.width || 800;
  const height = Number(svgElement.getAttribute("height")) || svgElement.viewBox.baseVal.height || 600;
  const orientation = width >= height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "pt",
    format: [width, height]
  });
  await svg2pdf(svgElement, pdf, { x: 0, y: 0, width, height });
  pdf.save(filename);
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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load SVG image."));
    image.src = url;
  });
}
