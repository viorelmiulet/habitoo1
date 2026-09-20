/**
 * Clientul Replicate — server-only.
 *
 * Cheile se citesc din mediul serverului în interiorul apelurilor și nu ajung
 * niciodată în browser. Apelurile trec prin gateway-ul Lovable, nu direct spre
 * api.replicate.com.
 *
 * Endpointuri folosite:
 *  - POST /v1/models/{owner}/{name}/predictions — pornește generarea
 *  - GET  /v1/predictions/{id}                  — starea generării
 */

const REPLICATE_BASE = "https://connector-gateway.lovable.dev/replicate/v1";

export const REPLICATE_KEY_MISSING =
  "Conexiunea Replicate nu este configurată. Leagă contul Replicate din setările de conectori.";

export const REPLICATE_NO_CREDIT =
  "Contul Replicate nu are credit disponibil. Activează plata în contul Replicate și încearcă din nou.";

export type AiMediaKind = "photo_enhance" | "photo_video" | "marketing_image";

export type ReplicateModel = {
  /** Identificatorul modelului oficial Replicate. */
  id: string;
  buildInput: (input: { prompt: string; sourceUrl: string | null }) => Record<string, unknown>;
  /** Extensia și tipul fișierului rezultat. */
  extension: string;
  contentType: string;
};

/** Modelele folosite pentru fiecare tip de generare. */
export const AI_MEDIA_MODELS: Record<AiMediaKind, ReplicateModel> = {
  photo_enhance: {
    id: "black-forest-labs/flux-kontext-pro",
    extension: "png",
    contentType: "image/png",
    buildInput: ({ prompt, sourceUrl }) => ({
      prompt:
        prompt.trim() === ""
          ? "Improve this real estate photo: natural daylight, balanced exposure, clean colours, straight vertical lines. Keep the room exactly as it is; do not add or remove objects."
          : prompt.trim(),
      input_image: sourceUrl,
      // Modelul acceptă doar "jpg" sau "png"; png păstrează detaliile.
      output_format: "png",
      safety_tolerance: 2,
    }),
  },
  photo_video: {
    id: "wan-video/wan-2.2-i2v-fast",
    extension: "mp4",
    contentType: "video/mp4",
    buildInput: ({ prompt, sourceUrl }) => ({
      image: sourceUrl,
      prompt:
        prompt.trim() === ""
          ? "Slow cinematic camera move through the room, steady, realistic lighting."
          : prompt.trim(),
    }),
  },
  marketing_image: {
    id: "black-forest-labs/flux-1.1-pro",
    extension: "png",
    contentType: "image/png",
    buildInput: ({ prompt }) => ({
      prompt: prompt.trim(),
      aspect_ratio: "1:1",
      output_format: "png",
      safety_tolerance: 2,
    }),
  },
};

export function replicateConfigured(): boolean {
  return Boolean(
    process.env["REPLICATE_API_KEY"]?.trim() && process.env["LOVABLE_API_KEY"]?.trim(),
  );
}

function credentials(): { connectionKey: string; lovableKey: string } {
  const connectionKey = process.env["REPLICATE_API_KEY"]?.trim();
  const lovableKey = process.env["LOVABLE_API_KEY"]?.trim();
  if (!connectionKey || !lovableKey) throw new Error(REPLICATE_KEY_MISSING);
  return { connectionKey, lovableKey };
}

async function replicateFetch(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
): Promise<Record<string, unknown>> {
  const { connectionKey, lovableKey } = credentials();
  const response = await fetch(`${REPLICATE_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
      Accept: "application/json",
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  // Lipsa creditului este o problemă de cont, nu o eroare de aplicație.
  if (response.status === 402) throw new Error(REPLICATE_NO_CREDIT);
  if (!response.ok) {
    throw new Error(`Replicate a răspuns ${response.status}: ${text.slice(0, 400)}`);
  }
  return text === "" ? {} : (JSON.parse(text) as Record<string, unknown>);
}

export type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  outputUrl: string | null;
  error: string | null;
};

function firstOutputUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const found = output.find((item) => typeof item === "string");
    return typeof found === "string" ? found : null;
  }
  if (output && typeof output === "object") {
    const url = (output as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return null;
}

function toPrediction(payload: Record<string, unknown>): ReplicatePrediction {
  const status = String(payload["status"] ?? "starting") as ReplicatePrediction["status"];
  const error = payload["error"];
  return {
    id: String(payload["id"] ?? ""),
    status,
    outputUrl: firstOutputUrl(payload["output"]),
    error: typeof error === "string" && error !== "" ? error : null,
  };
}

/** Pornește o generare pentru tipul cerut. */
export async function startAiMediaPrediction(input: {
  kind: AiMediaKind;
  prompt: string;
  sourceUrl: string | null;
}): Promise<{ prediction: ReplicatePrediction; model: string }> {
  const model = AI_MEDIA_MODELS[input.kind];
  const payload = await replicateFetch(`/models/${model.id}/predictions`, {
    method: "POST",
    body: { input: model.buildInput({ prompt: input.prompt, sourceUrl: input.sourceUrl }) },
  });
  return { prediction: toPrediction(payload), model: model.id };
}

export async function readAiMediaPrediction(id: string): Promise<ReplicatePrediction> {
  return toPrediction(await replicateFetch(`/predictions/${encodeURIComponent(id)}`));
}
