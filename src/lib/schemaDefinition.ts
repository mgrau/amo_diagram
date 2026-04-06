export type SchemaField = {
  name: string;
  key?: string;
  type: string;
  description: string;
  enumValues?: string[];
};

export type SchemaSectionDefinition = {
  title: string;
  path: string;
  description: string;
  fields: SchemaField[];
};

export const SCHEMA_SECTION_DEFINITIONS: SchemaSectionDefinition[] = [
  {
    title: "Metadata",
    path: "metadata",
    description: "Diagram-level metadata. `energy_min` and `energy_max` are optional; if omitted they are inferred from the states.",
    fields: [
      { name: "name", type: "string", description: "Display name used in the app and as the default export basename." },
      { name: "element", type: "string", description: "Element or species symbol used when `name` is omitted." },
      { name: "ion_charge", type: "number", description: "Charge appended to `element` in metadata-driven contexts, for example `1` for `Ba+`." },
      { name: "title", type: "string", description: "Diagram title shown above the plot." },
      { name: "footer", type: "string", description: "Footer text shown below the plot." },
      { name: "energy_unit", type: "string", description: "Unit label used for the energy axis, for example `cm-1` or `eV`." },
      { name: "energy_min", type: "number", description: "Optional lower bound for the energy scale." },
      { name: "energy_max", type: "number", description: "Optional upper bound for the energy scale." }
    ]
  },
  {
    title: "Style",
    path: "style",
    description: "Global drawing defaults. Local state and transition overrides still take precedence.",
    fields: [
      { name: "theme", type: "string", description: "Theme name. The app currently uses the built-in default theme." },
      { name: "font_size", type: "number", description: "Global base font size used when more specific size fields are omitted." },
      { name: "arrowhead", type: "triangle | angle | stealth", description: "Default transition arrowhead shape.", enumValues: ["triangle", "angle", "stealth"] },
      { name: "figure_width", type: "number", description: "Figure width in inches." },
      { name: "figure_height", type: "number", description: "Figure height in inches." },
      { name: "state_linewidth", type: "number", description: "Stroke width for state lines." },
      { name: "state_length", type: "number", description: "Fractional state-line length within each column." },
      { name: "state_font_size", type: "number", description: "Default font size for state labels." },
      { name: "label_font_size", type: "number", description: "Fallback font size for helper labels such as `m_J` and axis text." },
      { name: "title_font_size", type: "number", description: "Font size for the title." },
      { name: "footer_font_size", type: "number", description: "Font size for the footer." },
      { name: "column_label_font_size", type: "number", description: "Font size for column labels." },
      { name: "transition_linewidth", type: "number", description: "Default transition stroke width." },
      { name: "transition_font_size", type: "number", description: "Default font size for transition labels." },
      { name: "endpoint_clearance", type: "number", description: "Default gap between a transition and its state line." },
      { name: "arrowsize", type: "number", description: "Base arrowhead size." },
      { name: "font_family", type: "string", description: "Global font family. Default is `STIXGeneral`." },
      { name: "show_energy_axis", type: "boolean", description: "Render the energy axis on the left side of the plot." },
      { name: "show_energy_labels", type: "boolean", description: "Show tick labels on the energy axis." },
      { name: "show_column_labels", type: "boolean", description: "Show labels for the resolved columns." },
      { name: "mathjax_labels", type: "boolean", description: "Render state labels through MathJax when possible." }
    ]
  },
  {
    title: "Layout",
    path: "layout",
    description: "Advanced anchor-placement controls for transition routing.",
    fields: [
      { name: "anchor_even_distribute", type: "boolean", description: "Spread auto-anchors evenly across each state before optimization." },
      { name: "anchor_sa", type: "boolean", description: "Enable simulated annealing for transition anchor placement." },
      { name: "anchor_score_crossing_weight", type: "number", description: "Penalty weight for transition crossings." },
      { name: "anchor_score_parallel_weight", type: "number", description: "Penalty weight that encourages similar slopes within a column pair." },
      { name: "anchor_score_repulsion_weight", type: "number", description: "Penalty weight that pushes anchors apart on the same state." },
      { name: "anchor_score_center_weight", type: "number", description: "Penalty weight that keeps auto-anchors near the center." },
      { name: "anchor_score_line_repulsion_weight", type: "number", description: "Penalty weight for polylines that crowd each other." },
      { name: "anchor_sa_t_initial", type: "number", description: "Initial simulated-annealing temperature." },
      { name: "anchor_sa_t_final", type: "number", description: "Final simulated-annealing temperature." },
      { name: "anchor_sa_cooling_rate", type: "number", description: "Cooling multiplier applied each temperature step." },
      { name: "anchor_sa_steps_per_temp", type: "number", description: "Number of perturbations attempted at each temperature." },
      { name: "anchor_sa_perturb_sigma", type: "number", description: "Standard deviation of each anchor perturbation." }
    ]
  },
  {
    title: "Defaults",
    path: "defaults",
    description: "Collection defaults merged into every `columns`, `states`, or `transitions` entry before normalization.",
    fields: [
      { name: "column", type: "object", description: "Default values for each column. Compatibility alias: `defaults.group`." },
      { name: "state", type: "object", description: "Default values for each state." },
      { name: "transition", type: "object", description: "Default values for each transition." }
    ]
  },
  {
    title: "Columns",
    path: "columns",
    description: "Optional explicit column layout. Compatibility alias: top-level `groups`.",
    fields: [
      { name: "id", type: "string | number", description: "Column identifier referenced by `states.*.column`." },
      { name: "label", type: "string", description: "Visible column label when column labels are enabled." },
      { name: "column_order", type: "number", description: "Ordering from left to right." },
      { name: "column_width", type: "number", description: "Relative width share of the column." },
      { name: "x_position", type: "number", description: "Optional absolute x position in normalized plot coordinates." }
    ]
  },
  {
    title: "States",
    path: "states",
    description: "States are keyed by id. Transitions reference them through `upper` and `lower`.",
    fields: [
      { name: "label", type: "string", description: "Visible label text. If omitted, the id or an inferred term symbol is used." },
      { name: "energy", type: "number", description: "State energy for vertical placement. Compatibility alias: `energy_cm`." },
      { name: "config", type: "string", description: "Configuration used when building automatic term labels." },
      { name: "term", type: "string", description: "Explicit term-symbol text or LaTeX." },
      { name: "S", type: "number", description: "Spin quantum number for automatic term labels." },
      { name: "L", type: "number", description: "Orbital angular momentum quantum number." },
      { name: "J", type: "number", description: "Total angular momentum quantum number." },
      { name: "parity", type: "string", description: "Parity marker used in automatic term labels." },
      { name: "column", type: "string | number", description: "Column id. Compatibility alias: `group`. Defaults to `L` when omitted." },
      { name: "y_position", type: "number", description: "Optional manual normalized y position." },
      { name: "label_side", type: "auto | left | right | below-left", description: "State label placement preference.", enumValues: ["auto", "left", "right", "below-left"] },
      { name: "label_va", type: "top | center | bottom", description: "Vertical anchor for the state label.", enumValues: ["top", "center", "bottom"] },
      { name: "font_size", type: "number", description: "Local override for the state label size. Compatibility alias: `label_font_size`." },
      { name: "label_offset_x", type: "number", description: "Manual x offset for the state label." },
      { name: "label_offset_y", type: "number", description: "Manual y offset for the state label." },
      { name: "label_x", type: "number", description: "Absolute normalized x position for the state label." },
      { name: "label_y", type: "number", description: "Absolute normalized y position for the state label." },
      { name: "zeeman", type: "boolean | number | object", description: "Expand a compact state into Zeeman sublevels. A number is shorthand for `zeeman.energy_step`." },
      { name: "zeeman.energy_step", key: "energy_step", type: "number", description: "Energy shift applied per `Δm = 1`." },
      { name: "zeeman.step", key: "step", type: "number", description: "Compatibility alias for `zeeman.energy_step`." },
      { name: "zeeman.values", key: "values", type: "number[]", description: "Explicit magnetic quantum numbers. Defaults to `-J ... +J`." },
      { name: "zeeman.width", key: "width", type: "number", description: "Slot width for each Zeeman sublevel as a fraction of the original state width." },
      { name: "zeeman.label_position", key: "label_position", type: "above | below", description: "Place the per-sublevel `m_J` labels above or below the bars.", enumValues: ["above", "below"] }
    ]
  },
  {
    title: "Transitions",
    path: "transitions",
    description: "Transitions connect state ids. Labels follow the line unless `alignment: horizontal` is set.",
    fields: [
      { name: "upper", type: "string", description: "Upper-state id." },
      { name: "lower", type: "string", description: "Lower-state id." },
      { name: "wavelength_nm", type: "number", description: "Wavelength used for labels and default color." },
      { name: "einstein_A", type: "number", description: "Optional transition-rate metadata." },
      { name: "linestyle", type: "string", description: "Stroke style. Current renderer treats all transitions as solid." },
      { name: "arrowhead", type: "triangle | angle | stealth", description: "Local arrowhead override.", enumValues: ["triangle", "angle", "stealth"] },
      { name: "arrowsize", type: "number", description: "Local arrowhead size override." },
      { name: "linewidth", type: "number", description: "Local transition stroke-width override." },
      { name: "endpoint_clearance", type: "number", description: "Local endpoint gap override." },
      { name: "color", type: "string", description: "Explicit stroke color. If omitted, color is inferred from wavelength." },
      { name: "label", type: "string", description: "Visible transition label text." },
      { name: "show_wavelength", type: "boolean", description: "Append the wavelength text automatically." },
      { name: "arrows", type: "none | single | double", description: "Canonical arrow mode. Compatibility aliases: `arrow`, `arrow_both_ends`, `arrow_mode`.", enumValues: ["none", "single", "double"] },
      { name: "decay", type: "boolean", description: "Shortcut for `wavy: true` with `arrows: single`." },
      { name: "wavy", type: "boolean", description: "Use the wavy decay-line primitive." },
      { name: "alignment", type: "transition | horizontal", description: "Rotate with the line or keep the label horizontal. Compatibility alias: `label_orientation`.", enumValues: ["transition", "horizontal"] },
      { name: "position", type: "transition | left | right | auto", description: "Place the label on the line or offset it to one side.", enumValues: ["transition", "left", "right", "auto"] },
      { name: "label_position", type: "number", description: "Fractional position along the transition polyline." },
      { name: "label_rotation", type: "number", description: "Additional label rotation in degrees." },
      { name: "label_ha", type: "left | center | right", description: "Horizontal anchor for the label.", enumValues: ["left", "center", "right"] },
      { name: "label_va", type: "top | center | bottom", description: "Vertical anchor for the label.", enumValues: ["top", "center", "bottom"] },
      { name: "font_size", type: "number", description: "Local transition-label size override. Compatibility alias: `label_font_size`." },
      { name: "label_fontstyle", type: "string", description: "Font style for the transition label." },
      { name: "label_offset_x", type: "number", description: "Manual x offset for the transition label." },
      { name: "label_offset_y", type: "number", description: "Manual y offset for the transition label." },
      { name: "label_x", type: "number", description: "Absolute normalized x position for the label." },
      { name: "label_y", type: "number", description: "Absolute normalized y position for the label." },
      { name: "start_x_offset", type: "number", description: "Manual x shift for the upper endpoint." },
      { name: "end_x_offset", type: "number", description: "Manual x shift for the lower endpoint." },
      { name: "upper_anchor", type: "number", description: "Manual anchor fraction on the upper state line." },
      { name: "lower_anchor", type: "number", description: "Manual anchor fraction on the lower state line." }
    ]
  }
];

export function schemaCompletionLabels(): string[] {
  const propertyLabels = new Set<string>();
  SCHEMA_SECTION_DEFINITIONS.forEach((section) => {
    propertyLabels.add(`${section.path}:`);
    section.fields.forEach((field) => {
      propertyLabels.add(`${field.key ?? field.name.split(".").at(-1)!}:`);
      field.enumValues?.forEach((value) => propertyLabels.add(value));
    });
  });
  return [...propertyLabels];
}
