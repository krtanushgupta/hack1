export interface NormalizedProductAttributes {
  raw_input: string;
  product_name: string;
  brand: string | null;
  category: string;
  variant: string | null;
  size: string | null;
  quantity: string | null;
  unit: 'ml' | 'g' | 'gb' | 'tb' | 'pages' | 'pcs' | 'w' | null;
  normalized_quantity_value: number | null;
  pack_count: number;
  weight: string | null;
  volume: string | null;
  pages: number | null;
}

export interface ProductMatchEvaluation {
  target: NormalizedProductAttributes;
  candidate: NormalizedProductAttributes;
  match_confidence: number;
  is_equivalent: boolean;
  matched_attributes: string[];
  mismatch_reasons: string[];
}

const KNOWN_BRANDS: { name: string; patterns: RegExp[] }[] = [
  { name: 'Amul', patterns: [/\bamul\b/i] },
  { name: 'Mother Dairy', patterns: [/\bmother\s+dairy\b/i] },
  { name: 'Nandini', patterns: [/\bnandini\b/i] },
  { name: 'Classmate', patterns: [/\bclassmate\b/i] },
  { name: 'Navneet', patterns: [/\bnavneet\b/i, /\byouva\b/i] },
  { name: 'Surf Excel', patterns: [/\bsurf\s*excel\b/i] },
  { name: 'Ariel', patterns: [/\bariel\b/i] },
  { name: 'Tide', patterns: [/\btide\b/i] },
  { name: 'Rin', patterns: [/\brin\b/i] },
  { name: 'Apple', patterns: [/\bapple\b/i, /\biphone\b/i] },
  { name: 'Sony', patterns: [/\bsony\b/i] },
  { name: 'boAt', patterns: [/\bboat\b/i, /\brockerz\b/i] },
  { name: 'JBL', patterns: [/\bjbl\b/i] },
  { name: 'Noise', patterns: [/\bnoise\b/i] },
  { name: 'Parle-G', patterns: [/\bparle[\s-]*g\b/i, /\bparle\b/i] },
  { name: 'Britannia', patterns: [/\bbritannia\b/i, /\bgood\s*day\b/i, /\bmarie\s*gold\b/i] },
  { name: 'Sunfeast', patterns: [/\bsunfeast\b/i, /\bdark\s*fantasy\b/i, /\byippee\b/i] },
  { name: 'Cadbury', patterns: [/\bcadbury\b/i, /\boreo\b/i] },
  { name: 'LG', patterns: [/\blg\b/i] },
  { name: 'Samsung', patterns: [/\bsamsung\b/i] },
  { name: 'Bosch', patterns: [/\bbosch\b/i] },
  { name: 'Whirlpool', patterns: [/\bwhirlpool\b/i] },
  { name: 'IFB', patterns: [/\bifb\b/i] },
  { name: 'Aashirvaad', patterns: [/\baashirvaad\b/i] },
  { name: 'Pillsbury', patterns: [/\bpillsbury\b/i] },
  { name: 'Fortune', patterns: [/\bfortune\b/i] },
  { name: 'Maggi', patterns: [/\bmaggi\b/i] },
  { name: 'Nissin', patterns: [/\bnissin\b/i, /\btop\s*ramen\b/i] },
  { name: 'Coca-Cola', patterns: [/\bcoca[\s-]*cola\b/i, /\bcoke\b/i] },
];

