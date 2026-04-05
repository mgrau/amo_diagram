<script lang="ts">
  import { SCHEMA_HELP_SECTIONS } from "../schemaHelp";

  export let open = false;
  export let onClose: () => void;

  function sectionAccent(path: string): string {
    if (path === "metadata") return "text-cyan-700 bg-cyan-50 border-cyan-200";
    if (path === "style") return "text-violet-700 bg-violet-50 border-violet-200";
    if (path === "columns") return "text-amber-700 bg-amber-50 border-amber-200";
    if (path === "states") return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (path === "transitions") return "text-rose-700 bg-rose-50 border-rose-200";
    return "text-slate-700 bg-slate-50 border-slate-200";
  }

  function typeAccent(type: string): string {
    if (type.includes("number")) return "text-[#c26d17] bg-[#fff1e6] border-[#f7c79d]";
    if (type.includes("boolean")) return "text-[#8b5cf6] bg-[#f5f0ff] border-[#d8c7ff]";
    if (type.includes("string")) return "text-[#2f855a] bg-[#ebfbef] border-[#bfe7c7]";
    return "text-slate-700 bg-slate-50 border-slate-200";
  }
</script>

{#if open}
  <button
    class="absolute inset-0 z-40 bg-slate-900/30"
    aria-label="Close help"
    on:click={onClose}
  ></button>

  <section class="panel absolute inset-x-6 top-6 bottom-6 z-50 flex flex-col overflow-hidden rounded-md md:inset-x-12 lg:inset-x-20">
    <div class="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Schema Help</p>
        <h2 class="mt-1 text-2xl font-bold text-gray-900">YAML Reference</h2>
        <p class="mt-2 max-w-3xl text-sm text-gray-600">
          Use this as the app’s built-in schema guide. States are keyed by id, transitions reference those ids, and optional values fall back to the built-in defaults.
        </p>
      </div>
      <button
        class="rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-white"
        on:click={onClose}
      >
        Close
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
      <div class="mb-6 rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Top-level sections include <code class="rounded bg-[#f5f0ff] px-1.5 py-0.5 font-semibold text-[#8b5cf6]">metadata:</code>, <code class="rounded bg-[#f5f0ff] px-1.5 py-0.5 font-semibold text-[#8b5cf6]">style:</code>, <code class="rounded bg-[#f5f0ff] px-1.5 py-0.5 font-semibold text-[#8b5cf6]">layout:</code>, <code class="rounded bg-[#f5f0ff] px-1.5 py-0.5 font-semibold text-[#8b5cf6]">defaults:</code>, <code class="rounded bg-[#f5f0ff] px-1.5 py-0.5 font-semibold text-[#8b5cf6]">columns:</code>, <code class="rounded bg-[#f5f0ff] px-1.5 py-0.5 font-semibold text-[#8b5cf6]">states:</code>, and <code class="rounded bg-[#f5f0ff] px-1.5 py-0.5 font-semibold text-[#8b5cf6]">transitions:</code>. Example: <code class="rounded bg-[#ebfbef] px-1.5 py-0.5 text-[#2f855a]">states: {"{"} 1S0: {"{"} energy: 0 {"}"} {"}"}</code>
      </div>

      <div class="space-y-8">
        {#each SCHEMA_HELP_SECTIONS as section}
          <section>
            <div class="mb-3">
              <div class={`inline-flex rounded border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${sectionAccent(section.path)}`}>{section.path}</div>
              <h3 class="text-lg font-bold text-gray-900">{section.title}</h3>
              <p class="mt-1 text-sm text-gray-600">{section.description}</p>
            </div>

            <div class="overflow-hidden rounded-md border border-gray-200">
              <table class="min-w-full border-collapse text-sm">
                <thead class="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th class="border-b border-gray-200 px-4 py-3 font-semibold">Property</th>
                    <th class="border-b border-gray-200 px-4 py-3 font-semibold">Type</th>
                    <th class="border-b border-gray-200 px-4 py-3 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {#each section.fields as field}
                    <tr class="align-top odd:bg-white even:bg-gray-50/50">
                      <td class="border-b border-gray-100 px-4 py-3">
                        <code class="rounded bg-[#fdf2f8] px-1.5 py-1 font-mono text-xs font-semibold text-[#c061cb]">{field.name}</code>
                      </td>
                      <td class="border-b border-gray-100 px-4 py-3 text-xs">
                        <span class={`inline-flex rounded border px-2 py-1 font-medium ${typeAccent(field.type)}`}>{field.type}</span>
                      </td>
                      <td class="border-b border-gray-100 px-4 py-3 text-gray-700">{field.description}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </section>
        {/each}
      </div>
    </div>
  </section>
{/if}
