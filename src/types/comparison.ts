import {
  type NormalizedProductAttributes,
  type ProductMatchEvaluation,
  normalizeProductAttributes,
  evaluateProductMatch,
} from '../shared/normalization';

export type DataStatus =
  | 'live'
  | 'demo'
  | 'unavailable'
  | 'error'
  | 'stale'
  | 'platform_unavailable'
  | 'product_unavailable';

export type SearchSystemState =
  | 'loading'
  | 'results_found'
  | 'no_results'
  | 'network_failure'
  | 'api_failure'
  | 'platform_unavailable'
  | 'product_unavailable'
  | 'invalid_search'
  | 'live_data_unavailable';

export interface ProductMatch {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  icon: string;
  attributes: NormalizedProductAttributes;
}

export interface PlatformEntry {
  platform: string;
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
  price: string | null;
  numeric_price: number | null;
  discount: string | null;
  offer: string | null;
  offer_adjusted_price: number | null;
  delivery_time: string | null;
  delivery_fee: number | null;
  estimated_total_payable: number | null;
  stock: string;
  product_url: string | null;
  search_url: string;
  order_action: string;
  location: string;
  data_status: DataStatus;
  source?: 'extension' | 'simulator' | null;
  status_reason: string;
  retrieved_at: string;
  match_confidence: number | null;
}

export interface ComparisonMetrics {
  live_platforms_count: number;
  lowest_price_platform: string | null;
  lowest_price: number | null;
  highest_price: number | null;
  price_difference: number | null;
  percentage_difference: number | null;
  fastest_delivery_platform: string | null;
  fastest_delivery_time: string | null;
}

export interface ComparisonResult {
  product: string;
  normalized_query: string;
  normalized_attributes: NormalizedProductAttributes;
  location: string;
  is_category_search: boolean;
  search_state: SearchSystemState;
  data_mode: 'live' | 'demo' | 'unavailable';
  status_message: string;
  cached: boolean;
  retrieved_at: string;
  ai_assistance_status?: 'not_requested' | 'available' | 'unavailable_503';
  ai_assistance_message?: string;
  matching_products: ProductMatch[];
  platforms: PlatformEntry[];
  metrics: ComparisonMetrics;
  best_price: string | null;
  fastest_delivery: string | null;
  best_overall: string | null;
}

export interface TrackedAlert {
  id: string;
  product: string;
  platform: string;
  type: 'price_drop' | 'delivery_alert';
  targetValue: string;
  currentValue: string;
  city: string;
  createdAt: string;
  simulatedTriggered?: boolean;
}

export type SortOption = 'default' | 'price_asc' | 'delivery_asc' | 'offers_first';
export type OutputMode = 'cards' | 'table' | 'split' | 'json';

export const PLATFORMS_LIST = [
  'Blinkit',
  'Zepto',
  'Flipkart Minutes',
  'Amazon Minutes',
] as const;

export function normalizeSearchQuery(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ');
}

export function formatDisplayQueryTitle(raw: string | null | undefined): string {
  const cleaned = normalizeSearchQuery(raw);
  if (!cleaned) return '';
  const withoutPrefix = cleaned
    .replace(/^compare\s+/i, '')
    .replace(/\s+across\s+blinkit.*$/i, '')
    .trim();
  return withoutPrefix || cleaned;
}

export function isValidSearchQuery(raw: string | null | undefined): boolean {
  const cleaned = normalizeSearchQuery(raw);
  if (cleaned.length === 0) return false;
  return /[a-zA-Z0-9]/.test(cleaned);
}

export function buildPlatformSearchUrl(
  platformName: string | null | undefined,
  productQuery: string | null | undefined
): string {
  const cleanProduct = formatDisplayQueryTitle(productQuery) || 'groceries';
  const encoded = encodeURIComponent(cleanProduct);
  const normalized = (platformName || '').toLowerCase();

  if (normalized.includes('blinkit')) {
    return `https://blinkit.com/s/?q=${encoded}`;
  }
  if (normalized.includes('flipkart')) {
    return `https://www.flipkart.com/search?q=${encoded}`;
  }
  if (normalized.includes('amazon')) {
    return `https://www.amazon.in/s?k=${encoded}`;
  }
  if (normalized.includes('zepto')) {
    return `https://www.zeptonow.com/search?query=${encoded}`;
  }
  return `https://www.google.com/search?q=${encoded}`;
}

