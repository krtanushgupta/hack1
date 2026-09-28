/**
 * QuickHatke Extension — amazonMinutesAdapter
 * Extracts ONLY visible, permitted product information from Amazon India / Amazon Minutes product pages.
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

  function extractQuantityFromText(text) {
    if (!text) return null;
    const m = String(text).match(
      /\b(\d+(?:\.\d+)?\s*(?:ml|l|litre|litres|g|gm|kg|pages|pcs|pack|tablets|pulls|w|gb|tb))\b/i
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

  const amazonMinutesAdapter = {
    adapterName: 'amazonMinutesAdapter',
    platform: 'Amazon Minutes',

    canHandle(urlObj) {
      return Boolean(urlObj && urlObj.hostname && urlObj.hostname.toLowerCase().includes('amazon.in'));
    },

    extract(doc = document, currentUrl = window.location.href) {
      const capturedAt = new Date().toISOString();
      const bodyText = doc.body ? doc.body.innerText || '' : '';

      if (
        doc.querySelector('form[action*="/errors/validateCaptcha"]') ||
        /enter the characters you see below|robot check/i.test(bodyText)
      ) {
        return {
          platform: 'Amazon Minutes',
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
            adapterSelected: 'amazonMinutesAdapter',
            extractionStatus: 'blocked',
            fieldsExtracted: [],
            errorMessage: 'Platform data unavailable: Amazon robot check / CAPTCHA page detected.',
          },
        };
      }

      const titleEl = doc.getElementById('productTitle') || doc.querySelector('h1#title span');
      const productName = cleanText(titleEl && titleEl.textContent);

      const bylineEl = doc.getElementById('bylineInfo');
      let brand = cleanText(bylineEl && bylineEl.textContent);
      if (brand) {
        brand = brand
          .replace(/^Visit the\s+/i, '')
          .replace(/\s+Store$/i, '')
          .replace(/^Brand:\s*/i, '')
          .trim();
      }

      const variantEl = doc.querySelector('#variation_size_name .selection, #variation_style_name .selection');
      const variant =
        cleanText(variantEl && variantEl.textContent) || extractVariantFromTitle(productName);

      const quantity = extractQuantityFromText(productName);

      const priceOffscreen = doc.querySelector(
        '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen, #corePrice_feature_div .a-price .a-offscreen, .a-price.priceToPay .a-offscreen'
      );
      const priceWhole = doc.querySelector('.a-price-whole');
      const price =
        parseRupeeNumber(priceOffscreen && priceOffscreen.textContent) ||
        parseRupeeNumber(priceWhole && priceWhole.textContent);

      const mrpEl = doc.querySelector(
        '.basisPrice .a-price.a-text-price .a-offscreen, span[data-a-strike="true"] .a-offscreen'
      );
      const mrp = parseRupeeNumber(mrpEl && mrpEl.textContent);

      const discountEl = doc.querySelector('.savingsPercentage');
      const discount = cleanText(discountEl && discountEl.textContent);

      const offerEl = doc.querySelector('#applicablePromotionList_feature_div, .promoPriceBlockMessage');
      const offer = cleanText(offerEl && offerEl.textContent);

      const etaEl = doc.querySelector('#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE');
      let deliveryEta = cleanText(etaEl && etaEl.textContent);
      if (!deliveryEta) {
        const etaMatch = bodyText.match(/\b(\d+\s*mins?)\b/i);
        deliveryEta = etaMatch ? etaMatch[1].toLowerCase() : null;
      }

      const availEl = doc.getElementById('availability');
      const availText = cleanText(availEl && availEl.textContent) || '';
      let availability = null;
      if (/currently unavailable|out of stock/i.test(availText)) {
        availability = 'Out of stock';
      } else if (/in stock/i.test(availText) || (productName && price)) {
        availability = 'In stock';
      }

      const result = {
        platform: 'Amazon Minutes',
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
          adapterSelected: 'amazonMinutesAdapter',
          extractionStatus: hasCoreProduct
            ? 'success'
            : fieldsExtracted.length > 0
            ? 'partial'
            : 'unavailable',
          fieldsExtracted,
          errorMessage: hasCoreProduct
            ? null
            : 'Open a specific Amazon.in product page (/dp/...) to extract live product Name and Price.',
        },
      };
    },
  };

  globalScope.QuickHatkeAdapters = globalScope.QuickHatkeAdapters || {};
  globalScope.QuickHatkeAdapters.amazonMinutesAdapter = amazonMinutesAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
