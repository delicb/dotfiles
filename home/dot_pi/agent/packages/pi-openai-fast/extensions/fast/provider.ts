import {
  type ApiStreamOptions,
  type AssistantMessageEventStream,
  calculateCost,
  lazyStream,
  type Model,
  type Provider,
  type ProviderStreamOptions,
  type StreamOptions,
} from "@earendil-works/pi-ai";
import {
  type ModelRef,
  modelKey,
  pricingMultiplier,
  reportedTier,
  type TierReport,
} from "../../src/tier";

export function wrapProvider(
  provider: Provider,
  getMultiplier: (model: ModelRef) => number | undefined,
  onReport: (report: TierReport) => void,
): Provider {
  return {
    ...provider,
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    headers: provider.headers,
    auth: provider.auth,
    getModels: provider.getModels.bind(provider),
    getAllModels: provider.getAllModels?.bind(provider),
    refreshModels: provider.refreshModels?.bind(provider),
    filterModels: provider.filterModels?.bind(provider),
    filterAllModels: provider.filterAllModels?.bind(provider),
    fetchDeferred: provider.fetchDeferred?.bind(provider),
    cancelDeferred: provider.cancelDeferred?.bind(provider),
    generateImages: provider.generateImages?.bind(provider),
    classify: provider.classify?.bind(provider),
    stream(model, context, options) {
      const multiplier = getMultiplier(model);
      if (multiplier === undefined)
        return provider.stream(model, context, options);
      return fastStream(model, options, multiplier, onReport, (next) =>
        provider.stream(
          model,
          context,
          next as ApiStreamOptions<typeof model.api>,
        ),
      );
    },
    streamSimple(model, context, options) {
      const multiplier = getMultiplier(model);
      if (multiplier === undefined)
        return provider.streamSimple(model, context, options);
      return fastStream(model, options, multiplier, onReport, (next) =>
        provider.streamSimple(model, context, next),
      );
    },
  };
}

function fastStream(
  model: Model<string>,
  options: StreamOptions | undefined,
  multiplier: number,
  onReport: (report: TierReport) => void,
  delegate: (options: ProviderStreamOptions) => AssistantMessageEventStream,
): AssistantMessageEventStream {
  let tier: TierReport["reportedTier"];
  const next: ProviderStreamOptions = {
    ...options,
    serviceTier: "priority",
    onPayload: async (payload, requestModel) => {
      const replacement = await options?.onPayload?.(payload, requestModel);
      const body = replacement === undefined ? payload : replacement;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("OpenAI Fast mode requires an object request payload.");
      }
      return { ...body, service_tier: "priority" };
    },
    onProviderStreamEvent: async (data, requestModel) => {
      await options?.onProviderStreamEvent?.(data, requestModel);
      tier = reportedTier(data) ?? tier;
    },
  };
  return lazyStream(model, async () => {
    const source = delegate(next);
    return (async function* () {
      for await (const event of source) {
        if (event.type === "done" || event.type === "error") {
          const message = event.type === "done" ? event.message : event.error;
          const factor = pricingMultiplier(model.api, tier, multiplier);
          // Recalculate from catalog rates so built-in tier pricing is not applied twice.
          const cost = calculateCost(model, message.usage);
          cost.input *= factor;
          cost.output *= factor;
          cost.cacheRead *= factor;
          cost.cacheWrite *= factor;
          cost.total =
            cost.input + cost.output + cost.cacheRead + cost.cacheWrite;
          onReport({
            modelKey: modelKey(model),
            reportedTier: tier,
            multiplier: factor,
          });
        }
        yield event;
      }
    })();
  });
}
