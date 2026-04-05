/// <reference lib="webworker" />

import { ensureMathJax } from "./mathjax";
import { renderDiagram } from "./render";
import type { RenderWorkerRequest, RenderWorkerResponse } from "./renderWorkerTypes";

declare const self: DedicatedWorkerGlobalScope;

let pendingRequest: RenderWorkerRequest | null = null;
let processing = false;

self.onmessage = (event: MessageEvent<RenderWorkerRequest>): void => {
  pendingRequest = event.data;
  if (!processing) {
    void drainRenderQueue();
  }
};

async function drainRenderQueue(): Promise<void> {
  processing = true;
  while (pendingRequest) {
    const { id, source } = pendingRequest;
    pendingRequest = null;
    try {
      await ensureMathJax();
      const rendered = renderDiagram(source);
      const response: RenderWorkerResponse = { type: "success", id, rendered };
      self.postMessage(response);
    } catch (caught) {
      const response: RenderWorkerResponse = {
        type: "error",
        id,
        error: caught instanceof Error ? caught.message : "Unknown rendering error."
      };
      self.postMessage(response);
    }
  }
  processing = false;
}

export {};
