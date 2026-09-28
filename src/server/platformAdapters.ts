import {
  type NormalizedProductAttributes,
  normalizeProductAttributes,
  evaluateProductMatch,
} from '../shared/normalization.ts';

export type PlatformDataStatus = 'live' | 'demo' | 'unavailable' | 'error' | 'stale';
export type ObservationSource = 'extension' | 'simulator';

export function normalizePlatformName(
  raw: unknown
): 'Blinkit' | 'Zepto' | 'Flipkart Minutes' | 'Amazon Minutes' | null {
  if (typeof raw !== 'string') return null;
  const lower = raw.trim().toLowerCase();
  if (lower === 'blinkit') return 'Blinkit';
  if (lower === 'zepto' || lower === 'zeptonow') return 'Zepto';
  if (lower === 'flipkart minutes' || lower === 'flipkart') return 'Flipkart Minutes';
  if (lower === 'amazon minutes' || lower === 'amazon') return 'Amazon Minutes';
  return null;
}

export interface ExtensionCapturedProduct {
  platform: 'Blinkit' | 'Zepto' | 'Flipkart Minutes' | 'Amazon Minutes';
  productName: string;
  product_name: string;
  brand: string | null;
  variant: string | null;
  quantity: string | null;
  price: number;
  mrp: number | null;
  deliveryEta: string | null;
  delivery_time?: string | null;
  offer?: string | null;
  discount?: string | null;
  availability: string | null;
  stock?: 'available' | 'out_of_stock' | 'limited' | 'unknown';
  productUrl: string;
  product_url: string;
  location: string;
  source: ObservationSource;
  capturedAt: string;
  retrieved_at: string;
  normalized_attributes: NormalizedProductAttributes;
}

export interface ExtensionDiagnosticEntry {
  id: string;
  detectedPlatform: string | null;
  currentUrl: string;
  adapterSelected:
    | 'blinkitAdapter'
    | 'zeptoAdapter'
    | 'flipkartMinutesAdapter'
    | 'amazonMinutesAdapter'
    | 'blinkitAdapter (Standby)'
    | 'zeptoAdapter (Standby)'
    | 'flipkartMinutesAdapter (Standby)'
    | 'amazonMinutesAdapter (Standby)'
    | 'none';
  extractionStatus:
    | 'success'
    | 'running'
    | 'ready'
    | 'awaiting_page_capture'
    | 'partial'
    | 'unavailable'
    | 'blocked'
    | 'unsupported_page'
    | 'error';
  fieldsExtracted: string[];
  timestamp: string;
  errorMessage: string | null;
}

export interface PriceHistoryPoint {
  platform: 'Blinkit' | 'Zepto' | 'Flipkart Minutes' | 'Amazon Minutes';
  product_name: string;
  price: number;
  location: string;
  retrieved_at: string;
}

// Live observations captured by the QuickHatke Chrome Extension content script
const extensionObservations: ExtensionCapturedProduct[] = [];
const extensionDiagnosticsLog: ExtensionDiagnosticEntry[] = [];
const priceHistoryStore: PriceHistoryPoint[] = [];

const FRESH_OBSERVATION_TTL_MS = 15 * 60 * 1000; // 15 minutes before marking stale

export function recordExtensionDiagnostics(input: Omit<ExtensionDiagnosticEntry, 'id'>): ExtensionDiagnosticEntry {
  const entry: ExtensionDiagnosticEntry = {
    id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...input,
  };
  extensionDiagnosticsLog.unshift(entry);
  if (extensionDiagnosticsLog.length > 30) {
    extensionDiagnosticsLog.length = 30;
  }
  return entry;
}

export function getExtensionDiagnostics(): ExtensionDiagnosticEntry[] {
  return [...extensionDiagnosticsLog];
}

