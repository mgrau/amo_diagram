<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
  import { yaml } from "@codemirror/lang-yaml";
  import { tags } from "@lezer/highlight";
  import { yamlCompletions } from "../editor/completions";
  import { semanticHighlight, semanticHighlightTheme } from "../editor/semanticHighlight";
  import { colorPickerExtension, type ColorSwatchClickDetail } from "../editor/colorPicker";

  export let value = "";
  export let onChange: (value: string) => void = () => {};

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let colorInput: HTMLInputElement;
  let pendingColorRange: { from: number; to: number } | null = null;

  function handleColorSwatchClick(e: Event): void {
    const detail = (e as CustomEvent<ColorSwatchClickDetail>).detail;
    pendingColorRange = { from: detail.from, to: detail.to };
    colorInput.value = detail.color;
    colorInput.style.left = `${detail.x}px`;
    colorInput.style.top = `${detail.y}px`;
    colorInput.click();
  }

  function handleColorInput(): void {
    if (!pendingColorRange || !view) return;
    const { from, to } = pendingColorRange;
    view.dispatch({
      changes: { from, to, insert: colorInput.value }
    });
  }

  function insertYamlNewlineIndent(editorView: EditorView): boolean {
    const { state } = editorView;
    const selection = state.selection.main;
    if (!selection.empty) {
      return false;
    }

    const line = state.doc.lineAt(selection.head);
    const beforeCursor = line.text.slice(0, selection.head - line.from);
    const baseIndent = beforeCursor.match(/^\s*/)?.[0] ?? "";
    const trimmedBeforeCursor = beforeCursor.trimEnd();
    const extraIndent = trimmedBeforeCursor.endsWith(":") ? "  " : "";
    const insert = `\n${baseIndent}${extraIndent}`;

    editorView.dispatch({
      changes: { from: selection.head, to: selection.head, insert },
      selection: { anchor: selection.head + insert.length }
    });
    return true;
  }

  const yamlTheme = EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "#1e1e2e",
      color: "#cdd6f4"
    },
    ".cm-scroller": {
      fontFamily: "\"SFMono-Regular\", \"SF Mono\", Menlo, monospace",
      lineHeight: "1.55"
    },
    ".cm-content": {
      padding: "0.9rem 0",
      caretColor: "#f5e0dc"
    },
    ".cm-line": {
      padding: "0 1rem"
    },
    ".cm-gutters": {
      backgroundColor: "#181825",
      color: "#6c7086",
      borderRight: "1px solid #313244"
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#313244",
      color: "#cdd6f4"
    },
    ".cm-activeLine": {
      backgroundColor: "#313244"
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#45475a"
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#f5e0dc"
    },
    ".cm-tooltip-autocomplete": {
      border: "1px solid #45475a",
      backgroundColor: "#181825",
      color: "#cdd6f4"
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "#313244",
      color: "#f5e0dc"
    }
  });

  const yamlHighlight = HighlightStyle.define([
    { tag: tags.keyword, color: "#89b4fa", fontWeight: "700" },
    { tag: [tags.atom, tags.bool], color: "#cba6f7", fontWeight: "600" },
    { tag: [tags.number, tags.integer, tags.float], color: "#fab387" },
    { tag: [tags.string, tags.special(tags.string)], color: "#a6e3a1" },
    { tag: [tags.comment], color: "#6c7086", fontStyle: "italic" },
    { tag: [tags.null], color: "#f38ba8", fontWeight: "600" },
    { tag: [tags.propertyName], fontWeight: "700" },
    { tag: [tags.definition(tags.propertyName)], fontWeight: "700" },
    { tag: [tags.name], color: "#cdd6f4" },
    { tag: [tags.punctuation, tags.separator], color: "#bac2de" },
    { tag: [tags.labelName], color: "#94e2d5", fontWeight: "700" }
  ]);

  onMount(() => {
    host.addEventListener("color-swatch-click", handleColorSwatchClick);
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          keymap.of([
            { key: "Enter", run: insertYamlNewlineIndent },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap
          ]),
          yaml(),
          yamlCompletions,
          syntaxHighlighting(yamlHighlight),
          semanticHighlight,
          colorPickerExtension,
          yamlTheme,
          semanticHighlightTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange(update.state.doc.toString());
            }
          })
        ]
      })
    });
  });

  $: if (view && value !== view.state.doc.toString()) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value }
    });
  }

  onDestroy(() => {
    host.removeEventListener("color-swatch-click", handleColorSwatchClick);
    view?.destroy();
  });
</script>

<div bind:this={host} class="h-full w-full overflow-hidden"></div>
<input
  bind:this={colorInput}
  type="color"
  on:input={handleColorInput}
  style="position:fixed; opacity:0; pointer-events:none; width:0; height:0;"
/>