export function getPlatformFallbackSiteUrl(platformName: string | null | undefined): string {
  const normalized = (platformName || '').toLowerCase();
  if (normalized.includes('blinkit')) return 'https://blinkit.com';
  if (normalized.includes('flipkart')) return 'https://www.flipkart.com';
  if (normalized.includes('amazon')) return 'https://www.amazon.in';
  if (normalized.includes('zepto')) return 'https://www.zeptonow.com';
  return 'https://www.google.com';
}

export function getCanonicalPlatformName(platformName: string | null | undefined): string {
  const normalized = (platformName || '').toLowerCase();
  if (normalized.includes('blinkit')) return 'Blinkit';
  if (normalized.includes('flipkart')) return 'Flipkart Minutes';
  if (normalized.includes('amazon')) return 'Amazon Minutes';
  if (normalized.includes('zepto')) return 'Zepto';
  return (platformName || 'Platform').trim() || 'Platform';
}

export function getStandardOrderAction(
  platformName: string | null | undefined,
  exactProductUrl: string | null | undefined
): string {
  const canonicalName = getCanonicalPlatformName(platformName);
  if (exactProductUrl && exactProductUrl.trim().length > 0) {
    return `Order on ${canonicalName}`;
  }
  return `Search on ${canonicalName}`;
}

function makeCatalogEntry(
  id: string,
  name: string,
  subtitle: string,
  category: string,
  icon: string
): ProductMatch {
  return {
    id,
    name,
    subtitle,
    category,
    icon,
    attributes: normalizeProductAttributes(`${name} ${subtitle}`),
  };
}

/**
 * Deterministic product & category catalog for disambiguating broad queries
 * like "notebook", "milk", "detergent", "headphones", "iPhone", "biscuits", "washing machine".
 * Contains zero fabricated prices.
 */
