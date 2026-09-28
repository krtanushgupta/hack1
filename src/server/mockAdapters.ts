import { type NormalizedProductAttributes } from '../shared/normalization.ts';
import {
  type NormalizedPlatformResult,
  buildLegitimateSearchUrl,
} from './platformAdapters.ts';

/**
 * STRICTLY ISOLATED DEVELOPMENT MOCK ADAPTERS
 * Used ONLY when the user explicitly toggles "DEMO MODE" in the UI for development testing.
 * Never used in Production Mode. Every result is explicitly tagged with data_status: 'stale' / DEMO metadata.
 */
export interface IMockPlatformAdapter {
  readonly platformName: 'Blinkit' | 'Zepto' | 'Flipkart Minutes' | 'Amazon Minutes';
  getDemoProduct(
    query: string,
    location: string,
    targetAttrs: NormalizedProductAttributes
  ): NormalizedPlatformResult;
}

const DEMO_PRICING_TABLE: Record<
  string,
  Record<
    'Blinkit' | 'Zepto' | 'Flipkart Minutes' | 'Amazon Minutes',
    { price: number; eta: string; offer: string | null; stock: 'available' | 'limited' }
  >
> = {
  notebook: {
    Blinkit: { price: 49, eta: '10 min', offer: 'Flat ₹5 cashback (Demo)', stock: 'available' },
    Zepto: { price: 52, eta: '12 min', offer: 'None', stock: 'available' },
    'Flipkart Minutes': { price: 51, eta: '15 min', offer: '5% SuperCoins (Demo)', stock: 'available' },
    'Amazon Minutes': { price: 54, eta: '19 min', offer: 'Free delivery (Demo)', stock: 'available' },
  },
  milk: {
    Blinkit: { price: 52, eta: '10 min', offer: '5% cashback (Demo)', stock: 'available' },
    Zepto: { price: 51, eta: '12 min', offer: '10% off with card (Demo)', stock: 'available' },
    'Flipkart Minutes': { price: 50, eta: '15 min', offer: 'None', stock: 'available' },
    'Amazon Minutes': { price: 54, eta: '20 min', offer: 'Free delivery (Demo)', stock: 'available' },
  },
  detergent: {
    Blinkit: { price: 138, eta: '11 min', offer: '₹10 off on UPI (Demo)', stock: 'available' },
    Zepto: { price: 135, eta: '10 min', offer: 'None', stock: 'available' },
    'Flipkart Minutes': { price: 132, eta: '16 min', offer: '5% off (Demo)', stock: 'available' },
    'Amazon Minutes': { price: 140, eta: '22 min', offer: 'Free delivery (Demo)', stock: 'available' },
  },
};

function selectDemoProfile(query: string) {
  const lower = query.toLowerCase();
  if (lower.includes('notebook') || lower.includes('classmate') || lower.includes('navneet')) {
    return DEMO_PRICING_TABLE.notebook;
  }
  if (lower.includes('detergent') || lower.includes('surf') || lower.includes('ariel') || lower.includes('tide')) {
    return DEMO_PRICING_TABLE.detergent;
  }
  return DEMO_PRICING_TABLE.milk;
}

export class BlinkitMockAdapter implements IMockPlatformAdapter {
  readonly platformName = 'Blinkit' as const;
  getDemoProduct(query: string, location: string, targetAttrs: NormalizedProductAttributes): NormalizedPlatformResult {
    const profile = selectDemoProfile(query)[this.platformName];
    const searchUrl = buildLegitimateSearchUrl(this.platformName, targetAttrs.product_name);
    return {
      platform: this.platformName,
      name: this.platformName,
      product_name: `${targetAttrs.product_name} [DEMO DATA]`,
      brand: targetAttrs.brand,
      category: targetAttrs.category,
      variant: targetAttrs.variant,
      size: targetAttrs.size,
      quantity: targetAttrs.quantity,
      pages: targetAttrs.pages,
      weight: targetAttrs.weight,
      volume: targetAttrs.volume,
      pack_count: targetAttrs.pack_count,
      price: profile.price,
      formatted_price: `₹${profile.price}`,
      discount: null,
      offer: profile.offer,
      offer_adjusted_price: profile.price,
      delivery_time: profile.eta,
      delivery_minutes: parseInt(profile.eta, 10),
      delivery_fee: 0,
      estimated_total_payable: profile.price,
      currency: 'INR',
      stock: profile.stock,
      product_url: null,
      search_url: searchUrl,
      order_action: `View on ${this.platformName}`,
      location,
      data_status: 'stale',
      status_reason: 'DEMO MODE: Simulated via BlinkitMockAdapter (Not live store data)',
      retrieved_at: new Date().toISOString(),
      match_confidence: 0.96,
    };
  }
}

