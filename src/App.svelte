<script lang="ts">
  import { onMount } from "svelte";
  import YAML from "yaml";
  import CodeEditor from "./lib/components/CodeEditor.svelte";
  import HelpModal from "./lib/components/HelpModal.svelte";
  import { renderDiagram, type RenderedDiagram } from "./lib/diagram/render";
  import { ensureMathJax } from "./lib/diagram/mathjax";
  import { downloadPdf, downloadPng, downloadSvg, extractYamlFromSvg } from "./lib/diagram/export";
  import { EXAMPLES, type ExampleDiagram } from "./lib/examples";

  type SavedDiagram = ExampleDiagram & { source: "local" };
  type MenuDiagram = ExampleDiagram & { source: "example" | "local" };

  const LOCAL_STORAGE_KEY = "state-diagram-studio.local-diagrams";
  const SELECTED_DIAGRAM_KEY = "state-diagram-studio.selected-diagram";
  let localDiagrams: SavedDiagram[] = [];
  let selectedDiagram: MenuDiagram = { ...EXAMPLES[0], source: "example" };
  let yamlText = selectedDiagram.yaml;
  let rendered: RenderedDiagram | null = null;
  let error = "";
  let previewHost: HTMLDivElement;
  let fileInput: HTMLInputElement;
  let menuOpen = false;
  let exportOpen = false;
  let helpOpen = false;

  function rerender(source: string): void {
    yamlText = source;
    syncSelectedYaml(source);
    try {
      rendered = renderDiagram(source);
      error = "";
    } catch (caught) {
      rendered = null;
      error = caught instanceof Error ? caught.message : "Unknown rendering error.";
    }
  }

  function loadExample(exampleId: string): void {
    const next = EXAMPLES.find((example) => example.id === exampleId);
    if (!next) return;
    setSelectedDiagram({ ...next, source: "example" });
    rerender(next.yaml);
  }

  function loadSavedDiagram(diagramId: string): void {
    const next = localDiagrams.find((diagram) => diagram.id === diagramId);
    if (!next) return;
    setSelectedDiagram(next);
    rerender(next.yaml);
  }

  function createNewDiagram(): void {
    const name = `Untitled ${localDiagrams.length + 1}`;
    const next = buildLocalDiagram(name, "New local diagram", emptyDiagramTemplate(name));
    localDiagrams = [next, ...localDiagrams];
    persistLocalDiagrams();
    setSelectedDiagram(next);
    rerender(next.yaml);
  }

  function deleteSavedDiagram(diagramId: string): void {
    const nextDiagrams = localDiagrams.filter((diagram) => diagram.id !== diagramId);
    const wasSelected = selectedDiagram.source === "local" && selectedDiagram.id === diagramId;
    localDiagrams = nextDiagrams;
    persistLocalDiagrams();
    if (wasSelected) {
      loadExample(EXAMPLES[0].id);
    }
  }

  async function handleFileSelection(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const rawYaml = file.name.toLowerCase().endsWith(".svg")
        ? extractYamlFromSvg(content)
        : content;
      if (!rawYaml) {
        throw new Error("The selected SVG does not contain embedded YAML source.");
      }
      const nextYaml = YAML.stringify(YAML.parse(rawYaml));
      const created = buildLocalDiagram(file.name, "Imported from a local file", nextYaml);
      localDiagrams = [created, ...localDiagrams];
      persistLocalDiagrams();
      setSelectedDiagram(created);
      rerender(created.yaml);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Unable to load file.";
    } finally {
      input.value = "";
    }
  }

  function exportFilename(ext: string): string {
    const base = rendered?.spec.metadata.name ?? selectedDiagram.id;
    return `${base}.${ext}`;
  }

  async function handleExport(format: "svg" | "png" | "pdf"): Promise<void> {
    exportOpen = false;
    if (!rendered) {
      return;
    }
    if (format === "svg") {
      downloadSvg(exportFilename("svg"), rendered.svg);
      return;
    }
    if (format === "png") {
      await downloadPng(exportFilename("png"), rendered.svg);
      return;
    }
    await exportPdf();
  }

  async function exportPdf(): Promise<void> {
    const svg = previewHost?.querySelector("svg");
    if (svg instanceof SVGSVGElement) {
      await downloadPdf(exportFilename("pdf"), svg);
    }
  }

  function downloadYamlFile(filename: string, content: string): void {
    const blob = new Blob([content], { type: "application/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function buildLocalDiagram(name: string, description: string, yaml: string): SavedDiagram {
    const derived = deriveLocalDiagramMetadata(yaml, name, description);
    return {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: derived.name,
      description: derived.description,
      yaml,
      source: "local"
    };
  }

  function syncSelectedYaml(source: string): void {
    if (selectedDiagram.source !== "local") {
      return;
    }
    const derived = deriveLocalDiagramMetadata(source, selectedDiagram.name, selectedDiagram.description);
    const updated: SavedDiagram = {
      ...selectedDiagram,
      source: "local",
      name: derived.name,
      description: derived.description,
      yaml: source
    };
    setSelectedDiagram(updated);
    localDiagrams = localDiagrams.map((diagram) => diagram.id === updated.id ? updated : diagram);
    persistLocalDiagrams();
  }

  const hasLocalStorage = typeof localStorage !== "undefined";

  function persistLocalDiagrams(): void {
    if (!hasLocalStorage) return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localDiagrams));
  }

  function setSelectedDiagram(diagram: MenuDiagram): void {
    selectedDiagram = diagram;
    if (!hasLocalStorage) return;
    localStorage.setItem(SELECTED_DIAGRAM_KEY, JSON.stringify({
      id: diagram.id,
      source: diagram.source
    }));
  }

  onMount(() => {
    if (!hasLocalStorage) return;
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }
      localDiagrams = parsed.filter((item): item is SavedDiagram =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.description === "string" &&
        typeof item.yaml === "string"
      ).map((item) => ({ ...item, source: "local" }));
    } catch {
      localDiagrams = [];
    }

    try {
      const rawSelection = localStorage.getItem(SELECTED_DIAGRAM_KEY);
      if (!rawSelection) {
        return;
      }
      const parsedSelection = JSON.parse(rawSelection) as { id?: string; source?: "example" | "local" };
      if (parsedSelection.source === "local" && typeof parsedSelection.id === "string") {
        const restored = localDiagrams.find((diagram) => diagram.id === parsedSelection.id);
        if (restored) {
          setSelectedDiagram(restored);
          rerender(restored.yaml);
          return;
        }
      }
      if (parsedSelection.source === "example" && typeof parsedSelection.id === "string") {
        const restored = EXAMPLES.find((diagram) => diagram.id === parsedSelection.id);
        if (restored) {
          setSelectedDiagram({ ...restored, source: "example" });
          rerender(restored.yaml);
          return;
        }
      }
      loadExample(EXAMPLES[0].id);
    } catch {
      loadExample(EXAMPLES[0].id);
    }
    ensureMathJax().then(() => rerender(yamlText));
  });

  function parseYamlMetadata(yamlSource: string): Record<string, unknown> | undefined {
    try {
      const parsed = YAML.parse(yamlSource);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "metadata" in parsed) {
        return parsed.metadata as Record<string, unknown> | undefined;
      }
    } catch {
      // ignore parse errors
    }
    return undefined;
  }

  function deriveLocalDiagramMetadata(
    yamlSource: string,
    fallbackName: string,
    fallbackDescription: string
  ): { name: string; description: string } {
    const metadata = parseYamlMetadata(yamlSource);
    const name = typeof metadata?.name === "string" && metadata.name.trim()
      ? metadata.name.trim()
      : typeof metadata?.element === "string" && metadata.element.trim()
        ? metadata.element.trim()
        : fallbackName;
    const description = typeof metadata?.title === "string" ? metadata.title.trim() : "";
    return { name, description: description || fallbackDescription };
  }

  function exampleDiagramSubtitle(yamlSource: string): string {
    const metadata = parseYamlMetadata(yamlSource);
    return typeof metadata?.title === "string" ? metadata.title.trim() : "";
  }

  function emptyDiagramTemplate(name: string): string {
    return `metadata:
  name: ${name}
  title: Untitled Diagram

states: {}

transitions: []
`;
  }

  rerender(yamlText);
