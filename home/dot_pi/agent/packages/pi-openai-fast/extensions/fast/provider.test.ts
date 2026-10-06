import { zstdDecompressSync } from "node:zlib";
import {
  type Api,
  type AssistantMessage,
  calculateCost,
  createAssistantMessageEventStream,
  createProvider,
  type Model,
  normalizeContext,
  type Provider,
  type StreamOptions,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults";
import { fastMultiplier, type TierReport } from "../../src/tier";
import { wrapProvider } from "./provider";

const model: Model<"openai-responses"> = {
  provider: "openai",
  api: "openai-responses",
  id: "gpt-6.1-sol",
  name: "Test model",
  baseUrl: "https://api.openai.com/v1",
  reasoning: true,
  thinkingLevelMap: { xhigh: "xhigh" },
  input: ["text"],
  contextWindow: 10000,
  maxTokens: 1000,
  cost: { input: 2, output: 10, cacheRead: 1, cacheWrite: 0 },
};
const context: TranscriptContext = normalizeContext({ messages: [] });

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("Network requests are disabled in tests.");
  });
});
afterEach(() => vi.unstubAllGlobals());

function message(selected: Model<Api>): AssistantMessage {
  return {
    role: "assistant",
    provider: selected.provider,
    api: selected.api,
    model: selected.id,
    content: [],
    usage: {
      input: 90,
      output: 50,
      cacheRead: 10,
      cacheWrite: 0,
      totalTokens: 150,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  };
}

function fixture(tier: string | undefined = "priority") {
  const stream = vi.fn(
    (
      selected: Model<Api>,
      _context: TranscriptContext,
      options?: StreamOptions,
    ) => {
      const output = createAssistantMessageEventStream();
      void (async () => {
        await options?.onPayload?.({ model: selected.id }, selected);
        await options?.onProviderStreamEvent?.(
          { type: "response.completed", response: { service_tier: tier } },
          selected,
        );
        const result = message(selected);
        calculateCost(selected, result.usage);
        result.usage.cost.total *= 2;
        if (options?.signal?.aborted) {
          result.stopReason = "aborted";
          result.errorMessage = "Request was aborted";
          output.push({ type: "error", reason: "aborted", error: result });
        } else {
          output.push({ type: "done", reason: "stop", message: result });
        }
        output.end();
      })();
      return output;
    },
  );
  const simple = vi.fn((...args: Parameters<typeof stream>) => stream(...args));
  const provider = createProvider({
    id: "openai",
    auth: { apiKey: { name: "Test", resolve: async () => undefined } },
    models: [model],
    api: { stream, streamSimple: simple },
  });
  return { provider, stream, simple };
}

describe("provider wrapper", () => {
  it("preserves provider metadata and delegates unchanged when disabled", async () => {
    const { provider, stream, simple } = fixture();
    const report = vi.fn();
    const wrapped = wrapProvider(provider, () => undefined, report);
    const options = { apiKey: "sk-test", reasoning: "high" as const };
    await wrapped.streamSimple(model, context, options).result();
    expect(wrapped.auth).toBe(provider.auth);
    expect(wrapped.getModels()).toEqual(provider.getModels());
    expect(simple).toHaveBeenCalledWith(model, context, options);
    expect(stream.mock.calls[0]?.[2]).toBe(options);
    expect(report).not.toHaveBeenCalled();
  });

  it("preserves prototype methods and their original receiver", () => {
    const { provider } = fixture();
    class PrototypeProvider implements Provider {
      readonly id = provider.id;
      readonly name = provider.name;
      readonly auth = provider.auth;
      #models = [model];
      stream = provider.stream;
      streamSimple = provider.streamSimple;
      getModels() {
        return this.#models;
      }
      getAllModels() {
        return this.#models;
      }
    }
    const original = new PrototypeProvider();
    const wrapped = wrapProvider(original, () => undefined, vi.fn());
    expect(wrapped.getModels()).toBe(original.getModels());
    expect(wrapped.getAllModels?.()).toBe(original.getAllModels());
  });

  it.each([
    "sse",
    "websocket",
    "websocket-cached",
    "auto",
  ] as const)("retains %s transport, reasoning, cancellation, and request hooks", async (transport) => {
    const { provider, stream, simple } = fixture();
    const report = vi.fn();
    const wrapped = wrapProvider(provider, () => 2, report);
    const signal = new AbortController().signal;
    const onPayload = vi.fn(() => ({
      model: model.id,
      custom: true,
      service_tier: "flex",
    }));
    const onProviderStreamEvent = vi.fn();
    const options = {
      apiKey: "sk-test",
      reasoning: "xhigh" as const,
      transport,
      signal,
      onPayload,
      onProviderStreamEvent,
      sessionId: "session",
    };
    const result = await wrapped.streamSimple(model, context, options).result();
    const sent = stream.mock.calls[0]?.[2];
    expect(simple).toHaveBeenCalledOnce();
    expect(sent).toMatchObject({
      serviceTier: "priority",
      reasoning: "xhigh",
      transport,
      signal,
      sessionId: "session",
    });
    expect(await sent?.onPayload?.({}, model)).toEqual({
      model: model.id,
      custom: true,
      service_tier: "priority",
    });
    expect(onProviderStreamEvent).toHaveBeenCalledOnce();
    expect(result.usage.cost.total).toBeCloseTo(0.00138);
    expect(report).toHaveBeenCalledWith({
      modelKey: "openai/gpt-6.1-sol",
      reportedTier: "priority",
      multiplier: 2,
    });
    expect(options).not.toHaveProperty("serviceTier");
  });

  it("preserves full stream options", async () => {
    const { provider, stream } = fixture();
    const wrapped = wrapProvider(provider, () => 2, vi.fn());
    await wrapped
      .stream(model, context, {
        apiKey: "sk-test",
        reasoningEffort: "high",
        reasoningSummary: "detailed",
        maxTokens: 123,
      })
      .result();
    expect(stream.mock.calls[0]?.[2]).toMatchObject({
      reasoningEffort: "high",
      reasoningSummary: "detailed",
      maxTokens: 123,
    });
  });

  it.each([
    ["openai-responses", "fast", 2],
    ["openai-responses", "default", 1],
    ["openai-responses", "unreported", 2],
    ["openai-codex-responses", "default", 2],
    ["openai-codex-responses", "fast", 2],
  ] as const)("estimates %s costs for a %s report without double pricing", async (api, tier, factor) => {
    const { provider } = fixture(tier);
    const selected = { ...model, api };
    const result = await wrapProvider(provider, () => 2, vi.fn())
      .streamSimple(selected, context)
      .result();
    expect(result.usage.cost.total).toBeCloseTo(0.00069 * factor);
  });

  it.each([
    ["openai", "openai-responses", "gpt-6-sol", 2],
    ["openai-codex", "openai-codex-responses", "gpt-6-sol", 2],
    ["openai", "openai-responses", "gpt-5.5", 2.5],
    ["openai-codex", "openai-codex-responses", "gpt-5.5", 2.5],
    ["openai", "openai-responses", "gpt-4.1", 1.75],
    ["openai", "openai-responses", "future-model", 2],
  ] as const)("requests priority and prices %s/%s/%s", async (providerId, api, id, factor) => {
    const { provider, stream } = fixture();
    const selected = { ...model, provider: providerId, api, id };
    const report = vi.fn();
    const wrapped = wrapProvider(
      provider,
      (request) => fastMultiplier(request, DEFAULT_CONFIG),
      report,
    );
    const result = await wrapped.streamSimple(selected, context).result();
    const options = stream.mock.calls[0]?.[2];
    expect(await options?.onPayload?.({ model: id }, selected)).toEqual({
      model: id,
      service_tier: "priority",
    });
    expect(result.usage.cost.total).toBeCloseTo(0.00069 * factor);
    expect(report).toHaveBeenCalledWith({
      modelKey: `${providerId}/${id}`,
      reportedTier: "priority",
      multiplier: factor,
    });
    expect(stream).toHaveBeenCalledOnce();
  });

  it("surfaces rejected tiers without an extension retry", async () => {
    const { provider } = fixture();
    const failed = vi.fn((selected: Model<Api>) => {
      const output = createAssistantMessageEventStream();
      const result = {
        ...message(selected),
        stopReason: "error" as const,
        errorMessage: "Fast mode is not available for this model.",
      };
      output.push({ type: "error", reason: "error", error: result });
      output.end();
      return output;
    });
    const selected = { ...model, id: "future-model" };
    const wrapped = wrapProvider(
      { ...provider, streamSimple: failed },
      (request) => fastMultiplier(request, DEFAULT_CONFIG),
      vi.fn(),
    );
    const result = await wrapped.streamSimple(selected, context).result();
    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toBe(
      "Fast mode is not available for this model.",
    );
    expect(failed).toHaveBeenCalledOnce();
  });

  it("keeps the request's multiplier after the session toggle changes", async () => {
    const { provider } = fixture();
    let enabled = true;
    const wrapped = wrapProvider(
      provider,
      () => (enabled ? 2 : undefined),
      vi.fn(),
    );
    const result = wrapped.streamSimple(model, context);
    enabled = false;
    expect((await result.result()).usage.cost.total).toBeCloseTo(0.00138);
  });

  it("preserves aborted results", async () => {
    const { provider } = fixture();
    const controller = new AbortController();
    controller.abort();
    const result = await wrapProvider(provider, () => 2, vi.fn())
      .streamSimple(model, context, { signal: controller.signal })
      .result();
    expect(result.stopReason).toBe("aborted");
    expect(result.errorMessage).toBe("Request was aborted");
  });
});

const terminal = {
  type: "response.completed",
  response: {
    id: "response-test",
    status: "completed",
    service_tier: "fast",
    output: [],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      input_tokens_details: { cached_tokens: 10 },
    },
  },
};

