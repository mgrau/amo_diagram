export type HelpField = {
  name: string;
  type: string;
  description: string;
};

export type HelpSection = {
  title: string;
  path: string;
  description: string;
  fields: HelpField[];
};

export const SCHEMA_HELP_SECTIONS: HelpSection[] = [
  {
    title: "Metadata",
    path: "metadata",
    description: "Diagram-level information. `energy_min` and `energy_max` are optional; if omitted they are inferred from the state energies.",
    fields: [
      { name: "element", type: "string", description: "Element symbol shown only in metadata-driven contexts." },
      { name: "ion_charge", type: "number", description: "Ion charge, for example `1` for Ba+." },
      { name: "title", type: "string", description: "Diagram title shown at the top of the SVG. If omitted, no title gap is reserved." },
      { name: "footer", type: "string", description: "Footer text shown at the bottom of the SVG. If omitted, no footer gap is reserved." },
      { name: "energy_unit", type: "string", description: "Energy unit label metadata. Default is `cm-1`." },
      { name: "energy_min", type: "number", description: "Optional lower bound for the energy scale." },
      { name: "energy_max", type: "number", description: "Optional upper bound for the energy scale." }
    ]
  },
  {
    title: "Style",
    path: "style",
    description: "Global drawing defaults. Local `font_size` and per-transition `linewidth` overrides still take precedence.",
    fields: [
      { name: "theme", type: "string", description: "Theme name. Current app uses the built-in default theme." },
      { name: "font_size", type: "number", description: "Global base font size. Specific size fields still override it." },
      { name: "arrowhead", type: "triangle | angle | stealth", description: "Default transition arrowhead shape." },
      { name: "figure_width", type: "number", description: "Figure width in inches. Default is `5`." },
      { name: "figure_height", type: "number", description: "Figure height in inches. Default is `5`." },
      { name: "state_linewidth", type: "number", description: "Stroke width for state lines." },
      { name: "state_length", type: "number", description: "Fractional length of each state line within its column." },
      { name: "state_font_size", type: "number", description: "Default font size for state labels." },
      { name: "label_font_size", type: "number", description: "General fallback label size for non-state text helpers." },
      { name: "title_font_size", type: "number", description: "Font size for the title above the diagram." },
      { name: "footer_font_size", type: "number", description: "Font size for footer text at the bottom of the diagram." },
      { name: "column_label_font_size", type: "number", description: "Font size for column labels when shown." },
      { name: "transition_linewidth", type: "number", description: "Default transition stroke width." },
      { name: "transition_font_size", type: "number", description: "Default font size for transition labels." },
      { name: "endpoint_clearance", type: "number", description: "Default gap between state lines and transition arrow tips." },
      { name: "arrowsize", type: "number", description: "Base size used for transition arrowheads." },
      { name: "font_family", type: "string", description: "Global font family. Default is `STIXGeneral`." },
      { name: "show_energy_axis", type: "boolean", description: "Reserved switch for energy-axis rendering." },
      { name: "show_energy_labels", type: "boolean", description: "Reserved switch for energy tick labels." },
      { name: "show_column_labels", type: "boolean", description: "Show column labels from the `columns` section." },
      { name: "mathjax_labels", type: "boolean", description: "Render state labels using MathJax instead of the built-in term symbol renderer." }
    ]
  },
  {
    title: "Columns",
    path: "columns",
    description: "Optional column layout. If a state does not set `column`, it defaults to its `L` value.",
    fields: [
      { name: "id", type: "string | number", description: "Column identifier used by states." },
      { name: "label", type: "string", description: "Visible column label if column labels are enabled." },
      { name: "column_order", type: "number", description: "Ordering from left to right." },
      { name: "column_width", type: "number", description: "Relative width share for the column." },
      { name: "x_position", type: "number", description: "Optional absolute x position in normalized plot coordinates." }
    ]
  },
  {
    title: "States",
    path: "states",
    description: "States are keyed by id. Transitions reference those ids via `upper` and `lower`.",
    fields: [
      { name: "label", type: "string", description: "Visible label text. If omitted, the state id is used." },
      { name: "energy", type: "number", description: "State energy used for vertical placement." },
      { name: "config", type: "string", description: "Configuration used in automatic term-symbol formatting." },
      { name: "term", type: "string", description: "Explicit term-symbol text." },
      { name: "S", type: "number", description: "Spin quantum number for automatic term labels." },
      { name: "L", type: "number", description: "Orbital angular momentum quantum number." },
      { name: "J", type: "number", description: "Total angular momentum quantum number." },
      { name: "parity", type: "string", description: "Parity marker used in automatic term labels." },
      { name: "column", type: "string | number", description: "Column id. Defaults to `L` when omitted." },
      { name: "y_position", type: "number", description: "Optional manual normalized y position." },
      { name: "label_side", type: "auto | left | right | below-left", description: "State label placement preference." },
      { name: "label_va", type: "top | center | bottom", description: "Vertical anchor for the state label." },
      { name: "font_size", type: "number", description: "Local override for this state label size." },
      { name: "zeeman", type: "number | object", description: "Expand the state into Zeeman sublevels. A number is shorthand for `zeeman.step`." },
      { name: "zeeman.step", type: "number", description: "Energy shift applied per `Δm = 1` when Zeeman sublevels are expanded." },
      { name: "zeeman.values", type: "number[]", description: "Explicit magnetic quantum numbers. Defaults to `-J ... +J`." },
      { name: "label_offset_x", type: "number", description: "Manual x offset for the label." },
      { name: "label_offset_y", type: "number", description: "Manual y offset for the label." },
      { name: "label_x", type: "number", description: "Absolute normalized x position for the label." },
      { name: "label_y", type: "number", description: "Absolute normalized y position for the label." }
    ]
  },
  {
    title: "Transitions",
    path: "transitions",
    description: "Transitions connect state ids. Labels default to following the transition with automatic side selection.",
    fields: [
      { name: "upper", type: "string", description: "Upper state id." },
      { name: "lower", type: "string", description: "Lower state id." },
      { name: "wavelength_nm", type: "number", description: "Wavelength used for labels and default transition color." },
      { name: "einstein_A", type: "number", description: "Optional transition rate metadata." },
      { name: "linestyle", type: "string", description: "Stroke style, typically `solid`." },
      { name: "arrowhead", type: "triangle | angle | stealth", description: "Local override for the arrowhead shape on this transition." },
      { name: "linewidth", type: "number", description: "Local override for transition stroke width." },
      { name: "endpoint_clearance", type: "number", description: "Local override for the gap between the state line and this transition's arrow tip." },
      { name: "color", type: "string", description: "Explicit stroke color. If omitted, color is inferred from wavelength." },
      { name: "label", type: "string", description: "Visible transition label text." },
      { name: "show_wavelength", type: "boolean", description: "Append wavelength text automatically." },
      { name: "arrows", type: "none | single | double", description: "Preferred arrow mode for the transition." },
      { name: "decay", type: "boolean", description: "Shortcut for a wavy line with a single arrowhead on the lower state." },
      { name: "arrow", type: "boolean", description: "Draw an arrowhead at the lower end." },
      { name: "arrow_both_ends", type: "boolean", description: "Draw arrowheads at both ends." },
      { name: "wavy", type: "boolean", description: "Use the decay squiggle primitive." },
      { name: "alignment", type: "transition | horizontal", description: "Rotate label with the line or keep it horizontal." },
      { name: "position", type: "transition | left | right | auto", description: "Place label on the line or offset to one side." },
      { name: "label_position", type: "number", description: "Fractional position along the transition polyline." },
      { name: "label_rotation", type: "number", description: "Additional label rotation in degrees." },
      { name: "label_ha", type: "left | center | right", description: "Horizontal anchor for the label." },
      { name: "label_va", type: "top | center | bottom", description: "Vertical anchor for the label." },
      { name: "font_size", type: "number", description: "Local override for this transition label size." },
      { name: "label_fontstyle", type: "string", description: "Font style for the transition label." },
      { name: "label_offset_x", type: "number", description: "Manual label x offset." },
      { name: "label_offset_y", type: "number", description: "Manual label y offset." },
      { name: "label_x", type: "number", description: "Absolute normalized x position for the label." },
      { name: "label_y", type: "number", description: "Absolute normalized y position for the label." },
      { name: "start_x_offset", type: "number", description: "Manual x shift for the upper endpoint." },
      { name: "end_x_offset", type: "number", description: "Manual x shift for the lower endpoint." },
      { name: "upper_anchor", type: "number", description: "Manual anchor fraction on the upper state line." },
      { name: "lower_anchor", type: "number", description: "Manual anchor fraction on the lower state line." }
    ]
  },
];
