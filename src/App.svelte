<script lang="ts">
  import { onMount } from "svelte";
  import YAML from "yaml";
  import CodeEditor from "./lib/components/CodeEditor.svelte";
  import HelpModal from "./lib/components/HelpModal.svelte";
  import InteractivePreview from "./lib/components/InteractivePreview.svelte";
  import { deriveDiagramListMetadata, emptyDiagramTemplate } from "./lib/diagramDocument";
  import type { RenderedDiagram } from "./lib/diagram/render";
  import { createPdfBlob, createPngBlob, createSvgBlob, downloadPdf, downloadPng, downloadSvg, embedEditorLinkInSvg, extractYamlFromSvg } from "./lib/diagram/export";
  import type { RenderWorkerResponse } from "./lib/diagram/renderWorkerTypes";
  import { buildLocalDiagram, loadLocalDiagrams, persistLocalDiagrams, persistSelectedDiagram, restoreSelectedDiagram, type MenuDiagram, type SavedDiagram } from "./lib/diagramLibrary";
  import { EXAMPLES } from "./lib/examples";
  import { buildSharedDiagramUrls, decodeSharedDiagramSource, parseSharedDiagramRequest, type SharedDiagramOutput } from "./lib/urlState";

  type ShareLinks = Record<SharedDiagramOutput, string>;

  let localDiagrams: SavedDiagram[] = [];
  let selectedDiagram: MenuDiagram = { ...EXAMPLES[0], source: "example" };
  let yamlText = selectedDiagram.yaml;
  let rendered: RenderedDiagram | null = null;
  let error = "";
  let previewHost: HTMLDivElement;
  let fileInput: HTMLInputElement;
  let menuOpen = false;
  let exportOpen = false;
  let shareOpen = false;
  let helpOpen = false;
  let isRendering = false;
  let renderWorker: Worker | null = null;
  let pendingRenderTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingLocalSyncTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingShareMessageTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingLocalSyncSource: string | null = null;
  let latestRenderRequestId = 0;
  let latestShareRequestId = 0;
  let shareLinks: ShareLinks | null = null;
  let shareLinksError = "";
  let shareLinksLoading = false;
  let shareMessage = "";
  let outputMode: SharedDiagramOutput = "editor";
  let directOutputStarted = false;
  const SHARE_TARGETS: Array<{ id: SharedDiagramOutput; label: string }> = [
    { id: "editor", label: "Editor" },
    { id: "svg", label: "SVG" },
    { id: "png", label: "PNG" },
    { id: "pdf", label: "PDF" }
  ];

  function handleSourceChange(source: string, immediateRender = false): void {
    yamlText = source;
    shareOpen = false;
    exportOpen = false;
    resetShareState();
    syncSelectedYamlSource(source);
    scheduleLocalDiagramSync(source);
    schedulePreviewRender(source, immediateRender);
  }

  function loadExample(exampleId: string): void {
    flushPendingLocalDiagramSync();
    shareOpen = false;
    const next = EXAMPLES.find((example) => example.id === exampleId);
    if (!next) return;
    setSelectedDiagram({ ...next, source: "example" });
    handleSourceChange(next.yaml, true);
  }

  function loadSavedDiagram(diagramId: string): void {
    flushPendingLocalDiagramSync();
    shareOpen = false;
    const next = localDiagrams.find((diagram) => diagram.id === diagramId);
    if (!next) return;
    setSelectedDiagram(next);
    handleSourceChange(next.yaml, true);
  }

  function createNewDiagram(): void {
    flushPendingLocalDiagramSync();
    shareOpen = false;
    const name = `Untitled ${localDiagrams.length + 1}`;
    const next = buildLocalDiagram(name, "New local diagram", emptyDiagramTemplate(name));
    localDiagrams = [next, ...localDiagrams];
    persistLocalDiagrams(browserStorage, localDiagrams);
    setSelectedDiagram(next);
    handleSourceChange(next.yaml, true);
  }

  function deleteSavedDiagram(diagramId: string): void {
    const nextDiagrams = localDiagrams.filter((diagram) => diagram.id !== diagramId);
    const wasSelected = selectedDiagram.source === "local" && selectedDiagram.id === diagramId;
    localDiagrams = nextDiagrams;
    persistLocalDiagrams(browserStorage, localDiagrams);
    if (wasSelected) {
      loadExample(EXAMPLES[0].id);
    }
  }

  async function handleFileSelection(event: Event): Promise<void> {
    flushPendingLocalDiagramSync();
    shareOpen = false;
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
      persistLocalDiagrams(browserStorage, localDiagrams);
      setSelectedDiagram(created);
      handleSourceChange(created.yaml, true);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Unable to load file.";
    } finally {
      input.value = "";
    }
  }

  function exportFilename(ext: string): string {
    const base = rendered?.name ?? selectedDiagram.name ?? selectedDiagram.id;
    return `${base}.${ext}`;
  }

  async function handleExport(format: "svg" | "png" | "pdf"): Promise<void> {
    exportOpen = false;
    shareOpen = false;
    if (!rendered) {
      return;
    }
    if (format === "svg") {
      downloadSvg(exportFilename("svg"), await svgWithEmbeddedEditorLink(rendered.svg));
      return;
    }
    if (format === "png") {
      await downloadPng(exportFilename("png"), rendered.svg);
      return;
    }
    await exportPdf();
  }

  async function exportPdf(): Promise<void> {
    const svg = previewHost?.querySelector("svg.diagram-svg");
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

  function resetShareState(): void {
    shareLinks = null;
    shareLinksError = "";
    shareMessage = "";
    if (pendingShareMessageTimer !== undefined) {
      clearTimeout(pendingShareMessageTimer);
      pendingShareMessageTimer = undefined;
    }
  }

  async function toggleShareMenu(): Promise<void> {
    exportOpen = false;
    if (shareOpen) {
      shareOpen = false;
      return;
    }
    shareOpen = true;
    await generateShareLinks();
  }

  async function generateShareLinks(): Promise<void> {
    shareLinksLoading = true;
    shareLinksError = "";
    const requestId = ++latestShareRequestId;
    try {
      shareLinks = await buildSharedDiagramUrls(new URL(window.location.href), yamlText);
      if (requestId !== latestShareRequestId) {
        return;
      }
    } catch (caught) {
      if (requestId !== latestShareRequestId) {
        return;
      }
      shareLinks = null;
      shareLinksError = caught instanceof Error ? caught.message : "Unable to generate share links.";
    } finally {
      if (requestId === latestShareRequestId) {
        shareLinksLoading = false;
      }
    }
  }

  async function copyShareLink(target: SharedDiagramOutput): Promise<void> {
    if (!shareLinks) {
      return;
    }
    try {
      await writeClipboardText(shareLinks[target]);
      shareMessage = `${target.toUpperCase()} link copied.`;
    } catch (caught) {
      shareMessage = caught instanceof Error ? caught.message : "Unable to copy link.";
    }
    if (pendingShareMessageTimer !== undefined) {
      clearTimeout(pendingShareMessageTimer);
    }
    pendingShareMessageTimer = window.setTimeout(() => {
      shareMessage = "";
      pendingShareMessageTimer = undefined;
    }, 1800);
  }

  async function writeClipboardText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }

  function shareUrlFor(target: SharedDiagramOutput): string {
    return shareLinks?.[target] ?? "";
  }

  async function editorShareUrl(): Promise<string> {
    if (shareLinks?.editor) {
      return shareLinks.editor;
    }
    const urls = await buildSharedDiagramUrls(new URL(window.location.href), yamlText);
    shareLinks = urls;
    return urls.editor;
  }

  async function svgWithEmbeddedEditorLink(svgSource: string): Promise<string> {
    try {
      return embedEditorLinkInSvg(svgSource, await editorShareUrl());
    } catch {
      return svgSource;
    }
  }

  function shareTargetAccent(target: SharedDiagramOutput): string {
    if (target === "editor") return "border-sky-200 bg-sky-50 text-sky-700";
    if (target === "svg") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (target === "png") return "border-amber-200 bg-amber-50 text-amber-700";
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  function syncSelectedYamlSource(source: string): void {
    if (selectedDiagram.source !== "local") {
      return;
    }
    selectedDiagram = {
      ...selectedDiagram,
      source: "local",
      yaml: source
    };
  }

  function scheduleLocalDiagramSync(source: string): void {
    if (selectedDiagram.source !== "local") {
      pendingLocalSyncSource = null;
      if (pendingLocalSyncTimer !== undefined) {
        clearTimeout(pendingLocalSyncTimer);
        pendingLocalSyncTimer = undefined;
      }
      return;
    }
    pendingLocalSyncSource = source;
    if (pendingLocalSyncTimer !== undefined) {
      clearTimeout(pendingLocalSyncTimer);
    }
    pendingLocalSyncTimer = window.setTimeout(() => {
      flushPendingLocalDiagramSync();
    }, 250);
  }

  function flushPendingLocalDiagramSync(): void {
    if (pendingLocalSyncTimer !== undefined) {
      clearTimeout(pendingLocalSyncTimer);
      pendingLocalSyncTimer = undefined;
    }
    if (!pendingLocalSyncSource || selectedDiagram.source !== "local") {
      pendingLocalSyncSource = null;
      return;
    }
    const source = pendingLocalSyncSource;
    pendingLocalSyncSource = null;
    const derived = deriveDiagramListMetadata(source, selectedDiagram.name, selectedDiagram.description);
    const updated: SavedDiagram = {
      ...selectedDiagram,
      source: "local",
      name: derived.name,
      description: derived.description,
      yaml: source
    };
    selectedDiagram = updated;
    localDiagrams = localDiagrams.map((diagram) => diagram.id === updated.id ? updated : diagram);
    persistLocalDiagrams(browserStorage, localDiagrams);
  }

  function schedulePreviewRender(source: string, immediate = false): void {
    if (pendingRenderTimer !== undefined) {
      clearTimeout(pendingRenderTimer);
      pendingRenderTimer = undefined;
    }
    error = "";
    const dispatch = () => {
      const requestId = ++latestRenderRequestId;
      isRendering = true;
      if (renderWorker) {
        renderWorker.postMessage({ id: requestId, source });
        return;
      }
      void renderPreviewFallback(source, requestId);
    };
    if (immediate) {
      dispatch();
      return;
    }
    pendingRenderTimer = window.setTimeout(dispatch, 90);
  }

  async function renderPreviewFallback(source: string, requestId: number): Promise<void> {
    try {
      const [{ ensureMathJax }, { renderDiagram }] = await Promise.all([
        import("./lib/diagram/mathjax"),
        import("./lib/diagram/render")
      ]);
      await ensureMathJax();
      const next = renderDiagram(source);
      if (requestId !== latestRenderRequestId) {
        return;
      }
      rendered = next;
      error = "";
    } catch (caught) {
      if (requestId !== latestRenderRequestId) {
        return;
      }
      error = caught instanceof Error ? caught.message : "Unknown rendering error.";
    } finally {
      if (requestId === latestRenderRequestId) {
        isRendering = false;
      }
    }
  }

  function handleWorkerMessage(message: RenderWorkerResponse): void {
    if (message.id !== latestRenderRequestId) {
      return;
    }
    isRendering = false;
    if (message.type === "success") {
      rendered = message.rendered;
      error = "";
      return;
    }
    error = message.error;
  }

  const browserStorage = typeof localStorage === "undefined" ? undefined : localStorage;

  function setSelectedDiagram(diagram: MenuDiagram): void {
    selectedDiagram = diagram;
    persistSelectedDiagram(browserStorage, diagram);
  }

  onMount(() => {
    let disposed = false;

    try {
      renderWorker = new Worker(new URL("./lib/diagram/renderWorker.ts", import.meta.url), { type: "module" });
      renderWorker.onmessage = (event: MessageEvent<RenderWorkerResponse>) => handleWorkerMessage(event.data);
    } catch {
      renderWorker = null;
    }

    void (async () => {
      try {
        restoreLocalState();
        await restoreSharedDiagramFromUrl();
        if (disposed) {
          return;
        }
        if (!error) {
          schedulePreviewRender(yamlText, true);
        }
      } catch (caught) {
        if (disposed) {
          return;
        }
        error = caught instanceof Error ? caught.message : "Unable to load diagram from URL.";
      }
    })();

    return () => {
      disposed = true;
      flushPendingLocalDiagramSync();
      if (pendingRenderTimer !== undefined) {
        clearTimeout(pendingRenderTimer);
      }
      if (pendingShareMessageTimer !== undefined) {
        clearTimeout(pendingShareMessageTimer);
      }
      renderWorker?.terminate();
    };
  });

  function restoreLocalState(): void {
    localDiagrams = loadLocalDiagrams(browserStorage);
    const restored = restoreSelectedDiagram(browserStorage, localDiagrams, EXAMPLES);
    if (restored) {
      selectedDiagram = restored;
      yamlText = restored.yaml;
    }
  }

  async function restoreSharedDiagramFromUrl(): Promise<boolean> {
    const { encodedSource, output } = parseSharedDiagramRequest(new URL(window.location.href));
    outputMode = output;
    if (!encodedSource) {
      if (output !== "editor") {
        error = "Missing shared diagram source in the URL.";
        return true;
      }
      return false;
    }
    const source = await decodeSharedDiagramSource(encodedSource);
    if (output === "editor") {
      const imported = buildLocalDiagram("Shared Diagram", "Imported from a shared link", source);
      localDiagrams = [imported, ...localDiagrams];
      persistLocalDiagrams(browserStorage, localDiagrams);
      setSelectedDiagram(imported);
      yamlText = imported.yaml;
      clearSharedDiagramUrl();
      return true;
    }
    yamlText = source;
    return true;
  }

  function clearSharedDiagramUrl(): void {
    const current = new URL(window.location.href);
    if (!current.searchParams.has("diagram") && !current.searchParams.has("output")) {
      return;
    }
    current.searchParams.delete("diagram");
    current.searchParams.delete("output");
    window.history.replaceState({}, "", `${current.pathname}${current.search}${current.hash}`);
  }

  async function openDirectOutput(svgSource: string): Promise<void> {
    let blob: Blob;
    if (outputMode === "svg") {
      blob = createSvgBlob(await svgWithEmbeddedEditorLink(svgSource));
    } else if (outputMode === "png") {
      blob = await createPngBlob(svgSource);
    } else if (outputMode === "pdf") {
      blob = await createPdfBlob(svgSource);
    } else {
      return;
    }
    window.location.replace(URL.createObjectURL(blob));
  }

  $: if (rendered && outputMode !== "editor" && !directOutputStarted && !error) {
    directOutputStarted = true;
    void openDirectOutput(rendered.svg).catch((caught) => {
      error = caught instanceof Error ? caught.message : "Unable to generate requested output.";
      directOutputStarted = false;
    });
  }

</script>

{#if outputMode !== "editor"}
  <div class="flex h-screen items-center justify-center bg-gray-50 p-6">
    <div class="panel w-full max-w-xl rounded-lg p-6 text-center">
      <div class="text-xs font-semibold uppercase tracking-wide text-[#0067B1]">
        Direct {outputMode.toUpperCase()} Link
      </div>
      {#if error}
        <div class="mt-4 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      {:else}
        <div class="mt-4 text-sm text-gray-700">
          {#if isRendering || !directOutputStarted}
            Rendering shared diagram…
          {:else}
            Opening generated {outputMode.toUpperCase()}…
          {/if}
        </div>
      {/if}
    </div>
  </div>
{:else}
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
      <div class="text-lg font-bold tracking-wide">AMO Diagram Studio</div>
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
        <h1 class="text-xl font-bold text-gray-800">AMO Diagram Studio</h1>
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
              {#if example.description}
                <div class="mt-1 text-xs text-gray-500">{example.description}</div>
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
          <CodeEditor value={yamlText} onChange={(value) => handleSourceChange(value)} />
        </div>
      </section>

      <section class="panel flex h-full min-h-0 flex-col rounded-lg overflow-hidden">
        <div class="border-b border-gray-200 px-5 py-4">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="text-sm font-semibold text-gray-800">SVG Preview</div>
              {#if isRendering}
                <div class="text-xs font-medium uppercase tracking-wide text-[#0067B1]">Rendering…</div>
              {/if}
            </div>
            <div class="flex items-center gap-2">
              <div class="relative">
                <button
                  class="inline-flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                  on:click={() => void toggleShareMenu()}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l1.92-1.92a5 5 0 0 0-7.07-7.07L11.3 5.63" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54L4.54 12.4a5 5 0 0 0 7.07 7.07l1.09-1.09" />
                  </svg>
                  Share
                </button>
                {#if shareOpen}
                  <div class="absolute right-0 top-12 z-10 w-[28rem] rounded border border-gray-200 bg-white p-3 shadow-lg">
                    <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Share Links</div>
                    <div class="mt-1 text-xs text-gray-600">
                      Generated from the current editor contents.
                    </div>
                    {#if shareLinksLoading}
                      <div class="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-[#003057]">
                        Generating links…
                      </div>
                    {:else if shareLinksError}
                      <div class="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-600">
                        {shareLinksError}
                      </div>
                    {:else if shareLinks}
                      <div class="mt-3 space-y-3">
                        {#each SHARE_TARGETS as target}
                          <div class="rounded border border-gray-200 p-3">
                            <div class="flex items-center gap-2">
                              <div class={`inline-flex h-7 w-7 items-center justify-center rounded border ${shareTargetAccent(target.id)}`}>
                                {#if target.id === "editor"}
                                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
                                  </svg>
                                {:else if target.id === "svg"}
                                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <path d="M14 2v6h6" />
                                    <path d="M8 13h8" />
                                    <path d="M8 17h5" />
                                  </svg>
                                {:else if target.id === "png"}
                                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <path d="m21 15-5-5L5 21" />
                                  </svg>
                                {:else}
                                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 17v-6" />
                                    <path d="M9 14h6" />
                                    <path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
                                    <path d="M14 2v6h6" />
                                  </svg>
                                {/if}
                              </div>
                              <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{target.label}</div>
                            </div>
                            <div
                              class="mt-2 truncate rounded bg-gray-50 px-2 py-2 font-mono text-[11px] text-gray-600"
                              title={shareUrlFor(target.id)}
                            >
                              {shareUrlFor(target.id)}
                            </div>
                            <div class="mt-2 flex items-center gap-2">
                              <a
                                class="rounded border border-[#0067B1] px-2.5 py-1.5 text-xs font-medium text-[#0067B1] hover:bg-blue-50"
                                href={shareUrlFor(target.id)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open
                              </a>
                              <button
                                class="rounded border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                on:click={() => void copyShareLink(target.id)}
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                        {/each}
                      </div>
                    {/if}
                    {#if shareMessage}
                      <div class="mt-3 text-xs font-medium text-[#0067B1]">{shareMessage}</div>
                    {/if}
                  </div>
                {/if}
              </div>

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
                    on:click={() => {
                      shareOpen = false;
                      exportOpen = !exportOpen;
                    }}
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
        </div>
        <div class="min-h-0 flex-1 overflow-auto bg-gray-50 p-4" bind:this={previewHost}>
          <InteractivePreview
            {rendered}
            {error}
            {isRendering}
            {yamlText}
            onChange={(value, immediate = false) => handleSourceChange(value, immediate)}
          />
        </div>
      </section>
    </div>
  </div>
</div>
{/if}