function localResponse(): Response {
  return new Response(
    `event: response.completed\ndata: ${JSON.stringify(terminal)}\n\n`,
    {
      headers: { "content-type": "text/event-stream" },
    },
  );
}

describe("built-in adapter integration", () => {
  it("uses the OpenAI Responses adapter with a local fetch implementation", async () => {
    const fetch = vi.fn(async () => localResponse());
    const reports: TierReport[] = [];
    const selected = { ...model, samplingParams: { service_tier: "flex" } };
    const result = await wrapProvider(
      openaiProvider(),
      () => 2,
      (report) => reports.push(report),
    )
      .streamSimple(selected, context, {
        apiKey: "sk-test",
        fetch,
        reasoning: "xhigh",
      })
      .result();
    expect(result.stopReason).toBe("stop");
    expect(result.usage.cost.total).toBeCloseTo(0.00138);
    const body = JSON.parse(
      String(
        (fetch.mock.calls[0] as unknown as [unknown, RequestInit])[1].body,
      ),
    );
    expect(body.service_tier).toBe("priority");
    expect(body.reasoning.effort).toBe("xhigh");
    expect(reports[0]?.reportedTier).toBe("fast");
  });

  it("retains the built-in reasoning and output limit conversion", async () => {
    const fetch = vi.fn(async () => localResponse());
    const selected = {
      ...model,
      maxTokens: 20000,
      thinkingLevelMap: { xhigh: null },
    };
    await wrapProvider(openaiProvider(), () => 2, vi.fn())
      .streamSimple(selected, context, {
        apiKey: "sk-test",
        fetch,
        reasoning: "xhigh",
      })
      .result();
    const body = JSON.parse(
      String(
        (fetch.mock.calls[0] as unknown as [unknown, RequestInit])[1].body,
      ),
    );
    expect(body.reasoning.effort).toBe("high");
    expect(body.max_output_tokens).toBe(5904);
  });

  it("uses the Codex SSE adapter with a local fetch implementation", async () => {
    const fetch = vi.fn(async () => localResponse());
    const token = `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "test-account" } })).toString("base64url")}.signature`;
    const selected = {
      ...model,
      provider: "openai-codex",
      api: "openai-codex-responses" as const,
      baseUrl: "https://chatgpt.com/backend-api",
    };
    const onPayload = vi.fn();
    const result = await wrapProvider(openaiCodexProvider(), () => 2, vi.fn())
      .streamSimple(selected, context, {
        apiKey: token,
        fetch,
        transport: "sse",
        reasoning: "xhigh",
        onPayload,
      })
      .result();
    expect(result.stopReason).toBe("stop");
    expect(result.usage.cost.total).toBeCloseTo(0.00138);
    expect(onPayload.mock.calls[0]?.[0]).toMatchObject({
      reasoning: { effort: "xhigh" },
    });
    const body = (fetch.mock.calls[0] as unknown as [unknown, RequestInit])[1]
      .body;
    const serialized =
      typeof body === "string"
        ? body
        : zstdDecompressSync(body as Uint8Array).toString();
    expect(JSON.parse(serialized).service_tier).toBe("priority");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
