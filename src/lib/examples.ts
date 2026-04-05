import { deriveDiagramListMetadata } from "./diagramDocument";

export interface ExampleDiagram {
  id: string;
  name: string;
  description: string;
  yaml: string;
}

const rawFiles = import.meta.glob("./examples/*.yaml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function idFromPath(path: string): string {
  return path.replace(/^.*\//, "").replace(/\.yaml$/, "").replace(/_/g, "-");
}

function nameFromPath(path: string): string {
  const base = path.replace(/^.*\//, "").replace(/\.yaml$/, "");
  const parts = base.split("_");
  if (parts.at(-1) === "plus") {
    return parts.slice(0, -1).map((p) => p[0].toUpperCase() + p.slice(1)).join(" ") + "+";
  }
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
}

export const EXAMPLES: ExampleDiagram[] = Object.entries(rawFiles)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, content]) => ({
    id: idFromPath(path),
    name: nameFromPath(path),
    description: deriveDiagramListMetadata(content, "", "").description,
    yaml: content
  }));
