import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  TrendingDown,
  Clock,
  Award,
  Copy,
  Check,
  Download,
  Bell,
  Trash2,
  ArrowUpDown,
  LayoutGrid,
  Table as TableIcon,
  Code2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Info,
} from 'lucide-react';
import {
  type ComparisonResult,
  type PlatformEntry,
  type TrackedAlert,
  type SortOption,
  type OutputMode,
  INITIAL_COMPARISON_STATE,
  QUICK_SEARCH_EXAMPLES,
  PLATFORMS_LIST,
  parseNumericPrice,
  parseNumericMinutes,
  hasActiveOffer,
  buildPlatformSearchUrl,
  getPlatformFallbackSiteUrl,
  findCatalogMatchesForQuery,
  buildUnavailableLiveComparison,
} from './types/comparison';
import { PlatformLogo } from './components/PlatformLogo';
import { AlertModal } from './components/AlertModal';
import { ExtensionWorkbench } from './components/ExtensionWorkbench';

const CITIES = ['Bengaluru', 'Mumbai', 'Delhi NCR', 'Hyderabad', 'Pune', 'Chennai'];
const STORAGE_KEY_ALERTS = 'quickhatke_tracked_alerts_v2';

function formatRelativeTime(isoString: string | undefined): string {
  if (!isoString) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
  if (diffSec < 15) return 'Updated just now';
  if (diffSec < 60) return `Updated ${diffSec} seconds ago`;
  const mins = Math.floor(diffSec / 60);
  return `Updated ${mins} minute${mins === 1 ? '' : 's'} ago`;
}

