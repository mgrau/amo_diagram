import { autocompletion, completeFromList, type Completion } from "@codemirror/autocomplete";
import { schemaCompletionLabels } from "../schemaDefinition";

const completions: Completion[] = schemaCompletionLabels()
  .map((label) => ({ label, type: label.endsWith(":") ? "property" : "keyword" }));

export const yamlCompletions = autocompletion({
  override: [completeFromList(completions)]
});
