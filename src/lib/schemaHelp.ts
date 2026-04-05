import { SCHEMA_SECTION_DEFINITIONS, type SchemaSectionDefinition } from "./schemaDefinition";

export type HelpField = SchemaSectionDefinition["fields"][number];
export type HelpSection = SchemaSectionDefinition;

export const SCHEMA_HELP_SECTIONS: HelpSection[] = SCHEMA_SECTION_DEFINITIONS;