export default function App() {
  const [queryInput, setQueryInput] = useState<string>('Classmate notebook A4');
  const [selectedCity, setSelectedCity] = useState<string>('Bengaluru');
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [comparison, setComparison] = useState<ComparisonResult>(INITIAL_COMPARISON_STATE);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Optional AI Assistance state (never blocks core comparison)
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'available' | 'unavailable_503'>('idle');
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  // Filters & view controls
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [filterMode, setFilterMode] = useState<'all' | 'live' | 'offers'>('all');
  const [outputMode, setOutputMode] = useState<OutputMode>('split');
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  const [alerts, setAlerts] = useState<TrackedAlert[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ALERTS);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore storage errors
    }
    return [
      {
        id: 'default-alert-1',
        product: 'Classmate Notebook A4 Single Line (172 Pages)',
        platform: 'Blinkit',
        type: 'price_drop',
        targetValue: '₹45',
        currentValue: '₹49',
        city: 'Bengaluru',
        createdAt: 'Active',
      },
    ];
  });

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalInitialType, setModalInitialType] = useState<'price_drop' | 'delivery_alert'>('price_drop');
  const [modalInitialPlatform, setModalInitialPlatform] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(alerts));
    } catch {
      // ignore
    }
  }, [alerts]);

  const executeComparison = useCallback(
    async (options?: {
      customQuery?: string;
      selectedProduct?: string;
      demoOverride?: boolean;
      forceRefresh?: boolean;
      isInitialLoad?: boolean;
    }): Promise<ComparisonResult | null> => {
      const activeQuery = (options?.customQuery ?? queryInput).trim();
      const useDemo = options?.demoOverride ?? isDemoMode;

      setIsLoading(true);
      try {
        const response = await fetch('/api/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: activeQuery,
            selectedProduct: options?.selectedProduct || '',
            city: selectedCity,
            mode: useDemo ? 'demo' : 'production',
            forceRefresh: Boolean(options?.forceRefresh),
            isInitialLoad: Boolean(options?.isInitialLoad),
          }),
        });

        const data = (await response.json()) as ComparisonResult;
        if (data && Array.isArray(data.platforms)) {
          setComparison(data);
          if (options?.isInitialLoad && data.product && data.data_mode === 'live') {
            setQueryInput(data.product);
          }
          return data;
        } else {
          const fallback = findCatalogMatchesForQuery(activeQuery);
          const fallbackState = buildUnavailableLiveComparison(
            options?.selectedProduct || fallback.matches[0]?.name || activeQuery || 'Product',
            selectedCity,
            {
              normalizedQuery: fallback.normalizedQuery,
              isCategorySearch: fallback.isCategorySearch,
              matchingProducts: fallback.matches,
            }
          );
          setComparison(fallbackState);
          return fallbackState;
        }
      } catch {
        // Network failure fallback — never crash or show raw error
        const fallback = findCatalogMatchesForQuery(activeQuery);
        const netState = buildUnavailableLiveComparison(
          options?.selectedProduct || fallback.matches[0]?.name || activeQuery || 'Product',
          selectedCity,
          {
            normalizedQuery: fallback.normalizedQuery,
            isCategorySearch: fallback.isCategorySearch,
            matchingProducts: fallback.matches,
            searchState: 'network_failure',
            statusMessage: 'No live results available for this search right now.',
          }
        );
        setComparison(netState);
        return netState;
      } finally {
        setIsLoading(false);
      }
    },
    [queryInput, selectedCity, isDemoMode]
  );

  const lastSyncedCaptureKeyRef = useRef<string>('');

  useEffect(() => {
    executeComparison({ customQuery: 'Classmate notebook A4', isInitialLoad: true });
    // Request immediate sync from QuickHatke content-script if installed
    window.postMessage({ type: 'QUICKHATKE_WEB_REQUEST_SYNC' }, '*');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1. Direct Bridge Listener: Receive live captured product from Chrome Extension content-script via window.postMessage
  useEffect(() => {
    const handleExtensionMessage = async (event: MessageEvent) => {
      if (!event.data || event.data.source !== 'QUICKHATKE_EXTENSION') return;

      if (event.data.type === 'QUICKHATKE_CAPTURE_SYNC') {
        const { product, diagnostics } = event.data;

        if (diagnostics) {
          try {
            await fetch('/api/extension/diagnostics', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(diagnostics),
            });
          } catch {
            // ignore
          }
        }

        if (
          product &&
          product.productName &&
          typeof product.price === 'number' &&
          !Number.isNaN(product.price) &&
          product.price > 0
        ) {
          const captureKey = `${product.platform}::${product.productName}::${product.price}`;
          if (captureKey !== lastSyncedCaptureKeyRef.current) {
            lastSyncedCaptureKeyRef.current = captureKey;
            try {
              await fetch('/api/extension/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...product,
                  location: selectedCity,
                }),
              });
            } catch {
              // ignore
            }
            setIsDemoMode(false);
            setQueryInput(product.productName);
            executeComparison({
              customQuery: product.productName,
              selectedProduct: product.productName,
              demoOverride: false,
              forceRefresh: true,
            });
          }
        }
      }
    };

    window.addEventListener('message', handleExtensionMessage);
    return () => window.removeEventListener('message', handleExtensionMessage);
  }, [executeComparison, selectedCity]);

  // 2. Backend Observation Poller: Syncs whenever background.js POSTs a new observation to /api/extension/ingest
  useEffect(() => {
    let active = true;

    const checkLatestObservations = async () => {
      if (!active || isDemoMode) return;
      try {
        const res = await fetch('/api/extension/observations');
        if (!res.ok) return;
        const data = await res.json();
        const observations = Array.isArray(data.observations)
          ? data.observations.filter((o: { source?: string }) => o.source === 'extension')
          : [];
        if (observations.length > 0) {
          const latest = observations[0];
          const prodName = latest.productName || latest.product_name;
          const captureKey = `${latest.platform}::${prodName}::${latest.price}`;
          if (prodName && captureKey !== lastSyncedCaptureKeyRef.current) {
            lastSyncedCaptureKeyRef.current = captureKey;
            setQueryInput(prodName);
            executeComparison({
              customQuery: prodName,
              selectedProduct: prodName,
              demoOverride: false,
              forceRefresh: true,
            });
          }
        }
      } catch {
        // ignore
      }
    };

    checkLatestObservations();
    const intervalId = setInterval(checkLatestObservations, 3000);

    const handleFocus = () => {
      window.postMessage({ type: 'QUICKHATKE_WEB_REQUEST_SYNC' }, '*');
      checkLatestObservations();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      active = false;
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [executeComparison, isDemoMode]);

  const handleSearchFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeComparison({ customQuery: queryInput, forceRefresh: true });
  };

  const handleToggleDemoMode = (nextDemo: boolean) => {
    setIsDemoMode(nextDemo);
    executeComparison({
      customQuery: queryInput,
      selectedProduct: comparison.product,
      demoOverride: nextDemo,
      forceRefresh: true,
    });
  };

  const handleRunOptionalAiAssist = async () => {
    setAiStatus('loading');
    setAiMessage(null);
    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryInput }),
      });
      const data = await res.json();
      if (data.status === 'available' && data.ai_insight?.matching_advice) {
        setAiStatus('available');
        setAiMessage(data.ai_insight.matching_advice);
      } else {
        setAiStatus('unavailable_503');
        setAiMessage(
          data.message ||
            'AI assistance is temporarily unavailable. Core comparison can continue without AI.'
        );
      }
    } catch {
      setAiStatus('unavailable_503');
      setAiMessage(
        'AI assistance is temporarily unavailable. Core comparison can continue without AI.'
      );
    }
  };

  const winnerFlags = useMemo(() => {
    const lowestPlatform = (comparison.metrics?.lowest_price_platform || '').toLowerCase();
    const fastestPlatform = (comparison.metrics?.fastest_delivery_platform || '').toLowerCase();

    return {
      isBestPrice: (p: PlatformEntry) =>
        Boolean(lowestPlatform && p.name.toLowerCase() === lowestPlatform && p.price),
      isFastestDelivery: (p: PlatformEntry) =>
        Boolean(fastestPlatform && p.name.toLowerCase() === fastestPlatform && p.delivery_time),
      isBestOverall: (p: PlatformEntry) =>
        Boolean(lowestPlatform && p.name.toLowerCase() === lowestPlatform && p.price),
    };
  }, [comparison]);

  const displayedPlatforms = useMemo(() => {
    let list = [...(comparison.platforms || [])];

    if (filterMode === 'live') {
      list = list.filter((p) => p.data_status === 'live' || p.data_status === 'demo');
    } else if (filterMode === 'offers') {
      list = list.filter((p) => hasActiveOffer(p.offer));
    }

    if (sortBy === 'price_asc') {
      list.sort((a, b) => parseNumericPrice(a.price) - parseNumericPrice(b.price));
    } else if (sortBy === 'delivery_asc') {
      list.sort(
        (a, b) => parseNumericMinutes(a.delivery_time) - parseNumericMinutes(b.delivery_time)
      );
    } else if (sortBy === 'offers_first') {
      list.sort((a, b) => {
        const aOffer = hasActiveOffer(a.offer) ? 0 : 1;
        const bOffer = hasActiveOffer(b.offer) ? 0 : 1;
        if (aOffer !== bOffer) return aOffer - bOffer;
        return parseNumericPrice(a.price) - parseNumericPrice(b.price);
      });
    }

    return list;
  }, [comparison.platforms, filterMode, sortBy]);

  const formattedJsonString = useMemo(
    () => JSON.stringify(comparison, null, 2),
    [comparison]
  );

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(formattedJsonString);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([formattedJsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = (comparison.product || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.href = url;
    a.download = `quickhatke-${slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openAlertModal = (
    type: 'price_drop' | 'delivery_alert',
    platformName?: string
  ) => {
    setModalInitialType(type);
    setModalInitialPlatform(platformName);
    setModalOpen(true);
  };

  const handleSaveAlert = (newAlert: Omit<TrackedAlert, 'id' | 'createdAt'>) => {
    setAlerts((prev) => [
      {
        ...newAlert,
        id: `alert-${Date.now()}`,
        createdAt: 'Just now',
      },
      ...prev,
    ]);
  };

  const resolveOrderLink = (platform: PlatformEntry) => {
    if (platform.product_url && platform.product_url.trim().length > 0) {
      return {
        href: platform.product_url,
        label: `View on ${platform.name}`,
      };
    }
    if (platform.search_url && platform.search_url.trim().length > 0) {
      return {
        href: platform.search_url,
        label: `Search on ${platform.name}`,
      };
    }
    return {
      href: getPlatformFallbackSiteUrl(platform.name),
      label: `Visit ${platform.name}`,
    };
  };

  const hasLiveData = comparison.data_mode === 'live';

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
          <a
            href="#top"
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap"
          >
            QuickHatke
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a
              href="#comparator"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
            >
              Product Search
            </a>
            <a
              href="#extension-architecture"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
            >
              Chrome Extension & Matcher
            </a>
            <a
              href="#structured-output"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
            >
              Matrix & JSON
            </a>
            <a
              href="#alerts"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap"
            >
              Price Alerts ({alerts.length})
            </a>
          </nav>

          {/* Production vs Isolated Demo Mode Switch */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => handleToggleDemoMode(false)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  !isDemoMode
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Production Mode
              </button>
              <button
                type="button"
                onClick={() => handleToggleDemoMode(true)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  isDemoMode
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                DEMO MODE
              </button>
            </div>
          </div>
        </div>
      </header>

      {isDemoMode && (
        <div className="bg-amber-500 text-slate-950 px-6 py-2 text-xs font-bold text-center">
          DEMO MODE ACTIVE — Using isolated development mock adapters (BlinkitMockAdapter, ZeptoMockAdapter, MinutesMockAdapter, AmazonMockAdapter). Switch to Production Mode for real extension/adapter data.
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Search & Product Disambiguation Section */}
        <section id="comparator" className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-5">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs font-medium text-slate-500">
                Buyhatke-Style Browser Extension + Quick-Commerce Comparator · Blinkit · Zepto · Flipkart Minutes · Amazon Minutes
              </p>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 mt-1 tracking-tight">
                Real Cross-Platform Quick-Commerce Price & Availability Comparison
              </h1>
            </div>
            <div className="text-xs font-mono text-slate-500 shrink-0">
              {formatRelativeTime(comparison.retrieved_at)}
              {comparison.cached ? ' · Cached' : ''}
            </div>
          </div>

          <form onSubmit={handleSearchFormSubmit} className="space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder='Search product or category: e.g., "Classmate notebook A4", "notebook", "Amul Taaza Milk 1L", "Surf Excel 1kg"'
                  className="w-full pl-10 pr-4 py-3 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                  aria-label="Product search query"
                />
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <select
                  value={selectedCity}
                  onChange={(e) => {
                    const nextCity = e.target.value;
                    setSelectedCity(nextCity);
                  }}
                  aria-label="Select delivery location"
                  className="px-3.5 py-3 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {CITIES.map((city) => (
                    <option key={city} value={city}>
                      📍 {city}
                    </option>
                  ))}
                </select>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Search & Compare
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Test Queries */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 mr-1">Try searches:</span>
                {QUICK_SEARCH_EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => {
                      setQueryInput(ex.query);
                      executeComparison({ customQuery: ex.query, forceRefresh: true });
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      queryInput.toLowerCase() === ex.query.toLowerCase()
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleRunOptionalAiAssist}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Optional AI Query Analysis
              </button>
            </div>
          </form>

          {/* Optional AI Assistance Status (Graceful 503 handling) */}
          {aiStatus !== 'idle' && aiMessage && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                aiStatus === 'available'
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0" />
                <span>{aiMessage}</span>
              </div>
              {aiStatus === 'unavailable_503' && (
                <button
                  type="button"
                  onClick={handleRunOptionalAiAssist}
                  className="px-2.5 py-1 font-semibold bg-white border border-amber-300 rounded hover:bg-amber-100 whitespace-nowrap cursor-pointer"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Matching Products Disambiguation Grid (shown for category searches like "notebook", "milk", "detergent", "headphones", "iPhone") */}
          {comparison.matching_products && comparison.matching_products.length > 1 && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-900">
                  🔍 {comparison.normalized_query || queryInput} — Matching products ({comparison.matching_products.length})
                </div>
                <span className="text-xs text-slate-500">
                  Select an exact product variant to compare across platforms
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {comparison.matching_products.map((item) => {
                  const isSelected =
                    comparison.product.toLowerCase() === item.name.toLowerCase();
                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-lg border flex items-start justify-between gap-3 transition-colors ${
                        isSelected
                          ? 'border-slate-900 bg-slate-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{item.icon}</span>
                          <span className="truncate">{item.name}</span>
                        </div>
                        <p className="text-xs text-slate-500">{item.subtitle}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          executeComparison({
                            customQuery: queryInput,
                            selectedProduct: item.name,
                            forceRefresh: true,
                          })
                        }
                        className={`px-2.5 py-1.5 text-xs font-semibold rounded-md shrink-0 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Compare prices'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Honest Data Status Banner when Live Data is Unavailable */}
        {!hasLiveData && !isDemoMode && (
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    No live results available for this search right now.
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {comparison.status_message}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  executeComparison({
                    customQuery: queryInput,
                    selectedProduct: comparison.product,
                    forceRefresh: true,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try Again
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <span className="text-xs font-medium text-slate-500 mr-1">
                Direct platform search for &ldquo;{comparison.product}&rdquo;:
              </span>
              {PLATFORMS_LIST.map((plat) => (
                <a
                  key={plat}
                  href={buildPlatformSearchUrl(plat, comparison.product)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                >
                  <span>Search on {plat}</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Comparison Summary Cards */}
        <section aria-label="Comparison Summary" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">
                {comparison.product}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Location: {selectedCity} · Data Source:{' '}
                <strong className="text-slate-800 uppercase">
                  {comparison.data_mode === 'live'
                    ? 'LIVE DATA'
                    : comparison.data_mode === 'demo'
                    ? 'DEMO DATA (Development Only)'
                    : 'LIVE DATA UNAVAILABLE'}
                </strong>
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span className="font-semibold text-emerald-700">Green = Lowest Price</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-sky-700">Blue = Fastest Delivery</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-amber-700">Gold = Best Overall</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-emerald-300 rounded-xl p-5 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <TrendingDown className="w-4 h-4" />
                  <span>Lowest Price</span>
                </div>
                <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {comparison.best_price || 'Live price unavailable'}
                </p>
                <p className="text-xs text-slate-500">
                  {comparison.metrics.price_difference
                    ? `₹${comparison.metrics.price_difference} (${comparison.metrics.percentage_difference}%) cheaper than highest`
                    : 'Requires retrieved platform price data'}
                </p>
              </div>
            </div>

            <div className="bg-white border border-sky-300 rounded-xl p-5 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700">
                  <Clock className="w-4 h-4" />
                  <span>Fastest Delivery</span>
                </div>
                <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {comparison.fastest_delivery || 'Delivery time unavailable'}
                </p>
                <p className="text-xs text-slate-500">
                  Based on retrieved dark-store ETA for {selectedCity}
                </p>
              </div>
            </div>

            <div className="bg-white border border-amber-300 rounded-xl p-5 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <Award className="w-4 h-4" />
                  <span>Best Overall Value</span>
                </div>
                <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {comparison.best_overall || 'Live data unavailable'}
                </p>
                <p className="text-xs text-slate-500">
                  {comparison.metrics.live_platforms_count} of 4 platforms reporting live data
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Platform Cards & View Controls */}
        <section className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1 mr-1">
                <ArrowUpDown className="w-3.5 h-3.5" />
                Sort by:
              </span>
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                {(
                  [
                    { id: 'default', label: 'Platform Order' },
                    { id: 'price_asc', label: 'Lowest Price' },
                    { id: 'delivery_asc', label: 'Fastest Delivery' },
                    { id: 'offers_first', label: 'Best Offers' },
                  ] as { id: SortOption; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSortBy(opt.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      sortBy === opt.id
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => setOutputMode('split')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    outputMode === 'split'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  All Views
                </button>
                <button
                  type="button"
                  onClick={() => setOutputMode('cards')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    outputMode === 'cards'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setOutputMode('table')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    outputMode === 'table'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  Table
                </button>
                <button
                  type="button"
                  onClick={() => setOutputMode('json')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    outputMode === 'json'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  JSON
                </button>
              </div>
            </div>
          </div>

          {(outputMode === 'split' || outputMode === 'cards') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {displayedPlatforms.map((platform) => {
                const isBestPrice = winnerFlags.isBestPrice(platform);
                const isFastest = winnerFlags.isFastestDelivery(platform);
                const isBestOverall = winnerFlags.isBestOverall(platform);

                const borderClass = isBestOverall
                  ? 'border-amber-400 ring-1 ring-amber-400/50'
                  : isBestPrice
                  ? 'border-emerald-400 ring-1 ring-emerald-400/50'
                  : isFastest
                  ? 'border-sky-400 ring-1 ring-sky-400/50'
                  : 'border-slate-200';

                const orderLink = resolveOrderLink(platform);

                return (
                  <article
                    key={platform.name}
                    className={`bg-white border ${borderClass} rounded-xl p-5 flex flex-col justify-between`}
                  >
                    <div>
                      {/* Data Source Status Header */}
                      <div className="flex items-center justify-between gap-2 mb-2.5 text-xs">
                        <span
                          className={`font-semibold flex items-center gap-1 ${
                            platform.data_status === 'live'
                              ? 'text-emerald-700'
                              : platform.data_status === 'demo'
                              ? 'text-amber-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {platform.data_status === 'live' ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              LIVE · {formatRelativeTime(platform.retrieved_at).replace(/^Updated/i, 'Captured')}
                            </>
                          ) : platform.source === 'simulator' || platform.data_status === 'demo' ? (
                            'Source: SIMULATOR'
                          ) : (
                            'LIVE DATA UNAVAILABLE'
                          )}
                        </span>

                        {platform.match_confidence !== null && (
                          <span className="font-mono text-slate-500">
                            Match {Math.round(platform.match_confidence * 100)}%
                          </span>
                        )}
                      </div>

                      {/* Platform Logo, Name & Product */}
                      <div className="flex items-start gap-3 pb-3.5 border-b border-slate-100">
                        <PlatformLogo name={platform.name} size="md" />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-bold text-slate-900 leading-snug">
                            {platform.name}
                          </h3>
                          <p
                            className="text-xs font-medium text-slate-600 truncate mt-0.5"
                            title={platform.product_name}
                          >
                            {platform.product_name}
                          </p>
                        </div>
                      </div>

                      {/* Price & Delivery */}
                      <div className="py-3.5 flex items-baseline justify-between">
                        <div>
                          <span className="text-xs text-slate-500 block">Price</span>
                          {platform.price ? (
                            <span
                              className={`font-mono text-2xl font-bold tabular-nums ${
                                isBestPrice ? 'text-emerald-700' : 'text-slate-900'
                              }`}
                            >
                              {platform.price}
                            </span>
                          ) : (
                            <span className="font-mono text-sm font-semibold text-slate-400">
                              ₹-- (Unavailable)
                            </span>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-xs text-slate-500 block">Delivery</span>
                          <span
                            className={`font-mono text-sm font-semibold tabular-nums ${
                              isFastest ? 'text-sky-700' : 'text-slate-700'
                            }`}
                          >
                            {platform.delivery_time || '--'}
                          </span>
                        </div>
                      </div>

                      {/* Offer & Stock */}
                      <div className="py-2.5 border-t border-slate-100 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500">Offer</span>
                          <span className="font-medium text-slate-700">
                            {platform.offer || 'None reported'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500">Stock</span>
                          <span className="font-medium text-slate-700">
                            {platform.data_status === 'live' && platform.stock === 'Available'
                              ? 'In stock'
                              : platform.stock}
                          </span>
                        </div>
                        {platform.source === 'simulator' && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500">Source</span>
                            <span className="font-mono font-bold text-amber-700">
                              Source: SIMULATOR
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* External Platform Link & Alerts */}
                    <div className="pt-3 mt-2 border-t border-slate-100 space-y-2">
                      <a
                        href={orderLink.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full"
                      >
                        <button
                          type="button"
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-3.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <span>🛒 {orderLink.label} →</span>
                          <ExternalLink className="w-3.5 h-3.5 opacity-80 shrink-0" />
                        </button>
                      </a>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => openAlertModal('price_drop', platform.name)}
                          className="flex items-center justify-center gap-1 py-1.5 px-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 rounded-md transition-colors cursor-pointer"
                        >
                          <TrendingDown className="w-3 h-3" />
                          Track Price
                        </button>
                        <button
                          type="button"
                          onClick={() => openAlertModal('delivery_alert', platform.name)}
                          className="flex items-center justify-center gap-1 py-1.5 px-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-sky-50 hover:text-sky-800 rounded-md transition-colors cursor-pointer"
                        >
                          <Clock className="w-3 h-3" />
                          ETA Alert
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Browser Extension Workbench & Deterministic Equivalence Matcher */}
        <ExtensionWorkbench
          comparison={comparison}
          selectedCity={selectedCity}
          isDemoMode={isDemoMode}
          onObservationCaptured={async (opts) => {
            if (opts?.activateDemoMode && !isDemoMode) {
              setIsDemoMode(true);
            }
            const nextProd = opts?.productName || comparison.product;
            if (opts?.productName) {
              setQueryInput(opts.productName);
            }
            return executeComparison({
              customQuery: nextProd,
              selectedProduct: nextProd,
              demoOverride: opts?.activateDemoMode ? true : isDemoMode,
              forceRefresh: true,
            });
          }}
        />

        {/* Tabular Comparison Matrix & Structured JSON */}
        <section
          id="structured-output"
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        >
          {(outputMode === 'split' || outputMode === 'table') && (
            <div
              className={`${
                outputMode === 'table' ? 'lg:col-span-12' : 'lg:col-span-7'
              } bg-white border border-slate-200 rounded-xl overflow-hidden`}
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Tabular Platform Comparison
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Shows retrieved platform data or explicit unavailable status
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500">
                  {displayedPlatforms.length} platforms
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Platform</th>
                      <th className="py-3 px-4">Data Status</th>
                      <th className="py-3 px-4 text-right">Price</th>
                      <th className="py-3 px-4 text-right">Delivery</th>
                      <th className="py-3 px-4">Stock</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {displayedPlatforms.map((platform) => {
                      const orderLink = resolveOrderLink(platform);
                      return (
                        <tr key={platform.name} className="hover:bg-slate-50/80">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <PlatformLogo name={platform.name} size="sm" />
                              <span className="font-semibold text-slate-900">
                                {platform.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-semibold">
                            {platform.data_status === 'live' ? (
                              <span className="text-emerald-700">LIVE</span>
                            ) : platform.data_status === 'demo' ? (
                              <span className="text-amber-700">DEMO</span>
                            ) : (
                              <span className="text-slate-400">Live data unavailable</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums">
                            {platform.price || '₹--'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                            {platform.delivery_time || '--'}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            {platform.stock}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <a
                              href={orderLink.href}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                              >
                                <span>{orderLink.label}</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(outputMode === 'split' || outputMode === 'json') && (
            <div
              className={`${
                outputMode === 'json' ? 'lg:col-span-12' : 'lg:col-span-5'
              } bg-slate-900 text-slate-100 border border-slate-800 rounded-xl overflow-hidden`}
            >
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Normalized Adapter Response JSON
                  </h2>
                  <p className="text-xs text-slate-400">
                    Includes normalized_attributes, data_status & retrieved_at
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg cursor-pointer"
                  >
                    {copiedJson ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadJson}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </button>
                </div>
              </div>
              <pre className="p-5 text-xs font-mono leading-relaxed text-emerald-300 overflow-x-auto max-h-[380px]">
                <code>{formattedJsonString}</code>
              </pre>
            </div>
          )}
        </section>

        {/* Price Drop & Delivery Alerts Section */}
        <section id="alerts" className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Saved Price-Drop & Delivery Alerts
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Get notified when the QuickHatke Extension observes a price drop on your target product
              </p>
            </div>
            <button
              type="button"
              onClick={() => openAlertModal('price_drop')}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5" />
              + Add Price Alert
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="border border-slate-200 bg-slate-50/50 rounded-lg p-4 flex items-start justify-between gap-2"
              >
                <div>
                  <span className="text-xs font-semibold text-slate-600">
                    {alert.platform} · {alert.city}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                    {alert.product}
                  </h3>
                  <p className="text-xs font-mono text-emerald-700 mt-1">
                    Target: {alert.targetValue}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAlerts((prev) => prev.filter((a) => a.id !== alert.id))
                  }
                  className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                  aria-label="Delete alert"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-5 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            QuickHatke · Real Quick-Commerce Browser Extension & Comparison Dashboard (Zero fabricated prices; external platform authentication remains strictly on Blinkit, Zepto, Flipkart, and Amazon)
          </p>
          <a
            href="/extension/manifest.json"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 underline underline-offset-4"
          >
            View Chrome Extension Manifest V3
          </a>
        </div>
      </footer>

      <AlertModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        product={comparison.product}
        city={selectedCity}
        platforms={comparison.platforms}
        initialType={modalInitialType}
        initialPlatform={modalInitialPlatform}
        onSaveAlert={handleSaveAlert}
      />
    </div>
  );
}
