# Level Diagram

Browser-based level-diagram editor and renderer.

Recent additions include:

- `decay` transitions for lower-state-only wavy arrows
- `arrows: single|double|none` transition controls
- global `style.font_size` plus local `font_size` overrides on states and transitions
- Zeeman sublevel expansion from a compact state definition

## Stack

- `Vite` for static builds and GitHub Pages deployment
- `Svelte` for UI composition
- `Tailwind CSS` for layout and styling
- `CodeMirror 6` for YAML editing, syntax highlighting, and completions
- Pure TypeScript diagram engine that mirrors the Python pipeline

## Rendering Pipeline

1. Load built-in YAML defaults.
2. Parse the user YAML and deep-merge defaults.
3. Validate groups, levels, transitions, and style fields.
4. Compute level layout from energy positions, then expand vertical spacing when labels would collide.
5. Compute transition anchors:
   - start/end at state centers
   - distribute shared endpoints around the center
   - minimize crossings and endpoint crowding
   - nudge adjacent transitions toward parallel slopes
6. Build visual primitives:
   - state lines
   - transition polylines
   - term-symbol label fragments
   - transition labels
7. Serialize the scene into a readable SVG with grouped elements.

PNG export rasterizes the same SVG. PDF export converts the same SVG DOM into PDF, so all export paths share one geometry model.

## Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run check`