</script>

<div class="flex h-screen flex-col bg-gray-50">
  <header class="flex items-center justify-between bg-[#003057] px-4 py-3 text-white shadow">
    <div class="flex items-center gap-3">
      <button
        class="rounded border border-blue-400 px-3 py-2 text-blue-200 hover:border-blue-200 hover:text-white"
        aria-label="Open examples menu"
        on:click={() => (menuOpen = !menuOpen)}
      >
        <span class="block h-0.5 w-5 bg-current"></span>
        <span class="mt-1 block h-0.5 w-5 bg-current"></span>
        <span class="mt-1 block h-0.5 w-5 bg-current"></span>
      </button>
      <div class="text-lg font-bold tracking-wide">State Diagram Studio</div>
    </div>
  </header>

  <div class="relative min-h-0 flex-1 overflow-hidden p-4 md:p-6">
    <HelpModal open={helpOpen} onClose={() => (helpOpen = false)} />

    {#if menuOpen}
      <button
        class="absolute bottom-0 right-0 z-20 bg-slate-900/10"
        style:left="17rem"
        aria-label="Close menu"
        on:click={() => (menuOpen = false)}
      ></button>
    {/if}

    <aside class={`panel drawer-shadow absolute left-0 top-0 z-30 flex h-full w-[17rem] flex-col border-r border-gray-200 p-4 transition-transform duration-200 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div class="mb-5">
        <h1 class="text-xl font-bold text-gray-800">State Diagram</h1>
      </div>

      <input
        class="hidden"
        bind:this={fileInput}
        type="file"
        accept=".yaml,.yml,.svg"
        on:change={handleFileSelection}
      />
      <button
        class="mb-4 rounded border border-[#0067B1] bg-[#0067B1] px-3 py-2 text-sm font-medium text-white hover:bg-[#00558f]"
        on:click={() => fileInput?.click()}
      >
        Open YAML or SVG
      </button>
      <button
        class="mb-4 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50"
        on:click={createNewDiagram}
      >
        New Diagram
      </button>

      <div class="min-h-0 flex-1 overflow-y-auto pr-1">
        {#if localDiagrams.length > 0}
          <div class="mb-4">
            <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">My Diagrams</div>
            <div class="space-y-2">
              {#each localDiagrams as diagram}
                <div class="relative">
                  <button
                    class={`w-full rounded border px-3 py-3 pr-12 text-left transition-colors ${diagram.id === selectedDiagram.id ? "border-[#0067B1] bg-blue-50 text-[#003057]" : "border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50"}`}
                    on:click={() => loadSavedDiagram(diagram.id)}
                  >
                    <div class="text-sm font-semibold">{diagram.name}</div>
                    {#if diagram.description}
                      <div class="mt-1 text-xs text-gray-500">{diagram.description}</div>
                    {/if}
                  </button>
                  <div class="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                    <button
                      class="rounded border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-50"
                      aria-label={`Download ${diagram.name}`}
                      on:click|stopPropagation={() => downloadYamlFile(`${diagram.name}.yaml`, diagram.yaml)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 3v12" />
                        <path d="m7 10 5 5 5-5" />
                        <path d="M5 21h14" />
                      </svg>
                    </button>
                    <button
                      class="rounded border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50"
                      aria-label={`Delete ${diagram.name}`}
                      on:click|stopPropagation={() => deleteSavedDiagram(diagram.id)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
          <div class="mb-4 border-t border-gray-200"></div>
        {/if}

        <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Examples</div>
        <div class="space-y-2">
          {#each EXAMPLES as example}
            <button
              class={`w-full rounded border px-3 py-3 text-left transition-colors ${example.id === selectedDiagram.id ? "border-[#0067B1] bg-blue-50 text-[#003057]" : "border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50"}`}
              on:click={() => loadExample(example.id)}
            >
              <div class="text-sm font-semibold">{example.name}</div>
              {#if exampleDiagramSubtitle(example.yaml)}
                <div class="mt-1 text-xs text-gray-500">{exampleDiagramSubtitle(example.yaml)}</div>
              {/if}
            </button>
          {/each}
        </div>

      </div>
    </aside>

    <div
      class="grid h-full min-h-0 grid-cols-1 gap-4 transition-[padding-left] duration-200 md:grid-cols-2"
      style:padding-left={menuOpen ? "17rem" : "0"}
    >
      <section class="panel flex h-full min-h-0 flex-col rounded-lg overflow-hidden">
        <div class="border-b border-gray-200 px-5 py-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-gray-800">{selectedDiagram.name}</div>
              {#if selectedDiagram.description}
                <div class="mt-1 text-xs text-gray-500">{selectedDiagram.description}</div>
              {/if}
            </div>
            <button
              class="rounded border border-[#0067B1] px-3 py-2 text-sm font-medium text-[#0067B1] hover:bg-blue-50"
              on:click={() => (helpOpen = true)}
            >
              YAML Reference
            </button>
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-hidden">
          <CodeEditor value={yamlText} onChange={rerender} />
        </div>
      </section>

      <section class="panel flex h-full min-h-0 flex-col rounded-lg overflow-hidden">
        <div class="border-b border-gray-200 px-5 py-4">
          <div class="flex items-center justify-between gap-3">
            <div class="text-sm font-semibold text-gray-800">SVG Preview</div>
            <div class="relative">
              <div class="inline-flex overflow-hidden rounded border border-[#0067B1] shadow-sm">
                <button
                  class="whitespace-nowrap bg-[#0067B1] px-3 py-2 text-sm font-medium text-white hover:bg-[#00558f]"
                  on:click={() => handleExport("svg")}
                >
                  Export SVG
                </button>
                <button
                  class="border-l border-blue-300 bg-[#0067B1] px-2 py-2 text-sm font-medium text-white hover:bg-[#00558f]"
                  aria-label="Open export options"
                  on:click={() => (exportOpen = !exportOpen)}
                >
                  ▾
                </button>
              </div>
              {#if exportOpen}
                <div class="absolute right-0 top-12 z-10 min-w-40 rounded border border-gray-200 bg-white p-1 shadow-lg">
                  <button class="block w-full rounded px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50" on:click={() => handleExport("png")}>Export PNG</button>
                  <button class="block w-full rounded px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50" on:click={() => handleExport("pdf")}>Export PDF</button>
                </div>
              {/if}
            </div>
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-auto bg-gray-50 p-4" bind:this={previewHost}>
          {#if error}
            <div class="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          {:else if rendered}
            <div class="flex min-h-full items-start justify-center">
              <div class="rounded-sm border border-gray-300 bg-white">
              {@html rendered.svg}
              </div>
            </div>
          {/if}
        </div>
      </section>
    </div>
  </div>
</div>