export function recordExtensionObservation(input: {
  platform: 'Blinkit' | 'Zepto' | 'Flipkart Minutes' | 'Amazon Minutes';
  product_name: string;
  brand?: string | null;
  variant?: string | null;
  quantity?: string | null;
  price: number;
  mrp?: number | null;
  delivery_time?: string | null;
  offer?: string | null;
  discount?: string | null;
  availability?: string | null;
  stock?: 'available' | 'out_of_stock' | 'limited' | 'unknown';
  product_url: string;
  source?: ObservationSource;
  capturedAt?: string;
  location?: string;
}): ExtensionCapturedProduct {
  const nowIso = input.capturedAt || new Date().toISOString();
  const cleanTitle = input.product_name.trim();
  const cleanUrl = input.product_url.trim();
  const titleWithMissingQuantity =
    input.quantity && !cleanTitle.toLowerCase().includes(input.quantity.toLowerCase())
      ? `${cleanTitle} ${input.quantity}`
      : cleanTitle;
  const normalizedAttrs = normalizeProductAttributes(titleWithMissingQuantity);
  const loc = (input.location || 'Bengaluru').trim();
  const resolvedSource: ObservationSource =
    input.source === 'simulator' ? 'simulator' : 'extension';

  const entry: ExtensionCapturedProduct = {
    platform: input.platform,
    productName: cleanTitle,
    product_name: cleanTitle,
    brand: input.brand ?? normalizedAttrs.brand,
    variant: input.variant ?? normalizedAttrs.variant,
    quantity: input.quantity ?? normalizedAttrs.quantity,
    price: Number(input.price),
    mrp: typeof input.mrp === 'number' && input.mrp > 0 ? input.mrp : null,
    deliveryEta: input.delivery_time || null,
    delivery_time: input.delivery_time || null,
    offer: input.offer || null,
    discount: input.discount || null,
    availability:
      input.availability ||
      (input.stock === 'out_of_stock' ? 'Out of stock' : 'In stock'),
    stock: input.stock || 'available',
    productUrl: cleanUrl,
    product_url: cleanUrl,
    location: loc,
    source: resolvedSource,
    capturedAt: nowIso,
    retrieved_at: nowIso,
    normalized_attributes: normalizedAttrs,
  };

  // Remove older observation for the exact same platform + source + equivalent product
  for (let i = extensionObservations.length - 1; i >= 0; i--) {
    const existing = extensionObservations[i];
    if (
      existing.platform === entry.platform &&
      existing.source === entry.source
    ) {
      const matchEval = evaluateProductMatch(
        existing.normalized_attributes,
        entry.normalized_attributes
      );
      if (matchEval.is_equivalent) {
        extensionObservations.splice(i, 1);
      }
    }
  }

  extensionObservations.unshift(entry);
  priceHistoryStore.unshift({
    platform: entry.platform,
    product_name: entry.product_name,
    price: entry.price,
    location: entry.location,
    retrieved_at: nowIso,
  });

  return entry;
}

export function getExtensionObservations(): ExtensionCapturedProduct[] {
  return [...extensionObservations];
}

export function getPriceHistoryForProduct(
  targetAttributes: NormalizedProductAttributes
): PriceHistoryPoint[] {
  return priceHistoryStore.filter((pt) => {
    const ptAttrs = normalizeProductAttributes(pt.product_name);
    return evaluateProductMatch(targetAttributes, ptAttrs).is_equivalent;
  });
}

export function clearExtensionObservations(): void {
  extensionObservations.length = 0;
  extensionDiagnosticsLog.length = 0;
}

export interface NormalizedPlatformResult {
  platform: 'Blinkit' | 'Zepto' | 'Flipkart Minutes' | 'Amazon Minutes';
  name: string;
  product_name: string;
  brand: string | null;
  category: string;
  variant: string | null;
  size: string | null;
  quantity: string | null;
  pages: number | null;
  weight: string | null;
  volume: string | null;
  pack_count: number;
  price: number | null;
  formatted_price: string | null;
  discount: string | null;
  offer: string | null;
  offer_adjusted_price: number | null;
  delivery_time: string | null;
  delivery_minutes: number | null;
  delivery_fee: number | null;
  estimated_total_payable: number | null;
  currency: 'INR';
  stock: 'available' | 'out_of_stock' | 'limited' | 'unknown';
  product_url: string | null;
  search_url: string;
  order_action: string;
  location: string;
  data_status: PlatformDataStatus;
  source?: ObservationSource | null;
  status_reason: string;
  retrieved_at: string;
  match_confidence: number | null;
}

export interface IPlatformAdapter {
  readonly platformName: 'Blinkit' | 'Zepto' | 'Flipkart Minutes' | 'Amazon Minutes';
  searchProducts(
    query: string,
    location: string,
    targetAttributes: NormalizedProductAttributes,
    allowSimulator?: boolean
  ): Promise<NormalizedPlatformResult>;
}

