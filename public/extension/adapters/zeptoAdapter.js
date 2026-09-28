/**
 * QuickHatke Extension — zeptoAdapter
 * Extracts ONLY visible, permitted product information from Zepto product pages.
 * Never fabricates missing fields (returns null if a field cannot be read).
 */
(function (globalScope) {
  function cleanText(val) {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.replace(/\s+/g, ' ').trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function parseRupeeNumber(text) {
    if (text === null || text === undefined) return null;
    if (typeof text === 'number') return text > 0 ? text : null;
    const match = String(text).replace(/,/g, '').match(/₹?\s*(\d+(?:\.\d{1,2})?)/);
    if (!match) return null;
    const num = parseFloat(match[1]);
    return Number.isNaN(num) || num <= 0 ? null : num;
  }

  function extractJsonLd(doc) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent || '{}');
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          if (item && (item['@type'] === 'Product' || item.name)) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            return {
              name: cleanText(item.name),
              brand: cleanText(item.brand && (item.brand.name || item.brand)),
              price: offer ? parseRupeeNumber(offer.price || offer.lowPrice) : null,
              availability:
                offer && typeof offer.availability === 'string'
                  ? offer.availability.includes('OutOfStock')
                    ? 'Out of stock'
                    : offer.availability.includes('InStock')
                    ? 'In stock'
                    : null
                  : null,
            };
          }
        }
      } catch {
        // Ignore malformed JSON-LD
      }
    }
    return null;
  }

  function extractQuantityFromText(text) {
    if (!text) return null;
    const m = String(text).match(
      /\b(\d+(?:\.\d+)?\s*(?:ml|l|litre|litres|g|gm|kg|pages|pcs|pack|tablets|pulls|w))\b/i
    );
    return m ? m[1].trim() : null;
  }

  function extractVariantFromTitle(title) {
    if (!title) return null;
    const m = String(title).match(
      /\b(A4|A5|Single Line|Unruled|Spiral|Taaza|Gold|Full Cream|Toned|Easy Wash|Matic Front Load|Matic Top Load)\b/i
    );
    return m ? m[1] : null;
  }

  const zeptoAdapter = {
    adapterName: 'zeptoAdapter',
    platform: 'Zepto',

    canHandle(urlObj) {
      return Boolean(
        urlObj &&
          urlObj.hostname &&
          (urlObj.hostname.toLowerCase().includes('zeptonow.com') ||
            urlObj.hostname.toLowerCase().includes('zepto.com'))
      );
    },

    extract(doc = document, currentUrl = window.location.href) {
      const capturedAt = new Date().toISOString();
      const bodyText = doc.body ? doc.body.innerText || '' : '';

      if (
        /verify you are human|access denied|cloudflare|captcha/i.test(doc.title || '') &&
        !doc.querySelector('h1')
      ) {
        return {
          platform: 'Zepto',
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
          productUrl: currentUrl,
          capturedAt,
          _diagnostics: {
            adapterSelected: 'zeptoAdapter',
            extractionStatus: 'blocked',
            fieldsExtracted: [],
            errorMessage: 'Platform data unavailable: Page protected by anti-bot verification.',
          },
        };
      }

      const ld = extractJsonLd(doc);

      const h1El =
        doc.querySelector('h1') ||
        doc.querySelector('[data-testid="product-title-name"]') ||
        doc.querySelector('[data-testid="product-name"]');
      const productName = cleanText(h1El && h1El.textContent) || (ld && ld.name) || null;

      const brandEl = doc.querySelector('[data-testid="product-brand"], a[href*="/brand/"]');
      const brand = cleanText(brandEl && brandEl.textContent) || (ld && ld.brand) || null;

      const quantityEl =
        doc.querySelector('[data-testid="product-quantity"]') ||
        doc.querySelector('[data-testid="pack-size"]');
      const quantity =
        cleanText(quantityEl && quantityEl.textContent) || extractQuantityFromText(productName);

      const variant = extractVariantFromTitle(productName);

      const priceEl =
        doc.querySelector('[data-testid="product-price"]') ||
        doc.querySelector('[data-testid="selling-price"], h4[class*="price" i]');
      let price = parseRupeeNumber(priceEl && priceEl.textContent) || (ld && ld.price) || null;

      if (!price) {
        const priceMatch = bodyText.match(/₹\s*(\d+(?:\.\d{1,2})?)/);
        if (priceMatch) price = parseRupeeNumber(priceMatch[1]);
      }

      const mrpEl =
        doc.querySelector('[data-testid="product-mrp"]') ||
        doc.querySelector('del, s, [class*="line-through"]');
      const mrp = parseRupeeNumber(mrpEl && mrpEl.textContent);

      const discountEl = doc.querySelector('[data-testid="discount-badge"], [class*="discount" i]');
      let discount = cleanText(discountEl && discountEl.textContent);
      if (!discount) {
        const discMatch = bodyText.match(/\b(\d+%\s*Off|₹\s*\d+\s*Off)\b/i);
        if (discMatch) discount = discMatch[1];
      }

      const offerEl = doc.querySelector('[data-testid="coupon-offer"], [data-testid="bank-offer"]');
      const offer = cleanText(offerEl && offerEl.textContent) || null;

      const etaEl =
        doc.querySelector('[data-testid="delivery-time"]') ||
        doc.querySelector('[data-testid="eta-badge"]');
      let deliveryEta = cleanText(etaEl && etaEl.textContent);
      if (!deliveryEta) {
        const etaMatch = bodyText.match(/\b(\d+\s*mins?)\b/i);
        deliveryEta = etaMatch ? etaMatch[1].toLowerCase() : null;
      }

      let availability = ld && ld.availability ? ld.availability : null;
      if (!availability) {
        if (/out of stock|sold out|notify me/i.test(bodyText)) {
          availability = 'Out of stock';
        } else if (/add to cart|\badd\b|in stock/i.test(bodyText) && productName && price) {
          availability = 'In stock';
        }
      }

      const result = {
        platform: 'Zepto',
        productName,
        brand,
        variant,
        quantity,
        price,
        mrp,
        discount,
        offer,
        availability,
        deliveryEta,
        productUrl: currentUrl,
        capturedAt,
      };

      const fieldsExtracted = Object.entries(result)
        .filter(([k, v]) => !['platform', 'productUrl', 'capturedAt'].includes(k) && v !== null)
        .map(([k]) => k);

      const hasCoreProduct = Boolean(productName && price !== null);

      return {
        ...result,
        _diagnostics: {
          adapterSelected: 'zeptoAdapter',
          extractionStatus: hasCoreProduct
            ? 'success'
            : fieldsExtracted.length > 0
            ? 'partial'
            : 'unavailable',
          fieldsExtracted,
          errorMessage: hasCoreProduct
            ? null
            : 'Open a specific Zepto product page (/pn/...) to extract live product Name and Price.',
        },
      };
    },
  };

  globalScope.QuickHatkeAdapters = globalScope.QuickHatkeAdapters || {};
  globalScope.QuickHatkeAdapters.zeptoAdapter = zeptoAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