export const PRODUCT_CATALOG: {
  keywords: string[];
  isCategory: boolean;
  matches: ProductMatch[];
}[] = [
  {
    keywords: ['notebook', 'notebooks', 'copy', 'register', 'stationery', 'classmate', 'navneet'],
    isCategory: true,
    matches: [
      makeCatalogEntry(
        'nb-classmate-a4-172',
        'Classmate Notebook A4 Single Line (172 Pages)',
        'Brand: Classmate · Size: A4 · Single Line · 172 pages',
        'Notebook & Stationery',
        '📓'
      ),
      makeCatalogEntry(
        'nb-navneet-a4-192',
        'Navneet Youva Long Book A4 (192 Pages)',
        'Brand: Navneet · Size: A4 · Long Book · 192 pages',
        'Notebook & Stationery',
        '📓'
      ),
      makeCatalogEntry(
        'nb-classmate-single-180',
        'Classmate Single Line Regular Notebook (180 Pages)',
        'Brand: Classmate · Size: Regular · Single Line · 180 pages',
        'Notebook & Stationery',
        '📓'
      ),
      makeCatalogEntry(
        'nb-a4-ruled-200',
        'Classmate A4 Unruled Notebook (200 Pages)',
        'Brand: Classmate · Size: A4 · Unruled · 200 pages',
        'Notebook & Stationery',
        '📓'
      ),
      makeCatalogEntry(
        'nb-spiral-a4-200',
        'Classmate Spiral Notebook A4 (200 Pages)',
        'Brand: Classmate · Size: A4 · Spiral · 200 pages',
        'Notebook & Stationery',
        '📓'
      ),
    ],
  },
  {
    keywords: ['milk', 'amul milk', 'toned milk', 'dairy', 'cow milk', 'full cream milk', 'amul'],
    isCategory: true,
    matches: [
      makeCatalogEntry(
        'milk-amul-taaza-1l',
        'Amul Taaza Toned Milk 1L',
        'Brand: Amul · Variant: Taaza · Volume: 1L (1000ml)',
        'Dairy & Milk',
        '🥛'
      ),
      makeCatalogEntry(
        'milk-amul-gold-1l',
        'Amul Gold Full Cream Milk 1L',
        'Brand: Amul · Variant: Gold · Volume: 1L (1000ml)',
        'Dairy & Milk',
        '🥛'
      ),
      makeCatalogEntry(
        'milk-amul-taaza-500ml',
        'Amul Taaza Fresh Toned Milk 500ml',
        'Brand: Amul · Variant: Taaza · Volume: 500ml',
        'Dairy & Milk',
        '🥛'
      ),
      makeCatalogEntry(
        'milk-amul-cow-500ml',
        'Amul Cow Milk 500ml',
        'Brand: Amul · Variant: Cow Milk · Volume: 500ml',
        'Dairy & Milk',
        '🥛'
      ),
      makeCatalogEntry(
        'milk-mother-dairy-1l',
        'Mother Dairy Toned Milk 1L',
        'Brand: Mother Dairy · Volume: 1L (1000ml)',
        'Dairy & Milk',
        '🥛'
      ),
    ],
  },
  {
    keywords: ['detergent', 'washing powder', 'laundry', 'surf excel', 'ariel', 'tide'],
    isCategory: true,
    matches: [
      makeCatalogEntry(
        'det-surf-excel-1kg',
        'Surf Excel Easy Wash Detergent Powder 1kg',
        'Brand: Surf Excel · Variant: Easy Wash · Weight: 1kg (1000g)',
        'Detergent & Laundry',
        '🧺'
      ),
      makeCatalogEntry(
        'det-surf-excel-1.5kg',
        'Surf Excel Easy Wash Detergent Powder 1.5kg',
        'Brand: Surf Excel · Variant: Easy Wash · Weight: 1.5kg (1500g)',
        'Detergent & Laundry',
        '🧺'
      ),
      makeCatalogEntry(
        'det-ariel-matic-2kg',
        'Ariel Matic Front Load Detergent Powder 2kg',
        'Brand: Ariel · Variant: Matic Front Load · Weight: 2kg (2000g)',
        'Detergent & Laundry',
        '🧺'
      ),
      makeCatalogEntry(
        'det-tide-plus-2kg',
        'Tide Plus Double Power Detergent Powder 2kg',
        'Brand: Tide · Variant: Double Power · Weight: 2kg (2000g)',
        'Detergent & Laundry',
        '🧺'
      ),
      makeCatalogEntry(
        'det-surf-matic-liquid-1l',
        'Surf Excel Matic Top Load Liquid Detergent 1L',
        'Brand: Surf Excel · Variant: Matic Top Load · Volume: 1L (1000ml)',
        'Detergent & Laundry',
        '🧺'
      ),
    ],
  },
  {
    keywords: ['iphone', 'apple iphone', 'iphone 16', 'iphone 15', 'smartphone'],
    isCategory: true,
    matches: [
      makeCatalogEntry(
        'ip-16-128-black',
        'Apple iPhone 16 128GB Black',
        'Brand: Apple · Variant: iPhone 16 · Storage: 128GB',
        'Smartphones & Electronics',
        '📱'
      ),
      makeCatalogEntry(
        'ip-16-256-ultramarine',
        'Apple iPhone 16 256GB Ultramarine',
        'Brand: Apple · Variant: iPhone 16 · Storage: 256GB',
        'Smartphones & Electronics',
        '📱'
      ),
      makeCatalogEntry(
        'ip-15-128-blue',
        'Apple iPhone 15 128GB Blue',
        'Brand: Apple · Variant: iPhone 15 · Storage: 128GB',
        'Smartphones & Electronics',
        '📱'
      ),
      makeCatalogEntry(
        'ip-16-plus-128',
        'Apple iPhone 16 Plus 128GB Teal',
        'Brand: Apple · Variant: iPhone 16 Plus · Storage: 128GB',
        'Smartphones & Electronics',
        '📱'
      ),
      makeCatalogEntry(
        'ip-charger-20w',
        'Apple 20W USB-C Power Adapter',
        'Brand: Apple · Power: 20W · Official USB-C Charger',
        'Smartphones & Electronics',
        '🔌'
      ),
    ],
  },
  {
    keywords: ['biscuits', 'biscuit', 'cookies', 'cookie', 'parle g', 'good day', 'oreo', 'marie gold'],
    isCategory: true,
    matches: [
      makeCatalogEntry(
        'bis-parle-g-800g',
        'Parle-G Original Gluco Biscuits 800g',
        'Brand: Parle-G · Weight: 800g · Family Pack',
        'Biscuits & Cookies',
        '🍪'
      ),
      makeCatalogEntry(
        'bis-good-day-600g',
        'Britannia Good Day Cashew Cookies 600g',
        'Brand: Britannia · Weight: 600g · Cashew',
        'Biscuits & Cookies',
        '🍪'
      ),
      makeCatalogEntry(
        'bis-dark-fantasy-300g',
        'Sunfeast Dark Fantasy Choco Fills 300g',
        'Brand: Sunfeast · Weight: 300g · Choco Creme',
        'Biscuits & Cookies',
        '🍪'
      ),
      makeCatalogEntry(
        'bis-marie-gold-950g',
        'Britannia Marie Gold Biscuits 950g',
        'Brand: Britannia · Weight: 950g · Tea Time Pack',
        'Biscuits & Cookies',
        '🍪'
      ),
      makeCatalogEntry(
        'bis-oreo-288g',
        'Cadbury Oreo Vanilla Creme Biscuits 288g',
        'Brand: Cadbury · Weight: 288g · Family Pack',
        'Biscuits & Cookies',
        '🍪'
      ),
    ],
  },
  {
    keywords: ['washing machine', 'washer', 'laundry machine', 'front load', 'top load'],
    isCategory: true,
    matches: [
      makeCatalogEntry(
        'wm-lg-7kg-top',
        'LG 7kg 5 Star Smart Inverter Top Load Washing Machine',
        'Brand: LG · Capacity: 7kg · Top Load',
        'Washing Machines & Appliances',
        '🫧'
      ),
      makeCatalogEntry(
        'wm-samsung-7kg-ecobubble',
        'Samsung 7kg EcoBubble Top Load Washing Machine',
        'Brand: Samsung · Capacity: 7kg · Top Load',
        'Washing Machines & Appliances',
        '🫧'
      ),
      makeCatalogEntry(
        'wm-bosch-7kg-front',
        'Bosch 7kg 5 Star Front Load Washing Machine',
        'Brand: Bosch · Capacity: 7kg · Front Load',
        'Washing Machines & Appliances',
        '🫧'
      ),
      makeCatalogEntry(
        'wm-whirlpool-7kg-semi',
        'Whirlpool 7kg 5 Star Semi-Automatic Washing Machine',
        'Brand: Whirlpool · Capacity: 7kg · Semi-Automatic',
        'Washing Machines & Appliances',
        '🫧'
      ),
    ],
  },
  {
    keywords: ['headphones', 'headphone', 'earphones', 'earbuds', 'headset', 'boat', 'sony headphones'],
    isCategory: true,
    matches: [
      makeCatalogEntry(
        'hp-boat-rockerz-450',
        'boAt Rockerz 450 Wireless On-Ear Headphones',
        'Brand: boAt · Model: Rockerz 450 · Bluetooth On-Ear',
        'Audio & Headphones',
        '🎧'
      ),
      makeCatalogEntry(
        'hp-sony-wh-ch520',
        'Sony WH-CH520 Wireless Bluetooth Headphones',
        'Brand: Sony · Model: WH-CH520 · 50 HRS Battery',
        'Audio & Headphones',
        '🎧'
      ),
      makeCatalogEntry(
        'hp-jbl-tune-510bt',
        'JBL Tune 510BT Wireless On-Ear Headphones',
        'Brand: JBL · Model: Tune 510BT · Pure Bass',
        'Audio & Headphones',
        '🎧'
      ),
      makeCatalogEntry(
        'hp-sony-wh1000xm5',
        'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
        'Brand: Sony · Model: WH-1000XM5 · Active Noise Cancelling',
        'Audio & Headphones',
        '🎧'
      ),
      makeCatalogEntry(
        'hp-noise-two',
        'Noise Two Wireless On-Ear Headphones',
        'Brand: Noise · 50 HRS Playtime · Low Latency',
        'Audio & Headphones',
        '🎧'
      ),
    ],
  },
];

