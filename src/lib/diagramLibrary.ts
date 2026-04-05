import type { ExampleDiagram } from "./examples";
import { deriveDiagramListMetadata } from "./diagramDocument";

export interface SavedDiagram extends ExampleDiagram {
  source: "local";
}

export type ExampleMenuDiagram = ExampleDiagram & { source: "example" };
export type MenuDiagram = ExampleMenuDiagram | SavedDiagram;

const LOCAL_STORAGE_KEY = "state-diagram-studio.local-diagrams";
const SELECTED_DIAGRAM_KEY = "state-diagram-studio.selected-diagram";

export function buildLocalDiagram(name: string, description: string, yaml: string): SavedDiagram {
  const derived = deriveDiagramListMetadata(yaml, name, description);
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: derived.name,
    description: derived.description,
    yaml,
    source: "local"
  };
}

export function loadLocalDiagrams(storage: Storage | undefined): SavedDiagram[] {
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is SavedDiagram =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.description === "string" &&
      typeof item.yaml === "string"
    ).map((item) => ({ ...item, source: "local" }));
  } catch {
    return [];
  }
}

export function persistLocalDiagrams(storage: Storage | undefined, diagrams: SavedDiagram[]): void {
  if (!storage) {
    return;
  }
  storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(diagrams));
}

export function restoreSelectedDiagram(
  storage: Storage | undefined,
  localDiagrams: SavedDiagram[],
  examples: ExampleDiagram[]
): MenuDiagram | undefined {
  if (!storage) {
    return undefined;
  }
  try {
    const raw = storage.getItem(SELECTED_DIAGRAM_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as { id?: string; source?: "example" | "local" };
    if (parsed.source === "local" && typeof parsed.id === "string") {
      return localDiagrams.find((diagram) => diagram.id === parsed.id);
    }
    if (parsed.source === "example" && typeof parsed.id === "string") {
      const example = examples.find((diagram) => diagram.id === parsed.id);
      return example ? { ...example, source: "example" } : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function persistSelectedDiagram(storage: Storage | undefined, diagram: MenuDiagram): void {
  if (!storage) {
    return;
  }
  storage.setItem(SELECTED_DIAGRAM_KEY, JSON.stringify({
    id: diagram.id,
    source: diagram.source
  }));
}