const CATEGORY_PATTERNS: { category: string; patterns: RegExp[] }[] = [
  {
    category: 'Notebook & Stationery',
    patterns: [/\bnotebook\b/i, /\bnotebooks\b/i, /\blong\s*book\b/i, /\bsingle\s*line\b/i, /\bspiral\b/i, /\bpages\b/i],
  },
  {
    category: 'Dairy & Milk',
    patterns: [/\bmilk\b/i, /\btaaza\b/i, /\bdairy\b/i, /\bcurd\b/i, /\bpaneer\b/i, /\bbutter\b/i],
  },
  {
    category: 'Detergent & Laundry',
    patterns: [/\bdetergent\b/i, /\bsurf\s*excel\b/i, /\bariel\b/i, /\btide\b/i, /\brin\b/i, /\bmatic\b/i, /\beasy\s*wash\b/i],
  },
  {
    category: 'Smartphones & Electronics',
    patterns: [/\biphone\b/i, /\bsmartphone\b/i, /\badapter\b/i, /\bcharger\b/i],
  },
  {
    category: 'Audio & Headphones',
    patterns: [/\bheadphones?\b/i, /\bearphones?\b/i, /\bearbuds?\b/i, /\brockerz\b/i, /\bwh[\s-]*ch520\b/i, /\bwh[\s-]*1000xm5\b/i, /\btune\s*510bt\b/i],
  },
  {
    category: 'Biscuits & Cookies',
    patterns: [/\bbiscuits?\b/i, /\bcookies?\b/i, /\bparle[\s-]*g\b/i, /\bgood\s*day\b/i, /\bmarie\s*gold\b/i, /\boreo\b/i, /\bdark\s*fantasy\b/i],
  },
  {
    category: 'Washing Machines & Appliances',
    patterns: [/\bwashing\s*machine\b/i, /\bfront\s*load\b/i, /\btop\s*load\b/i, /\becobubble\b/i, /\bsmart\s*inverter\b/i],
  },
  {
    category: 'Atta & Staples',
    patterns: [/\batta\b/i, /\bchakki\b/i, /\bflour\b/i, /\bmultigrain\b/i],
  },
  {
    category: 'Instant Noodles',
    patterns: [/\bnoodles\b/i, /\bmaggi\b/i, /\byippee\b/i, /\bramen\b/i],
  },
  {
    category: 'Beverages',
    patterns: [/\bcoca[\s-]*cola\b/i, /\bcoke\b/i, /\bzero\s*sugar\b/i],
  },
];

const VARIANT_PATTERNS: { variant: string; pattern: RegExp }[] = [
  { variant: 'Taaza', pattern: /\btaaza\b/i },
  { variant: 'Gold', pattern: /\bgold\b/i },
  { variant: 'Cow Milk', pattern: /\bcow\b/i },
  { variant: 'Single Line', pattern: /\bsingle\s*line\b/i },
  { variant: 'Unruled', pattern: /\bunruled\b/i },
  { variant: 'Long Book', pattern: /\blong\s*(?:book|notebook)\b/i },
  { variant: 'Spiral', pattern: /\bspiral\b/i },
  { variant: 'Easy Wash', pattern: /\beasy\s*wash\b/i },
  { variant: 'Matic Front Load', pattern: /\bmatic\s*front\s*load\b/i },
  { variant: 'Matic Top Load', pattern: /\bmatic\s*top\s*load\b/i },
  { variant: 'Double Power', pattern: /\bdouble\s*power\b/i },
  { variant: 'iPhone 16 Plus', pattern: /\biphone\s*16\s*plus\b/i },
  { variant: 'iPhone 16 Pro', pattern: /\biphone\s*16\s*pro\b/i },
  { variant: 'iPhone 16', pattern: /\biphone\s*16(?!\s*(plus|pro))\b/i },
  { variant: 'iPhone 15', pattern: /\biphone\s*15\b/i },
  { variant: 'Rockerz 450', pattern: /\brockerz\s*450\b/i },
  { variant: 'WH-CH520', pattern: /\bwh[\s-]*ch520\b/i },
  { variant: 'WH-1000XM5', pattern: /\bwh[\s-]*1000xm5\b/i },
  { variant: 'Tune 510BT', pattern: /\btune\s*510bt\b/i },
  { variant: 'Shudh Chakki', pattern: /\bshudh\s*chakki\b/i },
  { variant: 'Multigrain', pattern: /\bmultigrains?\b/i },
  { variant: 'Zero Sugar', pattern: /\bzero\s*sugar\b/i },
];

