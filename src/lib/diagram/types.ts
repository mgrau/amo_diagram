export interface Metadata {
  name?: string;
  element?: string;
  ion_charge: number;
  title?: string;
  footer?: string;
  energy_unit: string;
  energy_min?: number;
  energy_max?: number;
}

export interface Style {
  theme: string;
  figure_width?: number;
  figure_height?: number;
  arrowhead?: "triangle" | "angle" | "stealth";
  endpoint_clearance?: number;
  state_linewidth?: number;
  state_length?: number;
  state_font_size?: number;
  label_font_size?: number;
  title_font_size?: number;
  footer_font_size?: number;
  column_label_font_size?: number;
  transition_linewidth?: number;
  transition_font_size?: number;
  arrowsize?: number;
  font_family?: string;
  show_energy_axis?: boolean;
  show_energy_labels?: boolean;
  show_column_labels?: boolean;
  mathjax_labels?: boolean;
}

export interface ColumnSpec {
  id: string;
  label?: string;
  column_order: number;
  column_width: number;
  x_position?: number;
}

export interface StateSpec {
  id: string;
  label?: string;
  energy: number;
  config?: string;
  term?: string;
  S?: number;
  L?: number;
  J?: number;
  parity?: string;
  column?: string | number;
  y_position?: number;
  label_side: "auto" | "left" | "right" | "below-left";
  label_va: "center" | "bottom" | "top";
  font_size?: number;
  label_offset_x: number;
  label_offset_y: number;
  label_x?: number;
  label_y?: number;
}

export interface TransitionSpec {
  upper: string;
  lower: string;
  arrowhead?: "triangle" | "angle" | "stealth";
  endpoint_clearance?: number;
  wavelength_nm?: number;
  einstein_A?: number;
  linestyle: string;
  linewidth?: number;
  color?: string;
  label?: string;
  show_wavelength: boolean;
  arrow: boolean;
  arrow_both_ends: boolean;
  wavy: boolean;
  label_offset_x: number;
  label_offset_y: number;
  label_rotation: number;
  start_x_offset: number;
  end_x_offset: number;
  label_position: number;
  position: "transition" | "left" | "right" | "auto";
  upper_anchor?: number;
  lower_anchor?: number;
  label_ha: "left" | "center" | "right";
  label_va: "top" | "center" | "bottom";
  font_size?: number;
  label_fontstyle: string;
  label_x?: number;
  label_y?: number;
  alignment: "transition" | "horizontal";
}

export interface LayoutPolicyOverrides {
  anchor_even_distribute?: boolean;
  anchor_sa?: boolean;
  anchor_score_crossing_weight?: number;
  anchor_score_parallel_weight?: number;
  anchor_score_repulsion_weight?: number;
  anchor_score_center_weight?: number;
  anchor_score_line_repulsion_weight?: number;
  anchor_sa_t_initial?: number;
  anchor_sa_t_final?: number;
  anchor_sa_cooling_rate?: number;
  anchor_sa_steps_per_temp?: number;
  anchor_sa_perturb_sigma?: number;
}

export interface DiagramSpec {
  metadata: Metadata;
  style: Style;
  layout: LayoutPolicyOverrides;
  columns: ColumnSpec[];
  states: StateSpec[];
  transitions: TransitionSpec[];
}

