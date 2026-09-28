const DEFAULT_BACKEND_URLS = [
  'https://ais-dev-dpkzivteikmeogcmjt3rtl-277321561381.asia-east1.run.app',
  'http://localhost:3000',
];

function resolveBackendUrls(cb) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['backendUrl'], (items) => {
      const list = [];
      if (items && items.backendUrl) list.push(items.backendUrl.replace(/\/+$/, ''));
      for (const u of DEFAULT_BACKEND_URLS) {
        if (!list.includes(u)) list.push(u);
      }
      cb(list);
    });
  } else {
    cb(DEFAULT_BACKEND_URLS);
  }
}

async function fetchFromAvailableBackend(path, options) {
  return new Promise((resolve, reject) => {
    resolveBackendUrls(async (urls) => {
      for (const base of urls) {
        try {
          const res = await fetch(`${base}${path}`, options);
          if (res.ok) {
            const data = await res.json();
            resolve(data);
            return;
          }
        } catch {
          // try next
        }
      }
      reject(new Error('All backend URLs unreachable'));
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const productNameEl = document.getElementById('product-name');
  const platformsListEl = document.getElementById('platforms-list');
  const winnerBoxEl = document.getElementById('winner-box');

  async function renderComparison(productTitle, statusHint) {
    productNameEl.textContent = statusHint
      ? `${productTitle} (${statusHint})`
      : productTitle;
    try {
      const data = await fetchFromAvailableBackend('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: productTitle, selectedProduct: productTitle }),
      });
      platformsListEl.innerHTML = '';

      (data.platforms || []).forEach((p) => {
        const row = document.createElement('div');
        row.className = 'row';
        const left = document.createElement('span');
        left.textContent = p.name;
        const right = document.createElement('span');
        if (p.data_status === 'live' && p.price) {
          right.className = 'price';
          right.textContent = `${p.price}${p.delivery_time ? ' · ' + p.delivery_time : ''}`;
        } else {
          right.className = 'unavailable';
          right.textContent = 'LIVE DATA UNAVAILABLE';
        }
        row.appendChild(left);
        row.appendChild(right);
        platformsListEl.appendChild(row);
      });

      if (data.best_price) {
        winnerBoxEl.style.display = 'block';
        winnerBoxEl.textContent = `💰 Lowest price: ${data.best_price}`;
      } else {
        winnerBoxEl.style.display = 'none';
      }
    } catch {
      productNameEl.textContent = 'Unable to connect to QuickHatke backend.';
    }
  }

  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (!activeTab || !activeTab.id) {
        productNameEl.textContent = 'Open a supported product page';
        return;
      }
      chrome.tabs.sendMessage(
        activeTab.id,
        { type: 'QUICKHATKE_EXTRACT_PRODUCT' },
        async (response) => {
          if (chrome.runtime.lastError || !response) {
            productNameEl.textContent = 'Open a supported product page';
            renderComparison('Classmate Notebook A4 Single Line (172 Pages)', 'Open a supported product page');
            return;
          }
          const { product, diagnostics } = response;
          if (product && product.productName && typeof product.price === 'number') {
            try {
              await fetchFromAvailableBackend('/api/extension/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(product),
              });
            } catch {
              // ignore
            }
            renderComparison(product.productName, 'Live data received');
          } else if (diagnostics && diagnostics.extractionStatus === 'blocked') {
            productNameEl.textContent = 'Platform data unavailable';
          } else {
            renderComparison('Classmate Notebook A4 Single Line (172 Pages)', 'Open a supported product page');
          }
        }
      );
    });
  } else {
    renderComparison('Classmate Notebook A4 Single Line (172 Pages)');
  }
});
