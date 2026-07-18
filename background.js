// background.js - Hubquick Service Worker

const DEFAULT_CONFIG = {
  selectors: {
    // Selectors for finding elements on HubSpot pages.
    // We target common line items panel containers, table rows, and fields.
    cardContainer: '[data-selenium-test="line-items-card"], [data-key="deal-line-items"], .line-items-card, .line-item-section, .line-items-table-container',
    row: 'table tbody tr, .line-item-row, tr[data-id], .line-items-table tr',
    name: 'td:nth-child(2), [data-field="name"], .line-item-name, a[href*="/product/"], .product-name-cell',
    price: 'td:nth-child(3), [data-field="price"], .line-item-price, .price-cell, span[class*="price"]',
    quantity: 'td:nth-child(4), [data-field="quantity"], .line-item-quantity, .quantity-cell'
  },
  profiles: [
    {
      id: 'price-desc',
      name: 'Price: High to Low',
      sortBy: 'price',
      direction: 'desc'
    },
    {
      id: 'price-asc',
      name: 'Price: Low to High',
      sortBy: 'price',
      direction: 'asc'
    },
    {
      id: 'name-asc',
      name: 'Product Name: A-Z',
      sortBy: 'name',
      direction: 'asc'
    }
  ],
  activeProfileId: 'price-desc'
};

// Initialize configuration on extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Hubquick Chrome Extension Installed.', details.reason);
  
  chrome.storage.local.get(['selectors', 'profiles', 'activeProfileId'], (result) => {
    // Seed storage with defaults if not already set
    const update = {};
    if (!result.selectors) update.selectors = DEFAULT_CONFIG.selectors;
    if (!result.profiles) update.profiles = DEFAULT_CONFIG.profiles;
    if (!result.activeProfileId) update.activeProfileId = DEFAULT_CONFIG.activeProfileId;

    if (Object.keys(update).length > 0) {
      chrome.storage.local.set(update, () => {
        console.log('Seeded Hubquick default settings in local storage:', update);
      });
    }
  });
});

// Message listener stub for handshake / token verification verification
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'verifyToken') {
    console.log('Verifying token (Stubbed backend handshake)...');
    // Simulated $0 local serverless handshake success
    setTimeout(() => {
      sendResponse({ status: 'success', message: 'Token verified successfully via offline/local state.' });
    }, 300);
    return true; // Keeps message channel open for async response
  }
});
