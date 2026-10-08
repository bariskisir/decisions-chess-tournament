// Fetches OpenRouter decision models with a five-minute localStorage cache.
import { CATALOG_CACHE_KEY, CATALOG_CACHE_TTL_MS, EXCLUDED_MODELS, OPENROUTER_CATALOG_URL } from "../config/constants.js";
import type { ModelInfo } from "../domain/types.js";
import type { CatalogResult, ICatalogService } from "./interfaces.js";

interface CatalogEndpoint {
  pricing?: { prompt?: string; completion?: string };
  is_free?: boolean;
}

interface CatalogEntry {
  slug?: string;
  id?: string;
  name?: string;
  short_name?: string;
  description?: string;
  context_length?: number;
  created_at?: string;
  updated_at?: string;
  permaslug?: string;
  model_variant_permaslug?: string;
  output_modalities?: string[];
  endpoint?: CatalogEndpoint;
  pricing?: { prompt?: string; completion?: string };
}

/** Loads decision-capable models while keeping catalog reads cheap and fresh. */
export class OpenRouterCatalogService implements ICatalogService {
  /** Returns cached models when they are younger than five minutes. */
  loadCached(): CatalogResult | null {
    try {
      const raw = localStorage.getItem(CATALOG_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { fetchedAt: number; models: ModelInfo[] };
      if (Date.now() - parsed.fetchedAt > CATALOG_CACHE_TTL_MS) return null;
      const models = this.dedupe(parsed.models.map((model) => this.normalize(model)));
      return { models, fromCache: true, fetchedAt: parsed.fetchedAt };
    } catch {
      return null;
    }
  }

  /** Fetches decision models, falling back to a fresh cache when possible. */
  async load(forceRefresh = false): Promise<CatalogResult> {
    if (!forceRefresh) {
      const cached = this.loadCached();
      if (cached) return cached;
    }
    const response = await fetch(OPENROUTER_CATALOG_URL);
    if (!response.ok) {
      const cached = this.loadCached();
      if (cached) return cached;
      throw new Error(`Model catalog request failed (${response.status}).`);
    }
    const payload = (await response.json()) as { data?: CatalogEntry[] };
    const models = this.dedupe(
      (payload.data ?? [])
        .filter((entry) => (entry.output_modalities ?? []).includes("decisions"))
        .map((entry) => this.toModelInfo(entry))
        .filter((model): model is ModelInfo => model !== null)
        .sort((left, right) => left.name.localeCompare(right.name)),
    );
    const result: CatalogResult = { models, fromCache: false, fetchedAt: Date.now() };
    try {
      localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(result));
    } catch {
      // Storage quota failures must not break the catalog load.
    }
    return result;
  }

  /** Removes the cached catalog so the next load hits the network. */
  clearCache(): void {
    try {
      localStorage.removeItem(CATALOG_CACHE_KEY);
    } catch {
      // Ignored: cache clearing is best effort.
    }
  }

  /** Normalizes one catalog entry into the benchmark model shape. */
  private toModelInfo(entry: CatalogEntry): ModelInfo | null {
    const id = entry.slug ?? entry.id;
    if (!id) return null;
    const pricing = entry.endpoint?.pricing ?? entry.pricing ?? {};
    const fallbackId = entry.permaslug ?? entry.model_variant_permaslug ?? null;
    return {
      id,
      name: entry.name ?? id,
      shortName: entry.short_name ?? entry.name ?? id,
      description: entry.description ?? "",
      contextLength: entry.context_length ?? 0,
      pricing: {
        prompt: Number(pricing.prompt ?? 0) || 0,
        completion: Number(pricing.completion ?? 0) || 0,
      },
      isFree: entry.endpoint?.is_free ?? false,
      publishedAt: Date.parse(entry.created_at ?? entry.updated_at ?? "") || 0,
      fallbackId: fallbackId && fallbackId !== id ? fallbackId : null,
    };
  }

  /** Drops duplicate slugs so React keys and pairings stay unique. */
  private dedupe(models: ModelInfo[]): ModelInfo[] {
    const seen = new Set<string>();
    const excluded = new Set<string>(EXCLUDED_MODELS);
    return models.filter((model) => {
      if (excluded.has(model.id) || model.id.toLowerCase().includes("latest") || seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });
  }

  /** Fills fields missing from older cached entries. */
  private normalize(model: ModelInfo): ModelInfo {
    return {
      ...model,
      publishedAt: model.publishedAt ?? 0,
      fallbackId: model.fallbackId ?? null,
    };
  }
}
