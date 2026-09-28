/**
 * QuickHatke Chrome Extension — Content Script (Manifest V3)
 *
 * Dual-role script:
 * 1. On Shopping Platforms (Blinkit, Zepto, Flipkart Minutes, Amazon Minutes):
 *    - Checks if the URL is an actual product detail page (e.g., Blinkit /prn/.../prid/...).
 *    - On search/category pages (e.g., https://blinkit.com/s/?q=...), stays in standby
 *      (Detected Platform: None, Adapter: blinkitAdapter (Standby), Extraction: awaiting_page_capture).
 *    - When a real product page is opened, sets Extraction: running -> extracts visible DOM data
 *      with source: "extension" and forwards to background.js & chrome.storage.local.
 * 2. On QuickHatke Dashboard (localhost:3000, *.run.app, *.usercontent.goog):
 *    - Registers the active QuickHatke backend origin in chrome.storage.local,
 *    - Bridges captured products from chrome.storage.local / background messages
 *      directly into the QuickHatke Frontend via window.postMessage.
 */
(function () {
  const currentHref = window.location.href;
  const currentHost = (window.location.hostname || '').toLowerCase();

  const isQuickHatkeApp =
    currentHost === 'localhost' ||
    currentHost === '127.0.0.1' ||
    currentHost.endsWith('.run.app') ||
    currentHost.endsWith('.usercontent.goog');

  if (!isQuickHatkeApp && window !== window.top) {
    return;
  }

  console.log('[QuickHatke] Extension loaded');
  console.log('[QuickHatke] Current URL:', currentHref);

  // =========================================================================
  // ROLE A: QuickHatke Frontend Dashboard Bridge
  // =========================================================================
  if (isQuickHatkeApp) {
    const announcePresenceAndSync = () => {
      window.postMessage(
        {
          source: 'QUICKHATKE_EXTENSION',
          type: 'EXTENSION_INSTALLED_HEARTBEAT',
          version: '1.2.0',
          backendOrigin: window.location.origin,
        },
        '*'
      );

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ backendUrl: window.location.origin });

        chrome.storage.local.get(['lastDetectedProduct', 'lastDiagnostics'], (items) => {
          if (items && (items.lastDetectedProduct || items.lastDiagnostics)) {
            window.postMessage(
              {
                source: 'QUICKHATKE_EXTENSION',
                type: 'QUICKHATKE_CAPTURE_SYNC',
                product: items.lastDetectedProduct || null,
                diagnostics: items.lastDiagnostics || null,
              },
              '*'
            );
          }
        });
      }
    };

    announcePresenceAndSync();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (changes.lastDetectedProduct || changes.lastDiagnostics) {
          chrome.storage.local.get(['lastDetectedProduct', 'lastDiagnostics'], (items) => {
            window.postMessage(
              {
                source: 'QUICKHATKE_EXTENSION',
                type: 'QUICKHATKE_CAPTURE_SYNC',
                product: items.lastDetectedProduct || null,
                diagnostics: items.lastDiagnostics || null,
              },
              '*'
            );
          });
        }
      });
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'QUICKHATKE_BROADCAST_CAPTURE') {
          window.postMessage(
            {
              source: 'QUICKHATKE_EXTENSION',
              type: 'QUICKHATKE_CAPTURE_SYNC',
              product: msg.product || null,
              diagnostics: msg.diagnostics || null,
            },
            '*'
          );
        }
      });
    }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'QUICKHATKE_WEB_REQUEST_SYNC') {
        announcePresenceAndSync();
      }
    });

    return;
  }

  // =========================================================================
  // ROLE B: Shopping Website Extraction (Blinkit, Zepto, Flipkart, Amazon)
  // =========================================================================
  const ADAPTER_LIST = [
    window.QuickHatkeAdapters && window.QuickHatkeAdapters.blinkitAdapter,
    window.QuickHatkeAdapters && window.QuickHatkeAdapters.zeptoAdapter,
    window.QuickHatkeAdapters && window.QuickHatkeAdapters.flipkartMinutesAdapter,
    window.QuickHatkeAdapters && window.QuickHatkeAdapters.amazonMinutesAdapter,
  ].filter(Boolean);

  function selectAdapterForUrl(urlStr) {
    try {
      const urlObj = new URL(urlStr);
      for (const adapter of ADAPTER_LIST) {
        if (adapter.canHandle(urlObj)) {
          return { adapter, urlObj };
        }
      }
    } catch {
      // ignore invalid URL
    }
    return { adapter: null, urlObj: null };
  }

  function isSupportedProductPage(adapter, urlObj) {
    if (!adapter || !urlObj) return false;
    if (typeof adapter.isProductPage === 'function') {
      return adapter.isProductPage(urlObj);
    }
    const path = (urlObj.pathname || '').toLowerCase();
    // Do not treat search pages (/s, /search) as product pages
    if (path === '/' || path === '/s' || path.startsWith('/s/') || path.startsWith('/search')) {
      return false;
    }
    return true;
  }

  function runExtraction() {
    const activeUrl = window.location.href;
    const { adapter, urlObj } = selectAdapterForUrl(activeUrl);

    if (!adapter) {
      return {
        product: null,
        diagnostics: {
          detectedPlatform: null,
          currentUrl: activeUrl,
          adapterSelected: 'none',
          extractionStatus: 'unsupported_page',
          fieldsExtracted: [],
          timestamp: new Date().toISOString(),
          errorMessage:
            'Open a supported product page on Blinkit, Zepto, Flipkart Minutes, or Amazon Minutes.',
        },
      };
    }

    // Do NOT treat a search/category/home page (e.g., https://blinkit.com/s/?q=...) as a product page
    if (!isSupportedProductPage(adapter, urlObj)) {
      return {
        product: null,
        diagnostics: {
          detectedPlatform: null,
          currentUrl: activeUrl,
          adapterSelected: `${adapter.adapterName} (Standby)`,
          extractionStatus: 'awaiting_page_capture',
          fieldsExtracted: [],
          timestamp: new Date().toISOString(),
          errorMessage: `Search or listing page detected on ${adapter.platform}. Open an individual product page (e.g., /prn/<slug>/prid/<id>) to attempt extraction.`,
        },
      };
    }

    try {
      const rawResult = adapter.extract(document, activeUrl);
      const diag = rawResult._diagnostics || {};
      const normalizedProduct = {
        platform: rawResult.platform,
        productName: rawResult.productName ?? null,
        brand: rawResult.brand ?? null,
        variant: rawResult.variant ?? null,
        quantity: rawResult.quantity ?? null,
        price: rawResult.price ?? null,
        mrp: rawResult.mrp ?? null,
        discount: rawResult.discount ?? null,
        offer: rawResult.offer ?? null,
        availability: rawResult.availability ?? null,
        deliveryEta: rawResult.deliveryEta ?? null,
        productUrl: rawResult.productUrl || activeUrl,
        source: 'extension',
        capturedAt: rawResult.capturedAt || new Date().toISOString(),
      };

      const diagnostics = {
        detectedPlatform: rawResult.platform,
        currentUrl: activeUrl,
        adapterSelected: diag.adapterSelected || adapter.adapterName,
        extractionStatus:
          diag.extractionStatus || (normalizedProduct.price !== null ? 'success' : 'running'),
        fieldsExtracted: Array.isArray(diag.fieldsExtracted) ? diag.fieldsExtracted : [],
        timestamp: normalizedProduct.capturedAt,
        errorMessage: diag.errorMessage || null,
      };

      return {
        product: normalizedProduct,
        diagnostics,
      };
    } catch (err) {
      return {
        product: null,
        diagnostics: {
          detectedPlatform: adapter.platform,
          currentUrl: activeUrl,
          adapterSelected: adapter.adapterName,
          extractionStatus: 'error',
          fieldsExtracted: [],
          timestamp: new Date().toISOString(),
          errorMessage: err instanceof Error ? err.message : 'DOM extraction failed.',
        },
      };
    }
  }

  let lastSentSignature = '';

  function extractAndTransmit(forceSend = false) {
    const result = runExtraction();
    if (result.diagnostics.adapterSelected === 'none') return result;

    const p = result.product;
    const hasValidProduct = Boolean(
      p && p.productName && typeof p.price === 'number' && !Number.isNaN(p.price) && p.price > 0
    );

    const signature = hasValidProduct
      ? `VALID::${p.platform}::${p.productName}::${p.price}::${p.productUrl}`
      : `DIAG::${result.diagnostics.extractionStatus}::${window.location.href}`;

    if (!forceSend && signature === lastSentSignature) {
      return result;
    }

    if (
      !hasValidProduct &&
      lastSentSignature.startsWith('VALID::') &&
      lastSentSignature.endsWith(window.location.href)
    ) {
      return result;
    }

    lastSentSignature = signature;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const storageUpdate = {
        lastDiagnostics: result.diagnostics,
      };
      if (hasValidProduct) {
        storageUpdate.lastDetectedProduct = result.product;
      }
      chrome.storage.local.set(storageUpdate);
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: 'QUICKHATKE_PAGE_OBSERVED',
          product: result.product,
          diagnostics: result.diagnostics,
        });
      } catch {
        // ignore if extension context invalidated
      }
    }

    return result;
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === 'QUICKHATKE_EXTRACT_PRODUCT') {
        const output = extractAndTransmit(true);
        sendResponse(output);
      }
      return true;
    });
  }

  extractAndTransmit(true);

  [600, 1500, 3000, 5000].forEach((delayMs) => {
    setTimeout(() => {
      extractAndTransmit(false);
    }, delayMs);
  });

  let observedUrl = window.location.href;
  let mutationTimer = null;

  const observer = new MutationObserver(() => {
    if (window.location.href !== observedUrl) {
      observedUrl = window.location.href;
      lastSentSignature = '';
      console.log('[QuickHatke] Current URL:', observedUrl);
    }
    if (mutationTimer) clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      extractAndTransmit(false);
    }, 500);
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
})();