export function findCatalogMatchesForQuery(rawQuery: string): {
  normalizedQuery: string;
  normalizedAttributes: NormalizedProductAttributes;
  isCategorySearch: boolean;
  matches: ProductMatch[];
  exactSelectedProduct: string | null;
} {
  const cleaned = formatDisplayQueryTitle(rawQuery);
  const lower = cleaned.toLowerCase();
  const attrs = normalizeProductAttributes(cleaned);

  if (!lower) {
    return {
      normalizedQuery: '',
      normalizedAttributes: attrs,
      isCategorySearch: false,
      matches: [],
      exactSelectedProduct: null,
    };
  }

  for (const group of PRODUCT_CATALOG) {
    for (const item of group.matches) {
      if (item.name.toLowerCase() === lower) {
        return {
          normalizedQuery: item.name,
          normalizedAttributes: item.attributes,
          isCategorySearch: false,
          matches: group.matches,
          exactSelectedProduct: item.name,
        };
      }
    }
  }

  for (const group of PRODUCT_CATALOG) {
    const matchedKeyword = group.keywords.some(
      (kw) => lower === kw || lower.includes(kw) || kw.includes(lower)
    );
    if (matchedKeyword) {
      const hasSpecificSizeOrModel =
        Boolean(attrs.quantity) ||
        Boolean(attrs.size && attrs.brand) ||
        Boolean(attrs.variant && attrs.brand);

      return {
        normalizedQuery: cleaned,
        normalizedAttributes: attrs,
        isCategorySearch: !hasSpecificSizeOrModel,
        matches: group.matches,
        exactSelectedProduct: hasSpecificSizeOrModel ? cleaned : null,
      };
    }
  }

  const wordCount = cleaned.split(/\s+/).length;
  const hasSpecificConstraint = Boolean(attrs.quantity || attrs.size || attrs.variant);
  const titleCased = cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  if (wordCount <= 2 && !hasSpecificConstraint) {
    const generatedMatches: ProductMatch[] = [
      makeCatalogEntry(
        `gen-standard-${lower}`,
        `${titleCased} (Standard Pack)`,
        'Standard Pack · Select to compare across platforms',
        attrs.category,
        '🛍️'
      ),
      makeCatalogEntry(
        `gen-large-${lower}`,
        `${titleCased} (Large Family Pack)`,
        'Family Value Pack · Select to compare across platforms',
        attrs.category,
        '📦'
      ),
    ];
    return {
      normalizedQuery: cleaned,
      normalizedAttributes: attrs,
      isCategorySearch: true,
      matches: generatedMatches,
      exactSelectedProduct: null,
    };
  }

  return {
    normalizedQuery: titleCased,
    normalizedAttributes: attrs,
    isCategorySearch: false,
    matches: [
      makeCatalogEntry(
        `exact-${lower}`,
        titleCased,
        `Brand: ${attrs.brand || 'Unspecified'} · Quantity: ${attrs.quantity || 'Standard'}`,
        attrs.category,
        '🔎'
      ),
    ],
    exactSelectedProduct: titleCased,
  };
}