export function normalizeProductAttributes(rawInput: string): NormalizedProductAttributes {
  const cleaned = (rawInput || '')
    .trim()
    .replace(/^compare\s+/i, '')
    .replace(/\s+across\s+blinkit.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Extract Brand
  let brand: string | null = null;
  for (const b of KNOWN_BRANDS) {
    if (b.patterns.some((p) => p.test(cleaned))) {
      brand = b.name;
      break;
    }
  }

  // 2. Extract Category
  let category = 'General Retail';
  for (const c of CATEGORY_PATTERNS) {
    if (c.patterns.some((p) => p.test(cleaned))) {
      category = c.category;
      break;
    }
  }

  // 3. Extract Variant
  const matchedVariants: string[] = [];
  for (const v of VARIANT_PATTERNS) {
    if (v.pattern.test(cleaned)) {
      matchedVariants.push(v.variant);
    }
  }
  const variant = matchedVariants.length > 0 ? matchedVariants.join(' · ') : null;

  // 4. Extract Paper/Physical Size (e.g., A4, A5, Regular)
  let size: string | null = null;
  const sizeMatch = cleaned.match(/\b(A4|A5|A3|B5|King\s*Size|Regular)\b/i);
  if (sizeMatch) {
    size = sizeMatch[1].toUpperCase();
  }

  // 5. Extract Pack Count (e.g. "4-Pack", "Pack of 6", "6 x 300ml")
  let packCount = 1;
  const packOfMatch = cleaned.match(/\b(?:pack\s*of\s*(\d+)|(\d+)[\s-]*pack|(\d+)\s*x\s*\d+)\b/i);
  if (packOfMatch) {
    const numStr = packOfMatch[1] || packOfMatch[2] || packOfMatch[3];
    const parsedPack = parseInt(numStr, 10);
    if (!Number.isNaN(parsedPack) && parsedPack > 0) {
      packCount = parsedPack;
    }
  }

  // 6. Extract Pages (for notebooks)
  let pages: number | null = null;
  const pagesMatch = cleaned.match(/\b(\d+)\s*(?:pages|pgs|page)\b/i);
  if (pagesMatch) {
    pages = parseInt(pagesMatch[1], 10);
  }

  // 7. Extract Quantity, Unit, Weight, Volume, Storage
  let quantity: string | null = null;
  let unit: NormalizedProductAttributes['unit'] = null;
  let normalizedQuantityValue: number | null = null;
  let weight: string | null = null;
  let volume: string | null = null;

  const volumeMatch = cleaned.match(/\b(\d+(?:\.\d+)?)\s*(ml|millilitre|milliliter|l|ltr|litre|liter)s?\b/i);
  const weightMatch = cleaned.match(/\b(\d+(?:\.\d+)?)\s*(kg|kilogram|g|gm|gram)s?\b/i);
  const storageMatch = cleaned.match(/\b(\d+)\s*(gb|tb)\b/i);
  const wattMatch = cleaned.match(/\b(\d+)\s*(w|watt)s?\b/i);

  if (volumeMatch) {
    const rawVal = parseFloat(volumeMatch[1]);
    const rawUnit = volumeMatch[2].toLowerCase();
    const isLitre = rawUnit.startsWith('l');
    const mlValue = isLitre ? Math.round(rawVal * 1000) : Math.round(rawVal);
    unit = 'ml';
    normalizedQuantityValue = mlValue * packCount;
    quantity = isLitre ? `${rawVal}L` : `${rawVal}ml`;
    volume = `${mlValue}ml`;
  } else if (weightMatch) {
    const rawVal = parseFloat(weightMatch[1]);
    const rawUnit = weightMatch[2].toLowerCase();
    const isKg = rawUnit.startsWith('k');
    const gramValue = isKg ? Math.round(rawVal * 1000) : Math.round(rawVal);
    unit = 'g';
    normalizedQuantityValue = gramValue * packCount;
    quantity = isKg ? `${rawVal}kg` : `${rawVal}g`;
    weight = `${gramValue}g`;
  } else if (storageMatch) {
    const rawVal = parseInt(storageMatch[1], 10);
    const rawUnit = storageMatch[2].toLowerCase() as 'gb' | 'tb';
    unit = rawUnit;
    normalizedQuantityValue = rawUnit === 'tb' ? rawVal * 1024 : rawVal;
    quantity = `${rawVal}${rawUnit.toUpperCase()}`;
  } else if (pages !== null) {
    unit = 'pages';
    normalizedQuantityValue = pages;
    quantity = `${pages} pages`;
  } else if (wattMatch) {
    const rawVal = parseInt(wattMatch[1], 10);
    unit = 'w';
    normalizedQuantityValue = rawVal;
    quantity = `${rawVal}W`;
  }

  const productName = cleaned || 'Product';

  return {
    raw_input: rawInput,
    product_name: productName,
    brand,
    category,
    variant,
    size,
    quantity,
    unit,
    normalized_quantity_value: normalizedQuantityValue,
    pack_count: packCount,
    weight,
    volume,
    pages,
  };
}

/**
 * Deterministic Product Matching Engine.
 * Ensures e.g. "Amul Taaza Milk 1L" matches "Amul Taaza 1 Litre" (0.97),
 * while rejecting "Amul Taaza Milk 500ml" (quantity mismatch)
 * and rejecting "Amul Gold Milk 1L" (variant mismatch)
 * and rejecting "Classmate A4 172 pages" vs "Classmate A5 100 pages".
 */
export function evaluateProductMatch(
  targetInput: string | NormalizedProductAttributes,
  candidateInput: string | NormalizedProductAttributes
): ProductMatchEvaluation {
  const target =
    typeof targetInput === 'string'
      ? normalizeProductAttributes(targetInput)
      : targetInput;
  const candidate =
    typeof candidateInput === 'string'
      ? normalizeProductAttributes(candidateInput)
      : candidateInput;

  let score = 0.85;
  const matched: string[] = [];
  const mismatches: string[] = [];

  // 1. Category check
  if (target.category === candidate.category) {
    matched.push(`Category (${target.category})`);
    score += 0.05;
  } else if (
    target.category !== 'General Retail' &&
    candidate.category !== 'General Retail'
  ) {
    mismatches.push(`Category mismatch: ${target.category} vs ${candidate.category}`);
    score -= 0.45;
  }

  // 2. Brand check
  if (target.brand && candidate.brand) {
    if (target.brand.toLowerCase() === candidate.brand.toLowerCase()) {
      matched.push(`Brand (${target.brand})`);
      score += 0.05;
    } else {
      mismatches.push(`Brand mismatch: ${target.brand} vs ${candidate.brand}`);
      score -= 0.50;
    }
  }

  // 3. Variant check (e.g., Taaza vs Gold, Single Line vs Unruled)
  if (target.variant && candidate.variant) {
    const tVars = target.variant.toLowerCase().split(/\s*·\s*/);
    const cVars = candidate.variant.toLowerCase().split(/\s*·\s*/);
    const hasOverlap = tVars.some((tv) => cVars.includes(tv));
    if (target.variant.toLowerCase() === candidate.variant.toLowerCase() || hasOverlap) {
      matched.push(`Variant (${candidate.variant})`);
      score += 0.03;
    } else {
      mismatches.push(`Variant mismatch: ${target.variant} vs ${candidate.variant}`);
      score -= 0.48;
    }
  } else if (target.variant && !candidate.variant) {
    score -= 0.08;
  }

  // 4. Size check (e.g., A4 vs A5)
  if (target.size && candidate.size) {
    if (target.size === candidate.size) {
      matched.push(`Size (${target.size})`);
      score += 0.03;
    } else {
      mismatches.push(`Size mismatch: ${target.size} vs ${candidate.size}`);
      score -= 0.45;
    }
  }

  // 5. Pages check (e.g., 172 pages vs 100 pages)
  if (target.pages !== null && candidate.pages !== null) {
    if (target.pages === candidate.pages) {
      matched.push(`Page count (${target.pages} pages)`);
      score += 0.03;
    } else {
      mismatches.push(`Page count mismatch: ${target.pages} pages vs ${candidate.pages} pages`);
      score -= 0.40;
    }
  }

  // 6. Normalized Quantity / Volume / Weight check (e.g., 1L = 1000ml vs 500ml)
  if (
    target.unit &&
    candidate.unit &&
    target.normalized_quantity_value !== null &&
    candidate.normalized_quantity_value !== null
  ) {
    if (
      target.unit === candidate.unit &&
      target.normalized_quantity_value === candidate.normalized_quantity_value
    ) {
      matched.push(
        `Normalized Quantity (${target.normalized_quantity_value}${target.unit})`
      );
      score += 0.04;
    } else {
      mismatches.push(
        `Quantity mismatch: ${target.quantity || target.normalized_quantity_value} vs ${
          candidate.quantity || candidate.normalized_quantity_value
        }`
      );
      score -= 0.52;
    }
  }

  // Clamp confidence between 0.05 and 0.99
  const clampedConfidence = Math.max(0.05, Math.min(0.99, Number(score.toFixed(2))));
  const isEquivalent = clampedConfidence >= 0.75 && mismatches.length === 0;

  return {
    target,
    candidate,
    match_confidence: clampedConfidence,
    is_equivalent: isEquivalent,
    matched_attributes: matched,
    mismatch_reasons: mismatches,
  };
}
