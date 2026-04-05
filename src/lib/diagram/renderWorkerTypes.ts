import type { RenderedDiagram } from "./render";

export type RenderWorkerRequest = {
  id: number;
  source: string;
};

export type RenderWorkerResponse =
  | {
      type: "success";
      id: number;
      rendered: RenderedDiagram;
    }
  | {
      type: "error";
      id: number;
      error: string;
    };
