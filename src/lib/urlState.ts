export type SharedDiagramOutput = "editor" | "svg" | "png" | "pdf";

const DIAGRAM_PARAM = "diagram";
const OUTPUT_PARAM = "output";
const GZIP_PREFIX = "gz";
const BASE64_PREFIX = "b64";

export function parseSharedDiagramRequest(url: URL): {
  encodedSource: string | null;
  output: SharedDiagramOutput;
} {
  const rawOutput = url.searchParams.get(OUTPUT_PARAM);
  const output = rawOutput === "svg" || rawOutput === "png" || rawOutput === "pdf"
    ? rawOutput
    : "editor";
  return {
    encodedSource: url.searchParams.get(DIAGRAM_PARAM),
    output
  };
}

export async function buildSharedDiagramUrls(baseUrl: URL, source: string): Promise<Record<SharedDiagramOutput, string>> {
  const encoded = await encodeDiagramSource(source);
  return {
    editor: buildModeUrl(baseUrl, encoded, "editor"),
    svg: buildModeUrl(baseUrl, encoded, "svg"),
    png: buildModeUrl(baseUrl, encoded, "png"),
    pdf: buildModeUrl(baseUrl, encoded, "pdf")
  };
}

export async function decodeSharedDiagramSource(encodedSource: string): Promise<string> {
  const separator = encodedSource.indexOf(".");
  if (separator <= 0 || separator === encodedSource.length - 1) {
    throw new Error("Invalid shared diagram URL.");
  }
  const prefix = encodedSource.slice(0, separator);
  const payload = encodedSource.slice(separator + 1);
  const bytes = decodeBase64Url(payload);
  if (prefix === GZIP_PREFIX) {
    return new TextDecoder().decode(await gunzipBytes(bytes));
  }
  if (prefix === BASE64_PREFIX) {
    return new TextDecoder().decode(bytes);
  }
  throw new Error("Unsupported shared diagram encoding.");
}

async function encodeDiagramSource(source: string): Promise<string> {
  const bytes = new TextEncoder().encode(source);
  if (typeof CompressionStream !== "undefined") {
    try {
      const compressed = await transformBytes(bytes, new CompressionStream("gzip"));
      return `${GZIP_PREFIX}.${encodeBase64Url(compressed)}`;
    } catch {
      // Fall back to plain base64 when stream compression is unavailable or misbehaves.
    }
  }
  return `${BASE64_PREFIX}.${encodeBase64Url(bytes)}`;
}

function buildModeUrl(baseUrl: URL, encoded: string, output: SharedDiagramOutput): string {
  const next = new URL(baseUrl.origin + baseUrl.pathname);
  next.searchParams.set(DIAGRAM_PARAM, encoded);
  if (output !== "editor") {
    next.searchParams.set(OUTPUT_PARAM, output);
  }
  return next.toString();
}

async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decode compressed diagram links.");
  }
  return transformBytes(bytes, new DecompressionStream("gzip"));
}

async function transformBytes(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const readPromise = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  const normalized = new Uint8Array(bytes.byteLength);
  normalized.set(bytes);
  try {
    await writer.write(normalized);
    await writer.close();
  } finally {
    writer.releaseLock();
  }
  return new Uint8Array(await readPromise);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(payload: string): Uint8Array {
  const padded = payload.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - payload.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
