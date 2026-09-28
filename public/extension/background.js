/**
 * QuickHatke Chrome Extension — Background Service Worker (Manifest V3)
 * Receives normalized product structures & diagnostics from content-script.js,
 * persists them in chrome.storage.local, broadcasts them to open QuickHatke tabs,
 * and forwards them to the QuickHatke Backend API (/api/extension/ingest & /api/extension/diagnostics).
 */

const FALLBACK_BACKEND_URLS = [
  'https://ais-dev-dpkzivteikmeogcmjt3rtl-277321561381.asia-east1.run.app',
  'https://ais-pre-dpkzivteikmeogcmjt3rtl-277321561381.asia-east1.run.app',
  'http://localhost:3000',
];

function getCandidateBackendUrls(storedUrl) {
  const urls = [];
  if (storedUrl && typeof storedUrl === 'string' && storedUrl.startsWith('http')) {
    urls.push(storedUrl.replace(/\/+$/, ''));
  }
  for (const fallback of FALLBACK_BACKEND_URLS) {
    if (!urls.includes(fallback)) {
      urls.push(fallback);
    }
  }
  return urls;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return false;

  if (message.type === 'QUICKHATKE_PAGE_OBSERVED' || message.type === 'QUICKHATKE_PRODUCT_DETECTED') {
    const product = message.product || message.payload || null;
    const diagnostics = message.diagnostics || null;
    const hasValidProduct = Boolean(
      product &&
        product.productName &&
        typeof product.price === 'number' &&
        !Number.isNaN(product.price) &&
        product.price > 0
    );

    const storagePayload = {};
    if (diagnostics) {
      storagePayload.lastDiagnostics = diagnostics;
    }
    if (hasValidProduct) {
      storagePayload.lastDetectedProduct = product;
    }
    if (Object.keys(storagePayload).length > 0) {
      chrome.storage.local.set(storagePayload);
    }

    // 1. Broadcast directly to any open QuickHatke web app tabs so their content-script
    // can immediately postMessage to the React app and POST to its same-origin /api/extension/ingest
    if (chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs || []) {
          if (tab.id) {
            try {
              chrome.tabs.sendMessage(tab.id, {
                type: 'QUICKHATKE_BROADCAST_CAPTURE',
                product: hasValidProduct ? product : null,
                diagnostics,
              });
            } catch {
              // Ignore tabs without content script
            }
          }
        }
      });
    }

    // 2. Also POST directly to known backend URLs
    chrome.storage.local.get(['backendUrl'], async (items) => {
      const candidateUrls = getCandidateBackendUrls(items && items.backendUrl);

      for (const baseUrl of candidateUrls) {
        let succeeded = false;
        if (diagnostics) {
          try {
            const res = await fetch(`${baseUrl}/api/extension/diagnostics`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(diagnostics),
            });
            if (res.ok) succeeded = true;
          } catch {
            // Try next candidate URL
          }
        }

        if (hasValidProduct) {
          try {
            const res = await fetch(`${baseUrl}/api/extension/ingest`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(product),
            });
            if (res.ok) succeeded = true;
          } catch {
            // Try next candidate URL
          }
        }

        if (succeeded) break;
      }
    });

    sendResponse({ ok: true });
    return true;
  }

  return false;
});
