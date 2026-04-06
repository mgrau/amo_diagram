# Interactive Editing Spec

## Identity Model

Interactive targets are identified by stable YAML paths, not by SVG ids.

- States are identified by `states.<state_id>`.
- Transitions are identified by their zero-based position in `transitions`.
- Transition labels and endpoint handles therefore use `transitions[index]`.

This keeps the YAML contract simple and avoids requiring explicit transition ids.

## Milestones

### Milestone 1: Transition Endpoint Dragging

Users can select a transition in the preview and drag its upper or lower endpoint handle along the corresponding state line.

Write-back:

- Dragging the upper endpoint writes `transitions[index].upper_anchor`
- Dragging the lower endpoint writes `transitions[index].lower_anchor`

Behavior:

- Manual anchors override the auto-anchor annealing path automatically.
- The preview uses an editor-only interaction overlay; exported SVG/PDF/PNG output is unchanged.
- The YAML editor updates on pointer release, not on every pointer move.

### Milestone 2: Transition Label Editing

Transition-label dragging writes the existing fields:

- `label_x`
- `label_y`
- `label_rotation`
- `font_size`

Behavior:

- Label selection is independent from transition-line selection.
- Dragging the selected label updates a live overlay and writes `label_x` / `label_y` on pointer release.
- A dedicated label popover controls `label_rotation` and `font_size`.
- Rotation and font-size changes preview live in the overlay and write back on control commit.

### Milestone 3: Transition Style Editing

Transition style edits write the existing fields:

- `linewidth`
- `color`
- `arrowsize`
- `linestyle`
- `arrowhead`
- `arrows`

### Milestone 4: State-Label Editing

Current state-label positioning can already write:

- `label_x`
- `label_y`
- `font_size`

Planned YAML addition:

- `states.<id>.label_rotation`

That field does not exist yet and should be added when state-label rotation is implemented.

## Interaction Data Contract

The render worker should return an editor-only interaction model alongside the SVG preview.

For milestone 1 the interaction model must include:

- final SVG width and height
- per-transition polyline points in final SVG coordinates
- per-endpoint handle position in final SVG coordinates
- the associated state-line span for each endpoint
- the current anchor value for each endpoint

This is enough to support hit-testing, handle placement, and anchor recomputation without parsing SVG geometry back out of the DOM.