export class ZeptoMockAdapter implements IMockPlatformAdapter {
  readonly platformName = 'Zepto' as const;
  getDemoProduct(query: string, location: string, targetAttrs: NormalizedProductAttributes): NormalizedPlatformResult {
    const profile = selectDemoProfile(query)[this.platformName];
    const searchUrl = buildLegitimateSearchUrl(this.platformName, targetAttrs.product_name);
    return {
      platform: this.platformName,
      name: this.platformName,
      product_name: `${targetAttrs.product_name} [DEMO DATA]`,
      brand: targetAttrs.brand,
      category: targetAttrs.category,
      variant: targetAttrs.variant,
      size: targetAttrs.size,
      quantity: targetAttrs.quantity,
      pages: targetAttrs.pages,
      weight: targetAttrs.weight,
      volume: targetAttrs.volume,
      pack_count: targetAttrs.pack_count,
      price: profile.price,
      formatted_price: `₹${profile.price}`,
      discount: null,
      offer: profile.offer,
      offer_adjusted_price: profile.price,
      delivery_time: profile.eta,
      delivery_minutes: parseInt(profile.eta, 10),
      delivery_fee: 0,
      estimated_total_payable: profile.price,
      currency: 'INR',
      stock: profile.stock,
      product_url: null,
      search_url: searchUrl,
      order_action: `View on ${this.platformName}`,
      location,
      data_status: 'stale',
      status_reason: 'DEMO MODE: Simulated via ZeptoMockAdapter (Not live store data)',
      retrieved_at: new Date().toISOString(),
      match_confidence: 0.96,
    };
  }
}

export class MinutesMockAdapter implements IMockPlatformAdapter {
  readonly platformName = 'Flipkart Minutes' as const;
  getDemoProduct(query: string, location: string, targetAttrs: NormalizedProductAttributes): NormalizedPlatformResult {
    const profile = selectDemoProfile(query)[this.platformName];
    const searchUrl = buildLegitimateSearchUrl(this.platformName, targetAttrs.product_name);
    return {
      platform: this.platformName,
      name: this.platformName,
      product_name: `${targetAttrs.product_name} [DEMO DATA]`,
      brand: targetAttrs.brand,
      category: targetAttrs.category,
      variant: targetAttrs.variant,
      size: targetAttrs.size,
      quantity: targetAttrs.quantity,
      pages: targetAttrs.pages,
      weight: targetAttrs.weight,
      volume: targetAttrs.volume,
      pack_count: targetAttrs.pack_count,
      price: profile.price,
      formatted_price: `₹${profile.price}`,
      discount: null,
      offer: profile.offer,
      offer_adjusted_price: profile.price,
      delivery_time: profile.eta,
      delivery_minutes: parseInt(profile.eta, 10),
      delivery_fee: 0,
      estimated_total_payable: profile.price,
      currency: 'INR',
      stock: profile.stock,
      product_url: null,
      search_url: searchUrl,
      order_action: `View on ${this.platformName}`,
      location,
      data_status: 'stale',
      status_reason: 'DEMO MODE: Simulated via MinutesMockAdapter (Not live store data)',
      retrieved_at: new Date().toISOString(),
      match_confidence: 0.95,
    };
  }
}

export class AmazonMockAdapter implements IMockPlatformAdapter {
  readonly platformName = 'Amazon Minutes' as const;
  getDemoProduct(query: string, location: string, targetAttrs: NormalizedProductAttributes): NormalizedPlatformResult {
    const profile = selectDemoProfile(query)[this.platformName];
    const searchUrl = buildLegitimateSearchUrl(this.platformName, targetAttrs.product_name);
    return {
      platform: this.platformName,
      name: this.platformName,
      product_name: `${targetAttrs.product_name} [DEMO DATA]`,
      brand: targetAttrs.brand,
      category: targetAttrs.category,
      variant: targetAttrs.variant,
      size: targetAttrs.size,
      quantity: targetAttrs.quantity,
      pages: targetAttrs.pages,
      weight: targetAttrs.weight,
      volume: targetAttrs.volume,
      pack_count: targetAttrs.pack_count,
      price: profile.price,
      formatted_price: `₹${profile.price}`,
      discount: null,
      offer: profile.offer,
      offer_adjusted_price: profile.price,
      delivery_time: profile.eta,
      delivery_minutes: parseInt(profile.eta, 10),
      delivery_fee: 0,
      estimated_total_payable: profile.price,
      currency: 'INR',
      stock: profile.stock,
      product_url: null,
      search_url: searchUrl,
      order_action: `View on ${this.platformName}`,
      location,
      data_status: 'stale',
      status_reason: 'DEMO MODE: Simulated via AmazonMockAdapter (Not live store data)',
      retrieved_at: new Date().toISOString(),
      match_confidence: 0.94,
    };
  }
}

export const MOCK_ADAPTERS: IMockPlatformAdapter[] = [
  new BlinkitMockAdapter(),
  new ZeptoMockAdapter(),
  new MinutesMockAdapter(),
  new AmazonMockAdapter(),
];