export function buildUnavailableLiveComparison(
  productName: string,
  location: string = 'Bengaluru',
  options?: {
    normalizedQuery?: string;
    isCategorySearch?: boolean;
    matchingProducts?: ProductMatch[];
    searchState?: SearchSystemState;
    statusMessage?: string;
  }
): ComparisonResult {
  const cleanProduct = formatDisplayQueryTitle(productName) || 'Product';
  const attrs = normalizeProductAttributes(cleanProduct);
  const nowIso = new Date().toISOString();

  const platforms: PlatformEntry[] = PLATFORMS_LIST.map((platformName) => {
    const searchUrl = buildPlatformSearchUrl(platformName, cleanProduct);
    return {
      platform: platformName,
      name: platformName,
      product_name: cleanProduct,
      brand: attrs.brand,
      category: attrs.category,
      variant: attrs.variant,
      size: attrs.size,
      quantity: attrs.quantity,
      pages: attrs.pages,
      weight: attrs.weight,
      volume: attrs.volume,
      pack_count: attrs.pack_count,
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
      search_url: searchUrl,
      order_action: `Search on ${platformName}`,
      location,
      data_status: 'unavailable',
      status_reason: `Live data unavailable (No authorized ${platformName} partner feed configured)`,
      retrieved_at: nowIso,
      match_confidence: null,
    };
  });

  return {
    product: cleanProduct,
    normalized_query: options?.normalizedQuery || cleanProduct,
    normalized_attributes: attrs,
    location,
    is_category_search: options?.isCategorySearch ?? false,
    search_state: options?.searchState || 'live_data_unavailable',
    data_mode: 'unavailable',
    status_message:
      options?.statusMessage ||
      'Live platform pricing and stock are currently unavailable because no authorized partner/affiliate feed is connected. Use the verified platform search buttons below to check real-time prices and availability directly on Blinkit, Zepto, Flipkart Minutes, and Amazon Minutes.',
    cached: false,
    retrieved_at: nowIso,
    ai_assistance_status: 'not_requested',
    matching_products: options?.matchingProducts || [],
    platforms,
    metrics: {
      live_platforms_count: 0,
      lowest_price_platform: null,
      lowest_price: null,
      highest_price: null,
      price_difference: null,
      percentage_difference: null,
      fastest_delivery_platform: null,
      fastest_delivery_time: null,
    },
    best_price: null,
    fastest_delivery: null,
    best_overall: null,
  };
}