export interface LayoutPolicy {
  axes_x_min: number;
  axes_x_max: number;
  axes_y_min: number;
  axes_y_max: number;
  axes_margin: number;
  group_min_column_width: number;
  state_overlap_threshold: number;
  state_x_nudge_scale: number;
  figure_auto_height_min: number;
  figure_auto_height_energy_scale: number;
  figure_auto_width_per_group: number;
  figure_auto_width_base: number;
  group_label_y_offset: number;
  axis_label_x_offset: number;
  axis_tick_extent: number;
  axis_tick_label_gap: number;
  axis_line_x_offset: number;
  state_label_gap: number;
  energy_label_gap: number;
  state_label_clearance_padding: number;
  label_interference_gap: number;
  label_line_clearance: number;
  text_width_factor: number;
  text_height_factor: number;
  term_script_font_scale: number;
  term_height_script_scale: number;
  term_leading_sup_scale_x: number;
  term_leading_sup_scale_y: number;
  term_trailing_sup_scale_x: number;
  term_trailing_sup_scale_y: number;
  term_subscript_scale_x: number;
  term_subscript_scale_y: number;
  anchor_even_distribute: boolean;
  anchor_sa: boolean;
  anchor_score_crossing_weight: number;
  anchor_score_parallel_weight: number;
  anchor_score_repulsion_weight: number;
  anchor_score_center_weight: number;
  anchor_score_line_repulsion_weight: number;
  anchor_sa_t_initial: number;
  anchor_sa_t_final: number;
  anchor_sa_cooling_rate: number;
  anchor_sa_steps_per_temp: number;
  anchor_sa_perturb_sigma: number;
  transition_label_pad_min: number;
  transition_label_step_min: number;
  transition_label_step_scale: number;
  transition_label_max_distance_scale: number;
  transition_label_transition_overlap_weight: number;
  transition_label_label_overlap_weight: number;
  transition_label_static_overlap_weight: number;
  transition_label_label_gap_weight: number;
  transition_label_static_gap_weight: number;
  transition_label_gap_scale: number;
  transition_label_above_pad_scale: number;
  arrowhead_length_scale: number;
  arrowhead_width_scale: number;
  svg_padding_min_px: number;
  svg_padding_fraction: number;
  wavy_straight_fraction: number;
  wavy_ramp_fraction: number;
  wavy_cycles: number;
  wavy_amplitude: number;
  wavy_steps: number;
  mathjax_scale: number;
}

export interface Theme {
  arrowhead: "triangle" | "angle" | "stealth";
  endpoint_clearance: number;
  state_linewidth: number;
  state_color: string;
  state_length: number;
  state_font_size: number;
  transition_color: string;
  transition_linewidth: number;
  arrowsize: number;
  font_family: string;
  label_font_size: number;
  title_font_size: number;
  footer_font_size: number;
  column_label_font_size: number;
  transition_font_size: number;
  energy_label: string;
  show_energy_axis: boolean;
  show_energy_labels: boolean;
  show_column_labels: boolean;
  mathjax_labels: boolean;
  layout_policy: LayoutPolicy;
}

export interface StateLayout {
  state_id: string;
  x_center: number;
  y: number;
  x_left: number;
  x_right: number;
  column_id: string;
}

export interface LayoutResult {
  states: Record<string, StateLayout>;
  group_x_centers: Record<string, number>;
  fig_width: number;
  fig_height: number;
}

export interface TermSymbolParts {
  leading_prefix?: string;
  main_text: string;
  leading_superscript?: string;
  trailing_superscript?: string;
  subscript?: string;
}

export interface LabelVisual {
  text: string;
  x: number;
  y: number;
  ha: "left" | "center" | "right";
  va: "top" | "center" | "bottom";
  fontSize?: number;
  rotation?: number;
  fontstyle?: string;
}

export interface StateVisual {
  state: StateSpec;
  layout: StateLayout;
  label: LabelVisual;
  svg_label_text: string;
  latex_label?: string;
  term_parts?: TermSymbolParts;
  energy_label?: LabelVisual;
  label_side: string;
}

export interface TransitionVisual {
  transition: TransitionSpec;
  index: number;
  points: [number, number][];
  label?: LabelVisual;
  start_marker: boolean;
  end_marker: boolean;
  color: string;
  linewidth: number;
  linestyle: string;
  arrowhead: "triangle" | "angle" | "stealth";
  upper_anchor: number;
  lower_anchor: number;
}

export interface Scene {
  state_visuals: Record<string, StateVisual>;
  transition_visuals: TransitionVisual[];
  group_labels: LabelVisual[];
  axis_label?: LabelVisual;
  axis_ticks: [number, string][];
  title?: string;
  footer?: string;
}
