import YAML from "yaml";

type ParsedMetadata = {
  name?: unknown;
  element?: unknown;
  ion_charge?: unknown;
  title?: unknown;
  footer?: unknown;
};

export type DiagramDocumentMetadata = {
  name?: string;
  element?: string;
  ion_charge?: number;
  title?: string;
  footer?: string;
};

export function parseDiagramDocumentMetadata(yamlSource: string): DiagramDocumentMetadata | undefined {
  try {
    const parsed = YAML.parse(yamlSource) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !("metadata" in parsed)) {
      return undefined;
    }
    const metadata = (parsed as { metadata?: ParsedMetadata }).metadata;
    if (!metadata || typeof metadata !== "object") {
      return undefined;
    }
    return {
      name: typeof metadata.name === "string" ? metadata.name.trim() : undefined,
      element: typeof metadata.element === "string" ? metadata.element.trim() : undefined,
      ion_charge: typeof metadata.ion_charge === "number" ? metadata.ion_charge : undefined,
      title: typeof metadata.title === "string" ? metadata.title.trim() : undefined,
      footer: typeof metadata.footer === "string" ? metadata.footer.trim() : undefined
    };
  } catch {
    return undefined;
  }
}

export function deriveDiagramListMetadata(
  yamlSource: string,
  fallbackName: string,
  fallbackDescription: string
): { name: string; description: string } {
  const metadata = parseDiagramDocumentMetadata(yamlSource);
  const formattedElement = metadata?.element
    ? formatElementWithCharge(metadata.element, metadata.ion_charge ?? 0)
    : undefined;
  const name = metadata?.name || formattedElement || fallbackName;
  const description = metadata?.title || fallbackDescription;
  return { name, description };
}

export function emptyDiagramTemplate(name: string): string {
  return `metadata:
  name: ${name}
  title: Untitled Diagram

states: {}

transitions: []
`;
}

export function formatElementWithCharge(element: string, ionCharge = 0): string {
  const trimmed = element.trim();
  if (!trimmed || ionCharge === 0) {
    return trimmed;
  }
  if (ionCharge > 0) {
    return ionCharge === 1 ? `${trimmed}+` : `${trimmed}${ionCharge}+`;
  }
  const magnitude = Math.abs(ionCharge);
  return magnitude === 1 ? `${trimmed}-` : `${trimmed}${magnitude}-`;
}