export function buildLegitimateSearchUrl(
  platform: 'Blinkit' | 'Zepto' | 'Flipkart Minutes' | 'Amazon Minutes',
  query: string
): string {
  const encoded = encodeURIComponent(query.trim());
  switch (platform) {
    case 'Blinkit':
      return `https://blinkit.com/s/?q=${encoded}`;
    case 'Zepto':
      return `https://www.zeptonow.com/search?query=${encoded}`;
    case 'Flipkart Minutes':
      return `https://www.flipkart.com/search?q=${encoded}`;
    case 'Amazon Minutes':
      return `https://www.amazon.in/s?k=${encoded}`;
  }
}

abstract class BasePlatformAdapter implements IPlatformAdapter {
  abstract readonly platformName: 'Blinkit' | 'Zepto' | 'Flipkart Minutes' | 'Amazon Minutes';
  protected abstract getFeedConfig(): { endpoint?: string; apiKey?: string };

  async searchProducts(
    query: string,
    location: string,
    targetAttributes: NormalizedProductAttributes,
    allowSimulator: boolean = false
  ): Promise<NormalizedPlatformResult> {
    const nowIso = new Date().toISOString();
    const searchUrl = buildLegitimateSearchUrl(this.platformName, query);

    // 1. Check if the Unified Ingestion Store has a matched observation for this product & platform.
    // Production Mode (allowSimulator === false) strictly rejects records with source === 'simulator'.
    let bestExtensionMatch: ExtensionCapturedProduct | null = null;
    let bestExtensionConfidence = 0;

    for (const obs of extensionObservations) {
      if (obs.platform !== this.platformName) continue;
      if (!allowSimulator && obs.source === 'simulator') continue;

      const exactTitleMatch =
        obs.product_name.trim().toLowerCase() === query.trim().toLowerCase() ||
        obs.product_name.trim().toLowerCase() === targetAttributes.product_name.trim().toLowerCase();

      if (exactTitleMatch) {
        bestExtensionConfidence = 0.99;
        bestExtensionMatch = obs;
        break;
      }

      const evaluation = evaluateProductMatch(targetAttributes, obs.normalized_attributes);
      if (evaluation.is_equivalent && evaluation.match_confidence > bestExtensionConfidence) {
        bestExtensionConfidence = evaluation.match_confidence;
        bestExtensionMatch = obs;
      }
    }

    if (bestExtensionMatch) {
      const ageMs = Date.now() - new Date(bestExtensionMatch.retrieved_at).getTime();
      const isFresh = ageMs <= FRESH_OBSERVATION_TTL_MS;
      const deliveryMinsMatch = bestExtensionMatch.delivery_time?.match(/(\d+)/);
      const deliveryMinutes = deliveryMinsMatch ? parseInt(deliveryMinsMatch[1], 10) : null;
      const attrs = bestExtensionMatch.normalized_attributes;
      const isSim = bestExtensionMatch.source === 'simulator';

      return {
        platform: this.platformName,
        name: this.platformName,
        product_name: bestExtensionMatch.product_name,
        brand: attrs.brand,
        category: attrs.category,
        variant: attrs.variant,
        size: attrs.size,
        quantity: attrs.quantity,
        pages: attrs.pages,
        weight: attrs.weight,
        volume: attrs.volume,
        pack_count: attrs.pack_count,
        price: bestExtensionMatch.price,
        formatted_price: `₹${bestExtensionMatch.price}`,
        discount: bestExtensionMatch.discount || null,
        offer: bestExtensionMatch.offer || null,
        offer_adjusted_price: bestExtensionMatch.price,
        delivery_time: bestExtensionMatch.delivery_time || null,
        delivery_minutes: deliveryMinutes,
        delivery_fee: null,
        estimated_total_payable: bestExtensionMatch.price,
        currency: 'INR',
        stock: bestExtensionMatch.stock || 'available',
        product_url: bestExtensionMatch.product_url,
        search_url: searchUrl,
        order_action: `View on ${this.platformName}`,
        location: bestExtensionMatch.location,
        data_status: isSim ? 'demo' : isFresh ? 'live' : 'stale',
        source: bestExtensionMatch.source,
        status_reason: isSim
          ? 'Ingested via unified pipeline with source: "simulator" (DEMO/DEBUG mode only).'
          : isFresh
          ? 'Captured from active shopping page via QuickHatke Browser Extension.'
          : 'Cached observation from QuickHatke Browser Extension (>15m old).',
        retrieved_at: bestExtensionMatch.retrieved_at,
        match_confidence: bestExtensionConfidence,
      };
    }

    // 2. Check if an authorized partner/affiliate feed endpoint is configured
    const { endpoint, apiKey } = this.getFeedConfig();
    if (!endpoint || endpoint.trim() === '') {
      return {
        platform: this.platformName,
        name: this.platformName,
        product_name: targetAttributes.product_name,
        brand: targetAttributes.brand,
        category: targetAttributes.category,
        variant: targetAttributes.variant,
        size: targetAttributes.size,
        quantity: targetAttributes.quantity,
        pages: targetAttributes.pages,
        weight: targetAttributes.weight,
        volume: targetAttributes.volume,
        pack_count: targetAttributes.pack_count,
        price: null,
        formatted_price: null,
        discount: null,
        offer: null,
        offer_adjusted_price: null,
        delivery_time: null,
        delivery_minutes: null,
        delivery_fee: null,
        estimated_total_payable: null,
        currency: 'INR',
        stock: 'unknown',
        product_url: null,
        search_url: searchUrl,
        order_action: `View on ${this.platformName}`,
        location,
        data_status: 'unavailable',
        source: null,
        status_reason: `Live data unavailable — Open ${this.platformName} with the QuickHatke Extension or connect an authorized feed.`,
        retrieved_at: nowIso,
        match_confidence: null,
      };
    }

    try {
      const url = new URL(endpoint);
      url.searchParams.set('q', query);
      url.searchParams.set('location', location);

      const headers: Record<string, string> = { Accept: 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Partner feed returned HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        items?: Array<{
          title?: string;
          price?: number;
          discount?: string;
          offer?: string;
          delivery_time?: string;
          delivery_fee?: number;
          stock?: string;
          product_url?: string;
        }>;
      };

      const items = Array.isArray(payload.items) ? payload.items : [];
      let bestItem: (typeof items)[number] | null = null;
      let bestConfidence = 0;
      let bestCandidateAttrs: NormalizedProductAttributes | null = null;

      for (const candidate of items) {
        if (!candidate.title) continue;
        const candidateAttrs = normalizeProductAttributes(candidate.title);
        const evaluation = evaluateProductMatch(targetAttributes, candidateAttrs);
        if (evaluation.is_equivalent && evaluation.match_confidence > bestConfidence) {
          bestConfidence = evaluation.match_confidence;
          bestItem = candidate;
          bestCandidateAttrs = candidateAttrs;
        }
      }

      if (!bestItem || !bestCandidateAttrs) {
        return {
          platform: this.platformName,
          name: this.platformName,
          product_name: targetAttributes.product_name,
          brand: targetAttributes.brand,
          category: targetAttributes.category,
          variant: targetAttributes.variant,
          size: targetAttributes.size,
          quantity: targetAttributes.quantity,
          pages: targetAttributes.pages,
          weight: targetAttributes.weight,
          volume: targetAttributes.volume,
          pack_count: targetAttributes.pack_count,
          price: null,
          formatted_price: null,
          discount: null,
          offer: null,
          offer_adjusted_price: null,
          delivery_time: null,
          delivery_minutes: null,
          delivery_fee: null,
          estimated_total_payable: null,
          currency: 'INR',
          stock: 'unknown',
          product_url: null,
          search_url: searchUrl,
          order_action: `View on ${this.platformName}`,
          location,
          data_status: 'unavailable',
          source: null,
          status_reason: 'No exact matching variant found in feed.',
          retrieved_at: nowIso,
          match_confidence: null,
        };
      }

      const rawPrice =
        typeof bestItem.price === 'number' && bestItem.price > 0 ? bestItem.price : null;
      const deliveryFee =
        typeof bestItem.delivery_fee === 'number' && bestItem.delivery_fee >= 0
          ? bestItem.delivery_fee
          : null;
      const totalPayable = rawPrice !== null ? rawPrice + (deliveryFee ?? 0) : null;
      const deliveryMinsMatch = bestItem.delivery_time?.match(/(\d+)/);
      const deliveryMinutes = deliveryMinsMatch ? parseInt(deliveryMinsMatch[1], 10) : null;

      const rawStock = (bestItem.stock || '').toLowerCase();
      const stockStatus: NormalizedPlatformResult['stock'] =
        rawStock === 'available' || rawStock === 'in_stock'
          ? 'available'
          : rawStock.includes('out')
          ? 'out_of_stock'
          : rawStock.includes('low') || rawStock.includes('limit')
          ? 'limited'
          : 'unknown';

      const verifiedProductUrl =
        typeof bestItem.product_url === 'string' && bestItem.product_url.startsWith('https://')
          ? bestItem.product_url
          : null;

      return {
        platform: this.platformName,
        name: this.platformName,
        product_name: bestCandidateAttrs.product_name,
        brand: bestCandidateAttrs.brand,
        category: bestCandidateAttrs.category,
        variant: bestCandidateAttrs.variant,
        size: bestCandidateAttrs.size,
        quantity: bestCandidateAttrs.quantity,
        pages: bestCandidateAttrs.pages,
        weight: bestCandidateAttrs.weight,
        volume: bestCandidateAttrs.volume,
        pack_count: bestCandidateAttrs.pack_count,
        price: rawPrice,
        formatted_price: rawPrice !== null ? `₹${rawPrice}` : null,
        discount: bestItem.discount || null,
        offer: bestItem.offer || null,
        offer_adjusted_price: rawPrice,
        delivery_time: bestItem.delivery_time || null,
        delivery_minutes: deliveryMinutes,
        delivery_fee: deliveryFee,
        estimated_total_payable: totalPayable,
        currency: 'INR',
        stock: stockStatus,
        product_url: verifiedProductUrl,
        search_url: searchUrl,
        order_action: `View on ${this.platformName}`,
        location,
        data_status: 'live',
        source: 'extension',
        status_reason: 'Retrieved from authorized partner feed.',
        retrieved_at: nowIso,
        match_confidence: bestConfidence,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Feed connection error';
      return {
        platform: this.platformName,
        name: this.platformName,
        product_name: targetAttributes.product_name,
        brand: targetAttributes.brand,
        category: targetAttributes.category,
        variant: targetAttributes.variant,
        size: targetAttributes.size,
        quantity: targetAttributes.quantity,
        pages: targetAttributes.pages,
        weight: targetAttributes.weight,
        volume: targetAttributes.volume,
        pack_count: targetAttributes.pack_count,
        price: null,
        formatted_price: null,
        discount: null,
        offer: null,
        offer_adjusted_price: null,
        delivery_time: null,
        delivery_minutes: null,
        delivery_fee: null,
        estimated_total_payable: null,
        currency: 'INR',
        stock: 'unknown',
        product_url: null,
        search_url: searchUrl,
        order_action: `View on ${this.platformName}`,
        location,
        data_status: 'error',
        source: null,
        status_reason: `Platform feed error: ${msg}`,
        retrieved_at: nowIso,
        match_confidence: null,
      };
    }
  }
}

export class BlinkitAdapter extends BasePlatformAdapter {
  readonly platformName = 'Blinkit' as const;
  protected getFeedConfig() {
    return {
      endpoint: process.env.BLINKIT_PARTNER_FEED_URL,
      apiKey: process.env.BLINKIT_PARTNER_API_KEY,
    };
  }
}

export class ZeptoAdapter extends BasePlatformAdapter {
  readonly platformName = 'Zepto' as const;
  protected getFeedConfig() {
    return {
      endpoint: process.env.ZEPTO_PARTNER_FEED_URL,
      apiKey: process.env.ZEPTO_PARTNER_API_KEY,
    };
  }
}

export class FlipkartMinutesAdapter extends BasePlatformAdapter {
  readonly platformName = 'Flipkart Minutes' as const;
  protected getFeedConfig() {
    return {
      endpoint: process.env.FLIPKART_AFFILIATE_API_URL,
      apiKey: process.env.FLIPKART_AFFILIATE_TOKEN,
    };
  }
}

export class AmazonMinutesAdapter extends BasePlatformAdapter {
  readonly platformName = 'Amazon Minutes' as const;
  protected getFeedConfig() {
    return {
      endpoint: process.env.AMAZON_PAAPI_ENDPOINT,
      apiKey: process.env.AMAZON_PAAPI_ACCESS_KEY,
    };
  }
}

export const PLATFORM_ADAPTERS: IPlatformAdapter[] = [
  new BlinkitAdapter(),
  new ZeptoAdapter(),
  new FlipkartMinutesAdapter(),
  new AmazonMinutesAdapter(),
];