export const INITIAL_COMPARISON_STATE: ComparisonResult = buildUnavailableLiveComparison(
  'Classmate Notebook A4 Single Line (172 Pages)',
  'Bengaluru',
  {
    normalizedQuery: 'Classmate notebook A4',
    isCategorySearch: false,
    matchingProducts: PRODUCT_CATALOG[0].matches,
  }
);

export const INITIAL_AMUL_MILK_COMPARISON = INITIAL_COMPARISON_STATE;

export const QUICK_SEARCH_EXAMPLES: { label: string; query: string }[] = [
  { label: 'Classmate notebook A4', query: 'Classmate notebook A4' },
  { label: 'notebook', query: 'notebook' },
  { label: 'Amul Taaza Milk 1L', query: 'Amul Taaza Milk 1L' },
  { label: 'Surf Excel 1kg', query: 'Surf Excel 1kg' },
  { label: 'headphones', query: 'headphones' },
  { label: 'iPhone', query: 'iPhone' },
  { label: 'detergent', query: 'detergent' },
  { label: 'biscuits', query: 'biscuits' },
];

export function parseNumericPrice(priceStr: string | number | null | undefined): number {
  if (typeof priceStr === 'number') return priceStr > 0 ? priceStr : 999999;
  if (!priceStr || typeof priceStr !== 'string') return 999999;
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  if (!cleaned) return 999999;
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 999999 : parsed;
}

export function parseNumericMinutes(timeStr: string | number | null | undefined): number {
  if (typeof timeStr === 'number') return timeStr > 0 ? timeStr : 999;
  if (!timeStr || typeof timeStr !== 'string') return 999;
  const cleaned = timeStr.replace(/[^0-9.]/g, '');
  if (!cleaned) return 999;
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 999 : parsed;
}

export function hasActiveOffer(offerStr: string | null | undefined): boolean {
  if (!offerStr || typeof offerStr !== 'string') return false;
  const normalized = offerStr.trim().toLowerCase();
  return (
    normalized !== 'none' &&
    normalized !== 'n/a' &&
    normalized !== '-' &&
    normalized !== 'null' &&
    !normalized.includes('unavailable') &&
    normalized.length > 0
  );
}

export { normalizeProductAttributes, evaluateProductMatch };
export type { NormalizedProductAttributes, ProductMatchEvaluation };
