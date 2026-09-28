/**
 * QuickHatke Extension — blinkitAdapter
 * Extracts ONLY visible, permitted product information from real Blinkit product pages (/prn/.../prid/...).
 * Search pages (https://blinkit.com/s/?q=...) and category pages (/cn/...) are NOT treated as product pages.
 * Never fabricates missing fields (returns null if a field cannot be read).
 */
(function (globalScope) {
  function cleanText(val) {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.replace(/\s+/g, ' ').trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function cleanBlinkitTitle(rawTitle) {
    const cleaned = cleanText(rawTitle);
    if (!cleaned) return null;
    const stripped = cleaned
      .replace(/\s+Price\s*[-|]\s*Buy\s+.*$/i, '')
      .replace(/^Buy\s+/i, '')
      .replace(/\s+Online\s+at\s+Best\s+Price.*$/i, '')
      .replace(/\s*[-|]\s*blinkit.*$/i, '')
      .replace(/\s*[-|]\s*grofers.*$/i, '')
      .trim();
    if (
      !stripped ||
      /^blinkit$/i.test(stripped) ||
      /everything delivered in minutes/i.test(stripped) ||
      /select\s+location|detect\s+my\s+location|my\s+cart/i.test(stripped)
    ) {
      return null;
    }
    return stripped;
  }

  function parseRupeeNumber(text) {
    if (text === null || text === undefined) return null;
    if (typeof text === 'number') return text > 0 ? text : null;
    const withoutMrpOrPromo = String(text)
      .replace(/,/g, '')
      .replace(/MRP\s*:?\s*(?:Rs\.?|₹)?\s*\d+(?:\.\d{1,2})?/gi, ' ')
      .replace(/(?:save|off|add)\s*(?:Rs\.?|₹)\s*\d+(?:\.\d{1,2})?/gi, ' ');
    const match = withoutMrpOrPromo.match(/(?:₹|Rs\.?)\s*(\d+(?:\.\d{1,2})?)/i);
    if (!match) return null;
    const num = parseFloat(match[1]);
    return Number.isNaN(num) || num <= 0 ? null : num;
  }

  function extractJsonLd(doc) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent || '{}');
        const candidates = [];
        if (Array.isArray(parsed)) {
          candidates.push(...parsed);
        } else if (parsed && typeof parsed === 'object') {
          candidates.push(parsed);
          if (Array.isArray(parsed['@graph'])) {
            candidates.push(...parsed['@graph']);
          }
        }
        for (const item of candidates) {
          const itemType = item && item['@type'];
          const isProduct =
            itemType === 'Product' ||
            (Array.isArray(itemType) && itemType.includes('Product')) ||
            Boolean(item && item.name && item.offers);
          if (isProduct) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            const rawPrice = offer ? offer.price ?? offer.lowPrice : null;
            const parsedPrice =
              rawPrice !== null && rawPrice !== undefined
                ? parseFloat(String(rawPrice).replace(/,/g, ''))
                : null;
            return {
              name: cleanBlinkitTitle(item.name),
              brand: cleanText(item.brand && (item.brand.name || item.brand)),
              price: parsedPrice && !Number.isNaN(parsedPrice) && parsedPrice > 0 ? parsedPrice : null,
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
      /\b(\d+(?:\.\d+)?\s*(?:ml|l|ltr|litre|litres|g|gm|kg|pages|pcs|pieces|pack|unit|units|tablets|pulls|w|gb|tb))\b/i
    );
    return m ? m[1].trim() : null;
  }

  function extractVariantFromTitle(title) {
    if (!title) return null;
    const m = String(title).match(
      /\b(A4|A5|Single Line|Unruled|Spiral|Long Book|Long Notebook|Taaza|Gold|Full Cream|Toned|Easy Wash|Matic Front Load|Matic Top Load|WH-CH520|WH-1000XM5|Rockerz 450|Tune 510BT)\b/i
    );
    return m ? m[1] : null;
  }

  function isInsideHeaderOrCart(el) {
    if (!el || !el.closest) return false;
    return Boolean(
      el.closest(
        'header, nav, footer, [class*="Header" i], [class*="Navbar" i], [class*="CartButton" i], [class*="CartStrip" i]'
      )
    );
  }

  function isStruckThrough(el) {
    if (!el || !el.closest) return false;
    if (
      el.closest(
        'del, s, strike, [class*="strike" i], [class*="line-through" i], [style*="line-through" i]'
      )
    ) {
      return true;
    }
    try {
      const style = window.getComputedStyle(el);
      if (style && style.textDecorationLine && style.textDecorationLine.includes('line-through')) {
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  function extractSellingAndMrpFromContainer(container) {
    if (!container) return { price: null, mrp: null };
    let mrp = null;
    let price = null;

    const struckEls = container.querySelectorAll(
      'del, s, strike, [class*="strike" i], [class*="line-through" i], [style*="line-through" i]'
    );
    for (const sEl of struckEls) {
      const mVal = parseRupeeNumber(sEl.textContent);
      if (mVal !== null) {
        mrp = mVal;
        break;
      }
    }

    const fullText = (container.textContent || '').replace(/\s+/g, ' ').trim();
    if (!mrp) {
      const mrpMatch = fullText.match(/MRP\s*:?\s*(?:₹|Rs\.?)?\s*(\d+(?:\.\d{1,2})?)/i);
      if (mrpMatch) {
        const parsed = parseFloat(mrpMatch[1]);
        if (!Number.isNaN(parsed) && parsed > 0) mrp = parsed;
      }
    }

    const nodes = container.querySelectorAll('div, span, p, strong, b, h2, h3');
    for (const node of nodes) {
      if (isStruckThrough(node)) continue;
      const nodeText = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^MRP/i.test(nodeText)) continue;
      if (/^(?:₹|Rs\.?)\s*\d+(?:\.\d{1,2})?$/i.test(nodeText)) {
        const pVal = parseRupeeNumber(nodeText);
        if (pVal !== null && pVal !== mrp) {
          price = pVal;
          break;
        }
      }
    }

    if (price === null) {
      price = parseRupeeNumber(fullText);
    }

    return { price, mrp };
  }

  function findPrimaryBlinkitPriceAndMrp(doc) {
    const directSelectors = [
      '[data-testid="product-price"]',
      '[class*="ProductPrice"]',
      '[class*="ProductVariants"] [class*="Price"]',
    ];
    for (const sel of directSelectors) {
      const el = doc.querySelector(sel);
      if (el && !isInsideHeaderOrCart(el)) {
        const p = parseRupeeNumber(el.textContent);
        if (p !== null) return { price: p, mrp: null };
      }
    }

    // Walk up 1-5 ancestor levels from "(Inclusive of all taxes)" on Blinkit PDP
    const allNodes = Array.from(doc.querySelectorAll('div, span, p, small'));
    for (const el of allNodes) {
      const ownText = (el.textContent || '').trim();
      if (ownText.length > 0 && ownText.length < 60 && /inclusive of all taxes/i.test(ownText)) {
        let curr = el.parentElement;
        for (let depth = 0; depth < 5 && curr; depth++) {
          const containerText = (curr.textContent || '').trim();
          if (containerText.length > 500) break;
          if (/₹|Rs\.?/i.test(containerText)) {
            const extracted = extractSellingAndMrpFromContainer(curr);
            if (extracted.price !== null) {
              return extracted;
            }
          }
          curr = curr.parentElement;
        }
      }
    }

    // Check <title> or meta description for "Online at Best Price of Rs 52"
    const titleSources = [
      doc.title || '',
      (doc.querySelector('meta[name="description"]') &&
        doc.querySelector('meta[name="description"]').getAttribute('content')) ||
        '',
      (doc.querySelector('meta[property="og:description"]') &&
        doc.querySelector('meta[property="og:description"]').getAttribute('content')) ||
        '',
    ];
    for (const src of titleSources) {
      const bestPriceMatch = src.match(/Best\s+Price\s+of\s+(?:Rs\.?|₹)\s*(\d+(?:\.\d{1,2})?)/i);
      if (bestPriceMatch) {
        const p = parseFloat(bestPriceMatch[1]);
        if (!Number.isNaN(p) && p > 0) return { price: p, mrp: null };
      }
    }

    // Standalone ₹<number> leaf inside main product section (excluding header/cart)
    const candidateEls = Array.from(doc.querySelectorAll('div, span, p, strong, b'));
    for (const el of candidateEls) {
      if (el.children.length > 1) continue;
      if (isInsideHeaderOrCart(el) || isStruckThrough(el)) continue;
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^₹\s*\d+(?:\.\d{1,2})?$/.test(txt)) {
        const p = parseRupeeNumber(txt);
        if (p !== null) return { price: p, mrp: null };
      }
    }

    return { price: null, mrp: null };
  }

  function findPrimaryBlinkitTitle(doc, ld) {
    const h1Candidates = Array.from(
      doc.querySelectorAll(
        'h1, [data-testid="product-name"], [class*="ProductName"], [class*="ProductTitle"]'
      )
    );
    for (const el of h1Candidates) {
      if (isInsideHeaderOrCart(el)) continue;
      const cleaned = cleanBlinkitTitle(el.textContent);
      if (cleaned && cleaned.length >= 3) return cleaned;
    }

    if (ld && ld.name) return ld.name;

    const ogTitle = doc.querySelector('meta[property="og:title"], meta[name="twitter:title"]');
    const ogText = cleanBlinkitTitle(ogTitle && ogTitle.getAttribute('content'));
    if (ogText) return ogText;

    const docTitle = cleanBlinkitTitle(doc.title);
    if (docTitle) return docTitle;

    return null;
  }

  const blinkitAdapter = {
    adapterName: 'blinkitAdapter',
    platform: 'Blinkit',

    canHandle(urlObj) {
      return Boolean(urlObj && urlObj.hostname && urlObj.hostname.toLowerCase().includes('blinkit.com'));
    },

    /**
     * Strictly distinguishes an actual Blinkit product page (/prn/<slug>/prid/<id>)
     * from a Blinkit search page (/s/?q=...), category page (/cn/...), or homepage (/).
     */
    isProductPage(urlObj) {
      if (!this.canHandle(urlObj)) return false;
      const pathname = (urlObj.pathname || '').toLowerCase();
      // Search (/s/) and category (/cn/) pages are NOT individual product pages
      if (pathname.startsWith('/s/') || pathname === '/s' || pathname.startsWith('/cn/')) {
        return false;
      }
      return /\/prn\/|\/prid\//i.test(pathname);
    },

    extract(doc = document, currentUrl = window.location.href) {
      console.log('[QuickHatke] Platform detected: Blinkit');
      console.log('[QuickHatke] Adapter: blinkitAdapter');
      console.log('[QuickHatke] Product extraction started');

      const capturedAt = new Date().toISOString();
      const bodyText = doc.body ? doc.body.innerText || '' : '';

      // Detect anti-bot / Cloudflare verification wall
      if (
        /verify you are human|access denied|cloudflare|just a moment/i.test(doc.title || '') &&
        !doc.querySelector('h1')
      ) {
        console.log('[QuickHatke] Product: null');
        console.log('[QuickHatke] Price: null');
        console.log('[QuickHatke] URL:', currentUrl);
        console.log('[QuickHatke] Extraction completed');
        return {
          platform: 'Blinkit',
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
          source: 'extension',
          capturedAt,
          _diagnostics: {
            adapterSelected: 'blinkitAdapter',
            extractionStatus: 'blocked',
            fieldsExtracted: [],
            errorMessage: 'Platform data unavailable: Blinkit page protected by anti-bot verification.',
          },
        };
      }

      const ld = extractJsonLd(doc);
      const priceAndMrp = findPrimaryBlinkitPriceAndMrp(doc);
      const productName = findPrimaryBlinkitTitle(doc, ld);
      const price = (ld && ld.price) || priceAndMrp.price;
      let mrp = priceAndMrp.mrp;

      const brandEl =
        doc.querySelector('[data-testid="product-brand"]') ||
        doc.querySelector('a[href*="/brand/"], a[href*="/cn/"]');
      const brand = (ld && ld.brand) || cleanText(brandEl && brandEl.textContent) || null;

      const unitEl =
        doc.querySelector('[data-testid="product-unit"]') ||
        doc.querySelector('[class*="ProductUnit"], [class*="VariantUnit"]');
      const quantity =
        cleanText(unitEl && unitEl.textContent) ||
        extractQuantityFromText(productName) ||
        extractQuantityFromText(bodyText.slice(0, 1400));

      const variant = extractVariantFromTitle(productName);

      if (!mrp) {
        const mrpEl =
          doc.querySelector('[data-testid="product-mrp"]') ||
          doc.querySelector('del, s, [class*="line-through"], [class*="strike"]');
        mrp = parseRupeeNumber(mrpEl && mrpEl.textContent);
        if (!mrp) {
          const mrpTextMatch = bodyText.match(/MRP\s*:?\s*(?:₹|Rs\.?)?\s*(\d+(?:\.\d{1,2})?)/i);
          if (mrpTextMatch) mrp = parseRupeeNumber('₹' + mrpTextMatch[1]);
        }
      }

      const discountEl = doc.querySelector('[data-testid="product-discount"], [class*="Discount" i]');
      let discount = cleanText(discountEl && discountEl.textContent);
      if (!discount) {
        const discMatch = bodyText.match(/\b(\d+%\s*OFF|₹\s*\d+\s*OFF)\b/i);
        if (discMatch) discount = discMatch[1];
      }

      const offerEl = doc.querySelector('[data-testid="product-offer"], [class*="Offer" i]');
      const offer = cleanText(offerEl && offerEl.textContent) || null;

      const etaEl =
        doc.querySelector('[data-testid="delivery-eta"]') ||
        doc.querySelector('[class*="eta" i], [class*="Timer" i]');
      let deliveryEta = cleanText(etaEl && etaEl.textContent);
      if (!deliveryEta) {
        const etaMatch = bodyText.match(/\b(\d+\s*mins?)\b/i);
        deliveryEta = etaMatch ? etaMatch[1].toLowerCase() : null;
      }

      let availability = ld && ld.availability ? ld.availability : null;
      if (!availability) {
        if (/out of stock|currently unavailable|sold out/i.test(bodyText.slice(0, 2500))) {
          availability = 'Out of stock';
        } else if (productName && price !== null) {
          availability = 'In stock';
        }
      }

      console.log('[QuickHatke] Product:', productName);
      console.log('[QuickHatke] Price:', price);
      console.log('[QuickHatke] URL:', currentUrl);
      console.log('[QuickHatke] Extraction completed');

      const result = {
        platform: 'Blinkit',
        productName: productName || null,
        brand: brand || null,
        variant: variant || null,
        quantity: quantity || null,
        price: typeof price === 'number' && !Number.isNaN(price) ? price : null,
        mrp: typeof mrp === 'number' && !Number.isNaN(mrp) ? mrp : null,
        discount: discount || null,
        offer: offer || null,
        availability: availability || null,
        deliveryEta: deliveryEta || null,
        productUrl: currentUrl,
        source: 'extension',
        capturedAt,
      };

      const fieldsExtracted = Object.entries(result)
        .filter(([k, v]) => !['platform', 'productUrl', 'source', 'capturedAt'].includes(k) && v !== null)
        .map(([k]) => k);

      const hasCoreProduct = Boolean(result.productName && result.price !== null);

      return {
        ...result,
        _diagnostics: {
          adapterSelected: 'blinkitAdapter',
          extractionStatus: hasCoreProduct
            ? 'success'
            : fieldsExtracted.length > 0
            ? 'partial'
            : 'unavailable',
          fieldsExtracted,
          errorMessage: hasCoreProduct
            ? null
            : 'Product page detected (/prn/.../prid/...), awaiting DOM price/title hydration.',
        },
      };
    },
  };

  globalScope.QuickHatkeAdapters = globalScope.QuickHatkeAdapters || {};
  globalScope.QuickHatkeAdapters.blinkitAdapter = blinkitAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
