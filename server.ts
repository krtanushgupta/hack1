import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import {
  findCatalogMatchesForQuery,
  buildUnavailableLiveComparison,
  isValidSearchQuery,
  normalizeSearchQuery,
  formatDisplayQueryTitle,
  type ComparisonResult,
  type PlatformEntry,
  type ComparisonMetrics,
} from './src/types/comparison.ts';
import {
  normalizeProductAttributes,
  evaluateProductMatch,
} from './src/shared/normalization.ts';
import {
  PLATFORM_ADAPTERS,
  buildLegitimateSearchUrl,
  normalizePlatformName,
  recordExtensionObservation,
  getExtensionObservations,
  recordExtensionDiagnostics,
  getExtensionDiagnostics,
  getPriceHistoryForProduct,
  clearExtensionObservations,
} from './src/server/platformAdapters.ts';
import { MOCK_ADAPTERS } from './src/server/mockAdapters.ts';

dotenv.config();

const CACHE_TTL_MS = 3 * 60 * 1000;
const comparisonCache = new Map<
  string,
  { timestamp: number; result: ComparisonResult }
>();

function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.trim() === '') {
    return null;
  }
  try {
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch {
    return null;
  }
}

function computeComparisonMetrics(
  platforms: PlatformEntry[],
  allowDemoMetrics: boolean = false
): {
  metrics: ComparisonMetrics;
  best_price: string | null;
  fastest_delivery: string | null;
  best_overall: string | null;
} {
  const validWithPrice = platforms.filter(
    (p) =>
      (p.data_status === 'live' ||
        (allowDemoMetrics && (p.data_status === 'demo' || p.data_status === 'stale'))) &&
      typeof p.numeric_price === 'number' &&
      p.numeric_price > 0 &&
      p.stock.toLowerCase() !== 'out of stock'
  );

  let lowestPricePlatform: string | null = null;
  let lowestPrice: number | null = null;
  let highestPrice: number | null = null;
  let priceDifference: number | null = null;
  let percentageDifference: number | null = null;

  if (validWithPrice.length > 0) {
    const sortedByPrice = [...validWithPrice].sort(
      (a, b) => (a.numeric_price as number) - (b.numeric_price as number)
    );
    lowestPricePlatform = sortedByPrice[0].name;
    lowestPrice = sortedByPrice[0].numeric_price;
    highestPrice = sortedByPrice[sortedByPrice.length - 1].numeric_price;

    if (
      lowestPrice !== null &&
      highestPrice !== null &&
      validWithPrice.length > 1
    ) {
      priceDifference = Number((highestPrice - lowestPrice).toFixed(2));
      percentageDifference =
        lowestPrice > 0
          ? Number((((highestPrice - lowestPrice) / lowestPrice) * 100).toFixed(1))
          : 0;
    }
  }

  const validWithDelivery = platforms.filter(
    (p) =>
      (p.data_status === 'live' ||
        (allowDemoMetrics && (p.data_status === 'demo' || p.data_status === 'stale'))) &&
      typeof p.delivery_time === 'string' &&
      /\d+/.test(p.delivery_time)
  );

  let fastestPlatform: string | null = null;
  let fastestTime: string | null = null;

  if (validWithDelivery.length > 0) {
    const sortedBySpeed = [...validWithDelivery].sort((a, b) => {
      const aMin = parseInt(a.delivery_time?.match(/(\d+)/)?.[1] || '999', 10);
      const bMin = parseInt(b.delivery_time?.match(/(\d+)/)?.[1] || '999', 10);
      return aMin - bMin;
    });
    fastestPlatform = sortedBySpeed[0].name;
    fastestTime = sortedBySpeed[0].delivery_time;
  }

  const suffix = allowDemoMetrics ? ' · DEMO' : '';

  const activeCount = platforms.filter(
    (p) =>
      p.data_status === 'live' ||
      (allowDemoMetrics && p.data_status === 'demo' && p.source === 'simulator')
  ).length;

  return {
    metrics: {
      live_platforms_count: activeCount,
      lowest_price_platform: lowestPricePlatform,
      lowest_price: lowestPrice,
      highest_price: highestPrice,
      price_difference: priceDifference,
      percentage_difference: percentageDifference,
      fastest_delivery_platform: fastestPlatform,
      fastest_delivery_time: fastestTime,
    },
    best_price:
      lowestPricePlatform && lowestPrice !== null
        ? `${lowestPricePlatform} (₹${lowestPrice}${suffix})`
        : null,
    fastest_delivery:
      fastestPlatform && fastestTime
        ? `${fastestPlatform} (${fastestTime}${suffix})`
        : null,
    best_overall:
      lowestPricePlatform && lowestPrice !== null
        ? priceDifference && priceDifference > 0
          ? `₹${priceDifference} cheaper on ${lowestPricePlatform} (₹${lowestPrice}${suffix})`
          : `${lowestPricePlatform} (₹${lowestPrice}${suffix})`
        : null,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Allow Chrome Extension Popup & Content Scripts to communicate with Backend
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  /**
   * Chrome Extension Observation Ingest Endpoint (/api/extension/ingest)
   * Receives real product details extracted from the user's active Blinkit, Zepto,
   * Flipkart Minutes, or Amazon Minutes browser tab.
   */
  app.post('/api/extension/ingest', (req, res) => {
    try {
      const body = req.body || {};
      const platform = normalizePlatformName(body.platform);
      const resolvedProductName = body.productName || body.product_name;
      const resolvedPrice =
        body.price !== null && body.price !== undefined ? Number(body.price) : NaN;
      const resolvedMrp =
        body.mrp !== null && body.mrp !== undefined && Number(body.mrp) > 0
          ? Number(body.mrp)
          : null;
      const resolvedEta = body.deliveryEta ?? body.delivery_time ?? null;
      const resolvedAvailability = body.availability ?? body.stock ?? 'In stock';
      const resolvedUrl = body.productUrl || body.product_url || '';
      const resolvedCapturedAt = body.capturedAt || body.retrieved_at || new Date().toISOString();
      const resolvedSource: 'extension' | 'simulator' =
        body.source === 'simulator' ? 'simulator' : 'extension';
      const location = body.location || 'Bengaluru';

      const adapterNameMap: Record<string, 'blinkitAdapter' | 'zeptoAdapter' | 'flipkartMinutesAdapter' | 'amazonMinutesAdapter'> = {
        Blinkit: 'blinkitAdapter',
        Zepto: 'zeptoAdapter',
        'Flipkart Minutes': 'flipkartMinutesAdapter',
        'Amazon Minutes': 'amazonMinutesAdapter',
      };

      if (!platform || !resolvedProductName || Number.isNaN(resolvedPrice) || resolvedPrice <= 0) {
        recordExtensionDiagnostics({
          detectedPlatform: platform,
          currentUrl: String(resolvedUrl || 'unknown'),
          adapterSelected: (platform && adapterNameMap[platform]) || 'none',
          extractionStatus: 'unavailable',
          fieldsExtracted: [],
          timestamp: resolvedCapturedAt,
          errorMessage: 'Platform data unavailable or missing productName/price on page.',
        });
        res.status(400).json({ error: 'Invalid extension product observation payload.' });
        return;
      }

      const finalUrl =
        typeof resolvedUrl === 'string' && resolvedUrl.startsWith('http')
          ? resolvedUrl
          : buildLegitimateSearchUrl(platform, String(resolvedProductName));

      const isOutOfStock = /out of stock|unavailable|sold out/i.test(String(resolvedAvailability));

      const recorded = recordExtensionObservation({
        platform,
        product_name: String(resolvedProductName),
        brand: body.brand ? String(body.brand) : null,
        variant: body.variant ? String(body.variant) : null,
        quantity: body.quantity ? String(body.quantity) : null,
        price: resolvedPrice,
        mrp: resolvedMrp,
        delivery_time: resolvedEta ? String(resolvedEta) : null,
        offer: body.offer ? String(body.offer) : null,
        discount: body.discount ? String(body.discount) : null,
        availability: isOutOfStock ? 'Out of stock' : 'In stock',
        stock: isOutOfStock ? 'out_of_stock' : 'available',
        product_url: finalUrl,
        source: resolvedSource,
        capturedAt: String(resolvedCapturedAt),
        location: String(location),
      });

      const extractedFields: string[] = ['productName', 'price'];
      if (recorded.brand) extractedFields.push('brand');
      if (recorded.variant) extractedFields.push('variant');
      if (recorded.quantity) extractedFields.push('quantity');
      if (recorded.mrp) extractedFields.push('mrp');
      if (recorded.discount) extractedFields.push('discount');
      if (recorded.offer) extractedFields.push('offer');
      if (recorded.availability) extractedFields.push('availability');
      if (recorded.deliveryEta) extractedFields.push('deliveryEta');

      const diag = recordExtensionDiagnostics({
        detectedPlatform: platform,
        currentUrl: finalUrl,
        adapterSelected: adapterNameMap[platform] || 'none',
        extractionStatus: 'success',
        fieldsExtracted: body._diagnostics?.fieldsExtracted || extractedFields,
        timestamp: recorded.capturedAt,
        errorMessage: null,
      });

      comparisonCache.clear();
      res.status(200).json({
        ok: true,
        observation: recorded,
        diagnostics: diag,
        total_observations: getExtensionObservations().length,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to ingest observation.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/extension/diagnostics', (req, res) => {
    const body = req.body || {};
    const entry = recordExtensionDiagnostics({
      detectedPlatform: body.detectedPlatform || null,
      currentUrl: String(body.currentUrl || ''),
      adapterSelected: body.adapterSelected || 'none',
      extractionStatus: body.extractionStatus || 'unavailable',
      fieldsExtracted: Array.isArray(body.fieldsExtracted) ? body.fieldsExtracted : [],
      timestamp: body.timestamp || new Date().toISOString(),
      errorMessage: body.errorMessage || null,
    });
    res.status(200).json({ ok: true, diagnostics: entry });
  });

  app.get('/api/extension/diagnostics', (_req, res) => {
    res.status(200).json({
      diagnostics: getExtensionDiagnostics(),
      observations: getExtensionObservations(),
    });
  });

  app.get('/api/extension/observations', (req, res) => {
    const query = typeof req.query.product === 'string' ? req.query.product : '';
    const attrs = query ? normalizeProductAttributes(query) : null;
    res.status(200).json({
      observations: getExtensionObservations(),
      diagnostics: getExtensionDiagnostics(),
      price_history: attrs ? getPriceHistoryForProduct(attrs) : [],
    });
  });

  app.post('/api/extension/clear', (_req, res) => {
    clearExtensionObservations();
    comparisonCache.clear();
    res.status(200).json({ ok: true });
  });

  /**
   * Core Product Search & Comparison Endpoint (/api/compare)
   * Zero dependency on Gemini/LLM!
   */
  app.post('/api/compare', async (req, res) => {
    try {
      const rawQuery = typeof req.body?.query === 'string' ? req.body.query : '';
      const selectedProduct =
        typeof req.body?.selectedProduct === 'string'
          ? req.body.selectedProduct.trim()
          : '';
      const location =
        typeof req.body?.city === 'string' && req.body.city.trim()
          ? req.body.city.trim()
          : 'Bengaluru';
      const forceRefresh = Boolean(req.body?.forceRefresh);
      const isDemoMode = req.body?.mode === 'demo';

      if (!isValidSearchQuery(rawQuery) && !isValidSearchQuery(selectedProduct)) {
        const invalidState = buildUnavailableLiveComparison('Invalid Search', location, {
          normalizedQuery: '',
          isCategorySearch: false,
          matchingProducts: [],
          searchState: 'invalid_search',
          statusMessage:
            'Please enter a valid product name or category (e.g., "Classmate notebook A4", "notebook", "Amul Taaza Milk 1L", "Surf Excel 1kg", "headphones", "iPhone").',
        });
        res.status(200).json(invalidState);
        return;
      }

      const isInitialLoad = Boolean(req.body?.isInitialLoad);
      const eligibleObservations = getExtensionObservations().filter((obs) =>
        isDemoMode ? true : obs.source === 'extension'
      );

      // If this is the initial page load and the extension has already captured a real product, compare that product immediately
      const effectiveRawQuery =
        isInitialLoad && eligibleObservations.length > 0
          ? eligibleObservations[0].product_name
          : selectedProduct || rawQuery;

      const activeQuery = normalizeSearchQuery(effectiveRawQuery);
      const catalogLookup = findCatalogMatchesForQuery(activeQuery);

      // Check if any eligible observation matches the active query
      const matchingLiveObs = eligibleObservations.find(
        (obs) =>
          obs.product_name.trim().toLowerCase() === activeQuery.trim().toLowerCase() ||
          evaluateProductMatch(activeQuery, obs.normalized_attributes).is_equivalent
      );

      const targetProduct =
        selectedProduct ||
        (matchingLiveObs ? matchingLiveObs.product_name : null) ||
        catalogLookup.exactSelectedProduct ||
        (catalogLookup.matches.length > 0
          ? catalogLookup.matches[0].name
          : formatDisplayQueryTitle(activeQuery));

      const targetAttributes = normalizeProductAttributes(targetProduct);
      const nowIso = new Date().toISOString();

      // UNIFIED PIPELINE: Both Production Mode and DEMO/DEBUG Mode run the exact same PLATFORM_ADAPTERS pipeline.
      // Production Mode (isDemoMode === false) strictly rejects source === 'simulator'.
      // DEMO/DEBUG Mode (isDemoMode === true) accepts source === 'simulator' records.
      const cacheKey = `${targetProduct.toLowerCase()}::${location.toLowerCase()}::${isDemoMode ? 'demo' : 'prod'}`;
      if (!forceRefresh && comparisonCache.has(cacheKey)) {
        const cachedEntry = comparisonCache.get(cacheKey)!;
        if (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS) {
          res.status(200).json({
            ...cachedEntry.result,
            is_category_search: selectedProduct ? false : catalogLookup.isCategorySearch,
            matching_products: catalogLookup.matches,
            cached: true,
          });
          return;
        }
      }

      const adapterPromises = PLATFORM_ADAPTERS.map((adapter) =>
        adapter.searchProducts(targetProduct, location, targetAttributes, isDemoMode)
      );
      const settledResults = await Promise.allSettled(adapterPromises);

      const platformEntries: PlatformEntry[] = settledResults.map((settled, idx) => {
        const adapterName = PLATFORM_ADAPTERS[idx].platformName;
        if (settled.status === 'fulfilled') {
          const r = settled.value;
          const stockLabel =
            r.stock === 'available'
              ? 'Available'
              : r.stock === 'out_of_stock'
              ? 'Out of stock'
              : r.stock === 'limited'
              ? 'Limited availability'
              : 'Stock status unavailable';

          return {
            platform: r.platform,
            name: r.name,
            product_name: r.product_name,
            brand: r.brand,
            category: r.category,
            variant: r.variant,
            size: r.size,
            quantity: r.quantity,
            pages: r.pages,
            weight: r.weight,
            volume: r.volume,
            pack_count: r.pack_count,
            price: r.formatted_price,
            numeric_price: r.price,
            discount: r.discount,
            offer: r.offer,
            offer_adjusted_price: r.offer_adjusted_price,
            delivery_time: r.delivery_time,
            delivery_fee: r.delivery_fee,
            estimated_total_payable: r.estimated_total_payable,
            stock: stockLabel,
            product_url: r.product_url,
            search_url: r.search_url,
            order_action: r.order_action,
            location: r.location,
            data_status: r.data_status,
            source: r.source,
            status_reason: r.status_reason,
            retrieved_at: r.retrieved_at,
            match_confidence: r.match_confidence,
          };
        }

        const fallbackSearchUrl = buildLegitimateSearchUrl(adapterName, targetProduct);
        return {
          platform: adapterName,
          name: adapterName,
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
          numeric_price: null,
          discount: null,
          offer: null,
          offer_adjusted_price: null,
          delivery_time: null,
          delivery_fee: null,
          estimated_total_payable: null,
          stock: 'Stock status unavailable',
          product_url: null,
          search_url: fallbackSearchUrl,
          order_action: `View on ${adapterName}`,
          location,
          data_status: 'error',
          source: null,
          status_reason: 'Platform adapter request failed.',
          retrieved_at: nowIso,
          match_confidence: null,
        };
      });

      const computed = computeComparisonMetrics(platformEntries, isDemoMode);
      const liveCount = computed.metrics.live_platforms_count;
      const hasSimulatorEntry = platformEntries.some((p) => p.source === 'simulator');

      const statusMessage =
        liveCount > 0
          ? hasSimulatorEntry
            ? `DEMO/DEBUG MODE — Comparing ${liveCount} of 4 platform(s) via unified ingestion pipeline (Source: SIMULATOR).`
            : `Comparing ${liveCount} live platform observation(s) in ${location}. Unvisited platforms are marked "Live data unavailable".`
          : 'No live results available for this search right now. Browse a supported product page on Blinkit, Zepto, Flipkart Minutes, or Amazon Minutes with the QuickHatke Chrome Extension (or send a simulator payload in DEMO/DEBUG mode) to populate comparison cards.';

      const resultPayload: ComparisonResult = {
        product: targetProduct,
        normalized_query: catalogLookup.normalizedQuery,
        normalized_attributes: targetAttributes,
        location,
        is_category_search: selectedProduct ? false : catalogLookup.isCategorySearch,
        search_state: liveCount > 0 ? 'results_found' : 'live_data_unavailable',
        data_mode: liveCount > 0 ? (hasSimulatorEntry ? 'demo' : 'live') : 'unavailable',
        status_message: statusMessage,
        cached: false,
        retrieved_at: nowIso,
        ai_assistance_status: 'not_requested',
        matching_products: catalogLookup.matches,
        platforms: platformEntries,
        metrics: computed.metrics,
        best_price: computed.best_price,
        fastest_delivery: computed.fastest_delivery,
        best_overall: computed.best_overall,
      };

      comparisonCache.set(cacheKey, {
        timestamp: Date.now(),
        result: resultPayload,
      });

      res.status(200).json(resultPayload);
    } catch (error: unknown) {
      console.error('Handled error in /api/compare:', error);
      const rawQuery = typeof req.body?.query === 'string' ? req.body.query : 'Product';
      const location = typeof req.body?.city === 'string' ? req.body.city : 'Bengaluru';
      const fallbackLookup = findCatalogMatchesForQuery(rawQuery);
      const fallbackProduct =
        fallbackLookup.exactSelectedProduct ||
        fallbackLookup.matches[0]?.name ||
        formatDisplayQueryTitle(rawQuery) ||
        'Product';

      const safeFallback = buildUnavailableLiveComparison(fallbackProduct, location, {
        normalizedQuery: fallbackLookup.normalizedQuery,
        isCategorySearch: fallbackLookup.isCategorySearch,
        matchingProducts: fallbackLookup.matches,
        searchState: 'api_failure',
        statusMessage: 'No live results available for this search right now.',
      });

      res.status(200).json(safeFallback);
    }
  });

  app.post('/api/match-test', (req, res) => {
    const target = typeof req.body?.target === 'string' ? req.body.target : '';
    const candidate = typeof req.body?.candidate === 'string' ? req.body.candidate : '';
    const evaluation = evaluateProductMatch(target, candidate);
    res.status(200).json(evaluation);
  });

  app.post('/api/ai-assist', async (req, res) => {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const deterministicAttrs = normalizeProductAttributes(query);

    const ai = getGeminiClient();
    if (!ai || !query) {
      res.status(200).json({
        status: 'unavailable',
        message: 'AI assistance is not configured. Using deterministic attribute extraction.',
        attributes: deterministicAttrs,
      });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Analyze the shopping query "${query}". Extract only its product attributes (brand, category, variant, size, quantity) and a 1-sentence buying tip on what pack/variant specifications to verify when comparing across stores. NEVER generate or guess prices, delivery times, stock, or URLs.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              brand: { type: Type.STRING, nullable: true },
              category: { type: Type.STRING },
              variant: { type: Type.STRING, nullable: true },
              size: { type: Type.STRING, nullable: true },
              quantity: { type: Type.STRING, nullable: true },
              matching_advice: { type: Type.STRING },
            },
            required: ['category', 'matching_advice'],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      res.status(200).json({
        status: 'available',
        attributes: deterministicAttrs,
        ai_insight: parsed,
      });
    } catch {
      res.status(200).json({
        status: 'unavailable_503',
        message:
          'AI assistance is temporarily unavailable. Core comparison can continue without AI.',
        attributes: deterministicAttrs,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QuickHatke server running on http://localhost:${PORT}`);
  });
}

startServer();
