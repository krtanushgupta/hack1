import React, { useState, useEffect, useCallback } from 'react';
import {
  Puzzle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  PlusCircle,
  Trash2,
  SlidersHorizontal,
  Terminal,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import {
  type ComparisonResult,
  normalizeProductAttributes,
  evaluateProductMatch,
  PLATFORMS_LIST,
  buildPlatformSearchUrl,
} from '../types/comparison';

interface ExtensionDiagnosticEntry {
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

interface NormalizedExtensionPayload {
  platform: string;
  productName: string | null;
  brand: string | null;
  variant: string | null;
  quantity: string | null;
  price: number | null;
  mrp: number | null;
  discount?: string | null;
  offer?: string | null;
  availability?: string | null;
  deliveryEta: string | null;
  productUrl?: string;
  source: 'simulator' | 'extension';
  capturedAt: string;
}

interface PipelineTraceState {
  active: boolean;
  source: 'simulator' | 'extension';
  targetPlatform: string;
  expectedPrice: number;
  expectedEta: string | null;
  simulator: { status: 'SUCCESS' | 'FAILED'; detail: string };
  normalization: { status: 'SUCCESS' | 'FAILED'; detail: string };
  payloadSent: { status: 'SUCCESS' | 'FAILED'; detail: string };
  backend: { status: 'SUCCESS' | 'FAILED' | 'NOT USED'; detail: string };
  websiteReceived: { status: 'SUCCESS' | 'FAILED'; detail: string };
  productMatch: { status: 'SUCCESS' | 'FAILED'; detail: string };
}

interface ExtensionWorkbenchProps {
  comparison: ComparisonResult;
  selectedCity: string;
  isDemoMode: boolean;
  onObservationCaptured: (options?: {
    activateDemoMode?: boolean;
    productName?: string;
  }) => Promise<ComparisonResult | null>;
}

const ADAPTER_MAP: Record<
  string,
  'blinkitAdapter' | 'zeptoAdapter' | 'flipkartMinutesAdapter' | 'amazonMinutesAdapter'
> = {
  Blinkit: 'blinkitAdapter',
  Zepto: 'zeptoAdapter',
  'Flipkart Minutes': 'flipkartMinutesAdapter',
  'Amazon Minutes': 'amazonMinutesAdapter',
};

export const ExtensionWorkbench: React.FC<ExtensionWorkbenchProps> = ({
  comparison,
  selectedCity,
  isDemoMode,
  onObservationCaptured,
}) => {
  const [extensionDetectedInBrowser, setExtensionDetectedInBrowser] = useState<boolean>(false);
  const [simulatedExtensionInstalled, setSimulatedExtensionInstalled] = useState<boolean>(true);
  const [diagnosticsList, setDiagnosticsList] = useState<ExtensionDiagnosticEntry[]>([]);
  const [lastNormalizedPayload, setLastNormalizedPayload] =
    useState<NormalizedExtensionPayload | null>(null);
  const [pipelineTrace, setPipelineTrace] = useState<PipelineTraceState | null>(null);

  // Page extraction form state (Defaults to Classmate Notebook A4 Single Line 172 Pages on Blinkit)
  const [capPlatform, setCapPlatform] = useState<string>('Blinkit');
  const [capProduct, setCapProduct] = useState<string>(
    'Classmate Notebook A4 Single Line (172 Pages)'
  );
  const [capBrand, setCapBrand] = useState<string>('Classmate');
  const [capVariant, setCapVariant] = useState<string>('Single Line');
  const [capQuantity, setCapQuantity] = useState<string>('172 pages');
  const [capPrice, setCapPrice] = useState<string>('42');
  const [capMrp, setCapMrp] = useState<string>('45');
  const [capDiscount, setCapDiscount] = useState<string>('₹3 OFF');
  const [capEta, setCapEta] = useState<string>('12 min');
  const [capOffer, setCapOffer] = useState<string>('None');
  const [capAvailability, setCapAvailability] = useState<string>('In stock');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Product Matcher Test state (Default: "Amul Taaza 1L" vs "Amul Taaza 500ml")
  const [matchTarget, setMatchTarget] = useState<string>('Amul Taaza 1L');
  const [matchCandidate, setMatchCandidate] = useState<string>('Amul Taaza 500ml');

  const matchEvaluation = evaluateProductMatch(matchTarget, matchCandidate);

  const fetchDiagnostics = useCallback(async () => {
    try {
      const res = await fetch('/api/extension/diagnostics');
      const data = await res.json();
      if (Array.isArray(data.diagnostics)) {
        setDiagnosticsList(data.diagnostics);
      }
      if (Array.isArray(data.observations) && data.observations.length > 0) {
        const obs = data.observations[0];
        setLastNormalizedPayload({
          platform: obs.platform,
          productName: obs.productName || obs.product_name || null,
          brand: obs.brand ?? null,
          variant: obs.variant ?? null,
          quantity: obs.quantity ?? null,
          price: typeof obs.price === 'number' ? obs.price : null,
          mrp: typeof obs.mrp === 'number' ? obs.mrp : null,
          discount: obs.discount ?? null,
          offer: obs.offer ?? null,
          availability: obs.availability ?? null,
          deliveryEta: obs.deliveryEta ?? obs.delivery_time ?? null,
          productUrl: obs.productUrl || obs.product_url || '',
          source: obs.source === 'simulator' ? 'simulator' : 'extension',
          capturedAt: obs.capturedAt || obs.retrieved_at || '',
        });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics, comparison.retrieved_at]);

  useEffect(() => {
    setCapProduct(comparison.product);
    setCapBrand(comparison.normalized_attributes.brand || 'Classmate');
    setCapVariant(comparison.normalized_attributes.variant || 'Single Line');
    setCapQuantity(comparison.normalized_attributes.quantity || '172 pages');
  }, [comparison.product, comparison.normalized_attributes]);

  // Listen for real Chrome Extension content-script heartbeat and live capture sync via window.postMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.source !== 'QUICKHATKE_EXTENSION') return;
      if (event.data.type === 'EXTENSION_INSTALLED_HEARTBEAT') {
        setExtensionDetectedInBrowser(true);
      } else if (event.data.type === 'QUICKHATKE_CAPTURE_SYNC') {
        setExtensionDetectedInBrowser(true);
        if (event.data.product) {
          setLastNormalizedPayload({
            ...event.data.product,
            source: 'extension',
          });
        }
        fetchDiagnostics();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fetchDiagnostics]);

  const latestDiag = diagnosticsList[0] || null;
  const hasLivePlatformData = comparison.metrics.live_platforms_count > 0;
  const isExtensionInstalled = extensionDetectedInBrowser || simulatedExtensionInstalled;

  const extensionStatusState = (() => {
    if (!isExtensionInstalled && !hasLivePlatformData) {
      return {
        code: 'not_installed',
        label: 'Install QuickHatke Extension',
        tone: 'bg-slate-100 text-slate-800 border-slate-300',
      };
    }
    if (
      latestDiag &&
      (latestDiag.extractionStatus === 'blocked' ||
        latestDiag.extractionStatus === 'unavailable' ||
        latestDiag.extractionStatus === 'error')
    ) {
      return {
        code: 'platform_unavailable',
        label: 'Platform data unavailable',
        tone: 'bg-amber-50 text-amber-900 border-amber-300',
      };
    }
    if (hasLivePlatformData || (latestDiag && latestDiag.extractionStatus === 'success')) {
      return {
        code: 'live_received',
        label: 'Live data received',
        tone: 'bg-emerald-50 text-emerald-900 border-emerald-300',
      };
    }
    return {
      code: 'open_supported_page',
      label: 'Open a supported product page',
      tone: 'bg-sky-50 text-sky-900 border-sky-300',
    };
  })();

  const handleCaptureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericPrice = parseFloat(capPrice);
    const numericMrp = capMrp ? parseFloat(capMrp) : null;
    const capturedAt = new Date().toISOString();
    const resolvedProductTitle = (capProduct || comparison.product).trim();

    // Stage 1: SIMULATOR
    if (!resolvedProductTitle || Number.isNaN(numericPrice) || numericPrice <= 0) {
      setPipelineTrace({
        active: true,
        source: 'simulator',
        targetPlatform: capPlatform,
        expectedPrice: numericPrice || 0,
        expectedEta: capEta.trim() || null,
        simulator: {
          status: 'FAILED',
          detail: 'Invalid simulator input: productName and positive price are required.',
        },
        normalization: { status: 'FAILED', detail: 'Skipped due to invalid simulator input.' },
        payloadSent: { status: 'FAILED', detail: 'Not sent.' },
        backend: { status: 'NOT USED', detail: 'Not called.' },
        websiteReceived: { status: 'FAILED', detail: 'No payload received.' },
        productMatch: { status: 'FAILED', detail: 'Not evaluated.' },
      });
      return;
    }

    const simulatorPayload: NormalizedExtensionPayload = {
      platform: capPlatform.toLowerCase(),
      productName: resolvedProductTitle,
      brand: capBrand.trim() || null,
      variant: capVariant.trim() || null,
      quantity: capQuantity.trim() || null,
      price: numericPrice,
      mrp: numericMrp && !Number.isNaN(numericMrp) ? numericMrp : null,
      deliveryEta: capEta.trim() || null,
      source: 'simulator',
      capturedAt,
    };

    // Stage 2: NORMALIZATION
    const normAttrs = normalizeProductAttributes(
      `${simulatorPayload.productName} ${simulatorPayload.quantity || ''}`
    );
    const normalizationSucceeded = Boolean(normAttrs && normAttrs.product_name);

    setIsSubmitting(true);
    try {
      // Stage 3 & 4: PAYLOAD SENT -> BACKEND (/api/extension/ingest)
      const ingestRes = await fetch('/api/extension/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...simulatorPayload,
          discount: capDiscount.trim() && capDiscount !== 'None' ? capDiscount.trim() : null,
          offer: capOffer.trim() && capOffer !== 'None' ? capOffer.trim() : null,
          availability: capAvailability,
          location: selectedCity,
        }),
      });

      const ingestJson = await ingestRes.json();
      const backendOk = ingestRes.ok && Boolean(ingestJson?.ok);

      setLastNormalizedPayload(simulatorPayload);
      await fetchDiagnostics();

      // Stage 5: WEBSITE RECEIVED (Activate DEMO/DEBUG Mode & run /api/compare through unified pipeline)
      const updatedComparison = await onObservationCaptured({
        activateDemoMode: true,
        productName: resolvedProductTitle,
      });

      const websiteReceivedOk = Boolean(
        updatedComparison && Array.isArray(updatedComparison.platforms)
      );

      // Stage 6: PRODUCT MATCH
      const matchedEntry = updatedComparison?.platforms.find(
        (p) => p.name.toLowerCase() === capPlatform.toLowerCase()
      );
      const evalResult = evaluateProductMatch(
        resolvedProductTitle,
        ingestJson?.observation?.normalized_attributes || resolvedProductTitle
      );
      const productMatchOk = Boolean(
        evalResult.is_equivalent &&
          matchedEntry &&
          typeof matchedEntry.match_confidence === 'number' &&
          matchedEntry.match_confidence >= 0.75
      );

      setPipelineTrace({
        active: true,
        source: 'simulator',
        targetPlatform: capPlatform,
        expectedPrice: numericPrice,
        expectedEta: simulatorPayload.deliveryEta,
        simulator: {
          status: 'SUCCESS',
          detail: `Constructed payload with source: "simulator" (${simulatorPayload.platform}, ₹${numericPrice}, ${simulatorPayload.deliveryEta})`,
        },
        normalization: {
          status: normalizationSucceeded ? 'SUCCESS' : 'FAILED',
          detail: normalizationSucceeded
            ? `Normalized platform="${ingestJson?.observation?.platform || capPlatform}", brand="${normAttrs.brand}", variant="${normAttrs.variant}", quantity="${normAttrs.quantity}"`
            : 'Attribute normalization failed.',
        },
        payloadSent: {
          status: 'SUCCESS',
          detail: 'POST /api/extension/ingest dispatched with JSON body',
        },
        backend: {
          status: backendOk ? 'SUCCESS' : 'FAILED',
          detail: backendOk
            ? `recordExtensionObservation() stored record #${ingestJson.total_observations} (source: "${ingestJson.observation?.source}")`
            : ingestJson?.error || `HTTP ${ingestRes.status}`,
        },
        websiteReceived: {
          status: websiteReceivedOk ? 'SUCCESS' : 'FAILED',
          detail: websiteReceivedOk
            ? `executeComparison() received updated ComparisonResult for "${updatedComparison?.product}"`
            : 'Failed to receive ComparisonResult from /api/compare.',
        },
        productMatch: {
          status: productMatchOk ? 'SUCCESS' : 'FAILED',
          detail: productMatchOk
            ? `evaluateProductMatch() -> is_equivalent: true, match_confidence: ${matchedEntry?.match_confidence ?? evalResult.match_confidence}`
            : evalResult.mismatch_reasons.join(', ') || 'Product matcher did not match observation.',
        },
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Network error';
      setPipelineTrace({
        active: true,
        source: 'simulator',
        targetPlatform: capPlatform,
        expectedPrice: numericPrice,
        expectedEta: simulatorPayload.deliveryEta,
        simulator: { status: 'SUCCESS', detail: 'Simulator payload constructed.' },
        normalization: {
          status: normalizationSucceeded ? 'SUCCESS' : 'FAILED',
          detail: 'Normalized product attributes.',
        },
        payloadSent: { status: 'FAILED', detail: errMsg },
        backend: { status: 'FAILED', detail: errMsg },
        websiteReceived: { status: 'FAILED', detail: 'Aborted due to network error.' },
        productMatch: { status: 'FAILED', detail: 'Aborted.' },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoadSampleCaptureSet = async () => {
    setIsSubmitting(true);
    const activeProd = comparison.product;
    const attrs = comparison.normalized_attributes;
    const sampleObservations = [
      { platform: 'blinkit', price: 42, mrp: 45, discount: '₹3 OFF', eta: '12 min', offer: null },
      { platform: 'zepto', price: 40, mrp: 45, discount: '₹5 OFF', eta: '9 min', offer: null },
      { platform: 'flipkart minutes', price: 43, mrp: 45, discount: '₹2 OFF', eta: '14 min', offer: null },
    ];

    try {
      for (const item of sampleObservations) {
        const payload: NormalizedExtensionPayload = {
          platform: item.platform,
          productName: activeProd,
          brand: attrs.brand || 'Classmate',
          variant: attrs.variant || 'Single Line',
          quantity: attrs.quantity || '172 pages',
          price: item.price,
          mrp: item.mrp,
          discount: item.discount,
          offer: item.offer,
          availability: 'In stock',
          deliveryEta: item.eta,
          productUrl: buildPlatformSearchUrl(item.platform, activeProd),
          source: 'simulator',
          capturedAt: new Date().toISOString(),
        };
        await fetch('/api/extension/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            location: selectedCity,
          }),
        });
        setLastNormalizedPayload(payload);
      }
      await fetchDiagnostics();
      await onObservationCaptured({ activateDemoMode: true, productName: activeProd });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulateBlockedPlatform = async (platformName: string) => {
    const blockedUrl = buildPlatformSearchUrl(platformName, comparison.product);
    const capturedAt = new Date().toISOString();
    const blockedPayload: NormalizedExtensionPayload = {
      platform: platformName.toLowerCase(),
      productName: null,
      brand: null,
      variant: null,
      quantity: null,
      price: null,
      mrp: null,
      discount: null,
      offer: null,
      availability: null,
      deliveryEta: null,
      productUrl: blockedUrl,
      source: 'simulator',
      capturedAt,
    };
    setLastNormalizedPayload(blockedPayload);

    await fetch('/api/extension/diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        detectedPlatform: platformName,
        currentUrl: blockedUrl,
        adapterSelected: ADAPTER_MAP[platformName] || 'none',
        extractionStatus: 'blocked',
        fieldsExtracted: [],
        timestamp: capturedAt,
        errorMessage: `Platform data unavailable: ${platformName} page blocked extraction or required anti-bot verification.`,
      }),
    });
    await fetchDiagnostics();
  };

  const handleClearCaptures = async () => {
    await fetch('/api/extension/clear', { method: 'POST' });
    setLastNormalizedPayload(null);
    setPipelineTrace(null);
    await fetchDiagnostics();
    await onObservationCaptured();
  };

  // Compute live Stage 7 (COMPARISON STATE) and Stage 8 (UI) from actual `comparison` prop
  const targetPlatformEntry = pipelineTrace
    ? comparison.platforms.find(
        (p) => p.name.toLowerCase() === pipelineTrace.targetPlatform.toLowerCase()
      )
    : null;

  const comparisonStateUpdated = Boolean(
    pipelineTrace &&
      targetPlatformEntry &&
      targetPlatformEntry.numeric_price === pipelineTrace.expectedPrice &&
      targetPlatformEntry.source === pipelineTrace.source
  );

  const comparisonStateStage = pipelineTrace
    ? comparisonStateUpdated
      ? {
          status: 'UPDATED' as const,
          detail: `${comparison.metrics.live_platforms_count} of 4 platforms active in state · ${targetPlatformEntry?.name} numeric_price=${targetPlatformEntry?.numeric_price}, delivery_time="${targetPlatformEntry?.delivery_time}", source="${targetPlatformEntry?.source}"`,
        }
      : !isDemoMode && pipelineTrace.source === 'simulator'
      ? {
          status: 'FAILED' as const,
          detail:
            'Blocked by Production Mode guard: Production Mode strictly rejects records with source: "simulator". Switch to DEMO MODE to view simulated records.',
        }
      : {
          status: 'FAILED' as const,
          detail: 'Comparison state did not update with the target platform price.',
        }
    : null;

  const uiStage = pipelineTrace
    ? comparisonStateUpdated && targetPlatformEntry?.price === `₹${pipelineTrace.expectedPrice}`
      ? {
          status: 'UPDATED' as const,
          detail: `${targetPlatformEntry.name} card rendered with ${targetPlatformEntry.price}, ${targetPlatformEntry.delivery_time || '--'}, and explicit "Source: ${targetPlatformEntry.source?.toUpperCase()}" badge`,
        }
      : !isDemoMode && pipelineTrace.source === 'simulator'
      ? {
          status: 'FAILED' as const,
          detail:
            'Production Mode UI displays "LIVE DATA UNAVAILABLE" (0 of 4) because source: "simulator" is excluded from Production Mode.',
        }
      : {
          status: 'FAILED' as const,
          detail: 'Platform card UI did not render the expected price.',
        }
    : null;

  return (
    <section
      id="extension-architecture"
      className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
    >
      {/* Left 5 Cols: Chrome Extension Status, Popup Preview + Adapter Capture */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Puzzle className="w-4 h-4 text-slate-900" />
              <span>QuickHatke Chrome Extension (Manifest V3)</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Extracts visible product data via blinkitAdapter, zeptoAdapter, flipkartMinutesAdapter & amazonMinutesAdapter.
            </p>
          </div>
          <a
            href="/extension/manifest.json"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-4 whitespace-nowrap"
          >
            manifest.json
          </a>
        </div>

        {/* Required 4-State Extension Status Bar */}
        <div
          className={`px-3.5 py-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${extensionStatusState.tone}`}
        >
          <div className="font-bold flex items-center gap-1.5">
            <span>Status:</span>
            <span>{extensionStatusState.label}</span>
          </div>
          <button
            type="button"
            onClick={() => setSimulatedExtensionInstalled((prev) => !prev)}
            className="text-xs underline underline-offset-2 opacity-80 hover:opacity-100 cursor-pointer"
          >
            {isExtensionInstalled ? 'Simulate Uninstalled' : 'Simulate Installed'}
          </button>
        </div>

        {/* Live Extension Popup Preview */}
        <div className="bg-slate-900 text-white rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <span className="font-display font-bold text-sm">QuickHatke Popup</span>
            <span className="text-xs text-slate-400">
              {selectedCity} · {isDemoMode ? 'DEMO/DEBUG' : 'PRODUCTION'}
            </span>
          </div>

          <div className="text-xs font-semibold text-slate-200">
            {comparison.product}
          </div>

          <div className="space-y-1.5">
            {comparison.platforms.map((p) => (
              <div
                key={p.name}
                className="flex items-center justify-between bg-slate-800/90 px-3 py-2 rounded-lg text-xs"
              >
                <span className="font-medium text-slate-200">{p.name}</span>
                {(p.data_status === 'live' || (isDemoMode && p.source === 'simulator')) && p.price ? (
                  <span className="font-mono font-bold text-emerald-400 tabular-nums">
                    {p.price}
                    {p.delivery_time ? ` · ${p.delivery_time}` : ''} ·{' '}
                    {p.source === 'simulator'
                      ? 'Source: SIMULATOR'
                      : p.stock === 'Available'
                      ? 'In stock'
                      : p.stock}
                  </span>
                ) : (
                  <span className="text-slate-400">No live data</span>
                )}
              </div>
            ))}
          </div>

          {comparison.best_price ? (
            <div className="bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between">
              <span>💰 Lowest price: {comparison.best_price}</span>
              {comparison.metrics.price_difference ? (
                <span className="font-mono">
                  Save ₹{comparison.metrics.price_difference}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="bg-slate-800/60 text-slate-400 px-3 py-2 rounded-lg text-xs">
              {extensionStatusState.label} — No fabricated prices in Production Mode.
            </div>
          )}
        </div>

        {/* Extension Adapter Capture Form */}
        <form onSubmit={handleCaptureSubmit} className="space-y-3 pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900">
              Test Adapter Capture ({ADAPTER_MAP[capPlatform] || 'blinkitAdapter'})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadSampleCaptureSet}
                disabled={isSubmitting}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-4 cursor-pointer"
              >
                Capture Blinkit/Zepto/Flipkart (Leave Amazon Empty)
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={handleClearCaptures}
                className="text-xs font-medium text-slate-500 hover:text-red-600 inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Platform</label>
              <select
                value={capPlatform}
                onChange={(e) => setCapPlatform(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                {PLATFORMS_LIST.map((plat) => (
                  <option key={plat} value={plat}>
                    {plat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Price (₹)</label>
              <input
                type="number"
                value={capPrice}
                onChange={(e) => setCapPrice(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">MRP (₹)</label>
              <input
                type="number"
                value={capMrp}
                onChange={(e) => setCapMrp(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">productName</label>
              <input
                type="text"
                value={capProduct}
                onChange={(e) => setCapProduct(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">deliveryEta</label>
              <input
                type="text"
                value={capEta}
                onChange={(e) => setCapEta(e.target.value)}
                placeholder="12 min"
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">brand</label>
              <input
                type="text"
                value={capBrand}
                onChange={(e) => setCapBrand(e.target.value)}
                placeholder="null if missing"
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">variant</label>
              <input
                type="text"
                value={capVariant}
                onChange={(e) => setCapVariant(e.target.value)}
                placeholder="null if missing"
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">quantity</label>
              <input
                type="text"
                value={capQuantity}
                onChange={(e) => setCapQuantity(e.target.value)}
                placeholder="172 pages / 1L"
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Send Normalized Adapter Payload ({capPlatform})
            </button>
            <button
              type="button"
              onClick={() => handleSimulateBlockedPlatform(capPlatform)}
              className="py-2 px-3 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Test Blocked State
            </button>
          </div>
        </form>
      </div>

      {/* Right 7 Cols: 8-Stage Pipeline Trace + Product Matcher + Developer Diagnostics */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="pb-3 border-b border-slate-200">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <SlidersHorizontal className="w-4 h-4 text-slate-900" />
            <span>Unified Ingestion Pipeline Trace, Variant Matcher & Extension Diagnostics</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Both Simulator (source: &ldquo;simulator&rdquo;) and Real Extension (source: &ldquo;extension&rdquo;) feed the exact same ingestion, product matcher, and comparison state pipeline.
          </p>
        </div>

        {/* 8-Stage Unified Pipeline Diagnostics Trace */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-950 text-slate-100">
          <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Unified Ingestion Pipeline Stage Diagnostics</span>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {pipelineTrace
                ? `MODE: ${isDemoMode ? 'DEMO/DEBUG (Accepts Simulator)' : 'PRODUCTION (Blocks Simulator)'}`
                : 'CLICK "Send Normalized Adapter Payload" TO TRACE'}
            </span>
          </div>

          {pipelineTrace && comparisonStateStage && uiStage ? (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
              {[
                { label: 'SIMULATOR', ...pipelineTrace.simulator },
                { label: 'NORMALIZATION', ...pipelineTrace.normalization },
                { label: 'PAYLOAD SENT', ...pipelineTrace.payloadSent },
                { label: 'BACKEND', ...pipelineTrace.backend },
                { label: 'WEBSITE RECEIVED', ...pipelineTrace.websiteReceived },
                { label: 'PRODUCT MATCH', ...pipelineTrace.productMatch },
                { label: 'COMPARISON STATE', ...comparisonStateStage },
                { label: 'UI', ...uiStage },
              ].map((stage) => {
                const isOk = stage.status === 'SUCCESS' || stage.status === 'UPDATED';
                return (
                  <div
                    key={stage.label}
                    className={`p-2.5 rounded-lg border ${
                      isOk
                        ? 'bg-emerald-950/40 border-emerald-800/70'
                        : 'bg-rose-950/50 border-rose-700/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-300 font-bold">{stage.label}:</span>
                      <span
                        className={`font-bold ${
                          isOk ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {stage.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug break-words">
                      {stage.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-xs font-mono text-slate-400">
              No simulator or extension payload traced in this session yet. Click{' '}
              <strong className="text-white">
                &ldquo;Send Normalized Adapter Payload (Blinkit)&rdquo;
              </strong>{' '}
              on the left to trace all 8 stages (SIMULATOR → NORMALIZATION → PAYLOAD SENT → BACKEND → WEBSITE RECEIVED → PRODUCT MATCH → COMPARISON STATE → UI).
            </div>
          )}
        </div>

        {/* Interactive Equivalence Confidence Verifier */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900">
              Variant Equivalence & Confidence Matcher
            </span>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMatchTarget('Amul Taaza 1L');
                  setMatchCandidate('Amul Taaza 500ml');
                }}
                className="text-slate-600 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
              >
                Amul Taaza 1L vs 500ml
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => {
                  setMatchTarget('Amul Taaza Milk 1L');
                  setMatchCandidate('Amul Taaza 1 Litre');
                }}
                className="text-slate-600 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
              >
                1L vs 1 Litre (Same)
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => {
                  setMatchTarget('Classmate Long Notebook A4 Single Line 172 pages');
                  setMatchCandidate('Classmate A5 100 pages');
                }}
                className="text-slate-600 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
              >
                A4 172p vs A5 100p
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Product A (Target Query / Page)
              </label>
              <input
                type="text"
                value={matchTarget}
                onChange={(e) => setMatchTarget(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Product B (Captured Platform Product)
              </label>
              <input
                type="text"
                value={matchCandidate}
                onChange={(e) => setMatchCandidate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div
            className={`p-3.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              matchEvaluation.is_equivalent
                ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900'
                : 'bg-amber-50/70 border-amber-300 text-amber-900'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                {matchEvaluation.is_equivalent ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>Equivalent Product Variant — Safe to Compare</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-amber-700" />
                    <span>Quantity / Variant Mismatch — Blocked from Auto-Matching</span>
                  </>
                )}
              </div>
              <p className="text-slate-600">
                {matchEvaluation.mismatch_reasons.length > 0
                  ? matchEvaluation.mismatch_reasons.join(' · ')
                  : `Matched: ${matchEvaluation.matched_attributes.join(', ')}`}
              </p>
            </div>

            <div className="font-mono text-sm font-bold shrink-0">
              match_confidence: {matchEvaluation.match_confidence}
            </div>
          </div>
        </div>

        {/* Developer Diagnostics Screen */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-900 text-slate-100">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Extension Developer Diagnostics (Zero Auth/Token Exposure)</span>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {latestDiag ? latestDiag.extractionStatus.toUpperCase() : 'AWAITING_PAGE_CAPTURE'}
            </span>
          </div>

          <div className="p-4 space-y-3 text-xs font-mono">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="bg-slate-800/80 p-2.5 rounded-lg">
                <span className="text-slate-400 block">Detected Platform</span>
                <span className="text-white font-semibold">
                  {latestDiag?.detectedPlatform || 'None (Open a supported product page)'}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg">
                <span className="text-slate-400 block">Adapter Selected</span>
                <span className="text-emerald-300 font-semibold">
                  {latestDiag?.adapterSelected ||
                    `${ADAPTER_MAP[capPlatform] || 'blinkitAdapter'} (Standby)`}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg sm:col-span-2">
                <span className="text-slate-400 block">Current URL</span>
                <span className="text-slate-200 break-all">
                  {latestDiag?.currentUrl ||
                    buildPlatformSearchUrl(capPlatform, comparison.product)}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg">
                <span className="text-slate-400 block">Extraction Status</span>
                <span
                  className={
                    latestDiag?.extractionStatus === 'success'
                      ? 'text-emerald-400 font-bold'
                      : latestDiag?.extractionStatus === 'blocked'
                      ? 'text-amber-400 font-bold'
                      : 'text-slate-300'
                  }
                >
                  {latestDiag?.extractionStatus || 'awaiting_page_capture'}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg">
                <span className="text-slate-400 block">Timestamp (capturedAt)</span>
                <span className="text-slate-200">
                  {latestDiag?.timestamp || '—'}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg sm:col-span-2">
                <span className="text-slate-400 block">Fields Extracted</span>
                <span className="text-emerald-300">
                  {latestDiag && latestDiag.fieldsExtracted.length > 0
                    ? latestDiag.fieldsExtracted.join(', ')
                    : 'None (Missing fields return null)'}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg sm:col-span-2">
                <span className="text-slate-400 block">Error / Status Message</span>
                <span className="text-amber-300 flex items-center gap-1.5">
                  {latestDiag?.errorMessage ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{latestDiag.errorMessage}</span>
                    </>
                  ) : (
                    'None'
                  )}
                </span>
              </div>
            </div>

            {lastNormalizedPayload && (
              <div className="pt-2 border-t border-slate-800">
                <div className="text-slate-400 mb-1">
                  Last Normalized Adapter Output Structure (source: &ldquo;{lastNormalizedPayload.source}&rdquo;):
                </div>
                <pre className="bg-slate-950 p-2.5 rounded-lg text-emerald-300 overflow-x-auto max-h-40">
                  {JSON.stringify(lastNormalizedPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Extension Files Reference */}
        <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Extension Adapter Modules (/public/extension/):</span>
          <div className="flex flex-wrap items-center gap-3 font-mono">
            <a
              href="/extension/manifest.json"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 inline-flex items-center gap-0.5"
            >
              manifest.json <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="/extension/adapters/blinkitAdapter.js"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 inline-flex items-center gap-0.5"
            >
              blinkitAdapter.js <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="/extension/adapters/zeptoAdapter.js"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 inline-flex items-center gap-0.5"
            >
              zeptoAdapter.js <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="/extension/adapters/flipkartMinutesAdapter.js"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 inline-flex items-center gap-0.5"
            >
              flipkartMinutesAdapter.js <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="/extension/adapters/amazonMinutesAdapter.js"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 inline-flex items-center gap-0.5"
            >
              amazonMinutesAdapter.js <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
