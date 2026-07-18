// content.js - Hubquick HubSpot Line Items Content Script

// API Configuration: Set this to your live Cloudflare Worker URL in production
const API_BASE_URL = 'http://127.0.0.1:8787'; // e.g. 'https://hubquick-backend.chaki.workers.dev'

let currentConfig = {
  selectors: {
    cardContainer: '[data-selenium-test="line-items-card"], [data-key="deal-line-items"], .line-items-card, .line-item-section, .line-items-table-container',
    row: 'table tbody tr, .line-item-row, tr[data-id], .line-items-table tr',
    name: 'td:nth-child(2), [data-field="name"], .line-item-name, a[href*="/product/"], .product-name-cell',
    price: 'td:nth-child(3), [data-field="price"], .line-item-price, .price-cell, span[class*="price"]',
    quantity: 'td:nth-child(4), [data-field="quantity"], .line-item-quantity, .quantity-cell'
  },
  profiles: [],
  activeProfileId: ''
};

// Load configuration on startup
chrome.storage.local.get(['selectors', 'profiles', 'activeProfileId'], (result) => {
  if (result.selectors) currentConfig.selectors = result.selectors;
  if (result.profiles) currentConfig.profiles = result.profiles;
  if (result.activeProfileId) currentConfig.activeProfileId = result.activeProfileId;
  
  initializeObserver();
});

// Watch for storage updates (e.g. from popup configuration changes)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    let needsReinject = false;
    if (changes.selectors) {
      currentConfig.selectors = changes.selectors.newValue;
      needsReinject = true;
    }
    if (changes.profiles) {
      currentConfig.profiles = changes.profiles.newValue;
      updateDropdownOptions();
    }
    if (changes.activeProfileId) {
      currentConfig.activeProfileId = changes.activeProfileId.newValue;
      const selectEl = document.querySelector('#hubquick-profile-select');
      if (selectEl) selectEl.value = currentConfig.activeProfileId;
    }
    
    if (needsReinject) {
      removePanel();
      checkForTargetAndInject();
    }
  }
});

// Setup Mutation Observer to support SPA navigation on HubSpot
let observer = null;
function initializeObserver() {
  if (observer) observer.disconnect();
  
  // Run immediate check
  checkForTargetAndInject();
  
  observer = new MutationObserver((mutations) => {
    // Perform a lightweight check for target elements
    checkForTargetAndInject();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function removePanel() {
  const panel = document.querySelector('#hubquick-floating-container');
  if (panel) panel.remove();
}

// License verification checker
function checkLicense(callback) {
  chrome.storage.local.get([
    'installTimestamp',
    'licenseKey',
    'licenseVerifiedAt',
    'licenseStatus'
  ], (result) => {
    let installTimestamp = result.installTimestamp;
    if (!installTimestamp) {
      installTimestamp = Date.now();
      chrome.storage.local.set({ installTimestamp });
    }

    const licenseKey = result.licenseKey || '';
    const licenseVerifiedAt = result.licenseVerifiedAt || 0;
    const licenseStatus = result.licenseStatus || 'none';

    const daysActive = (Date.now() - installTimestamp) / (1000 * 60 * 60 * 24);

    // 1. Trial is active (under 7 days), unlock.
    if (daysActive < 7) {
      callback(true, `Trial active. ${(7 - daysActive).toFixed(1)} days left.`);
      return;
    }

    // 2. Cached verification is valid and under 24 hours, unlock.
    const cacheAgeMs = Date.now() - licenseVerifiedAt;
    const cacheAgeHours = cacheAgeMs / (1000 * 60 * 60);
    if (licenseStatus === 'valid' && cacheAgeHours < 24) {
      callback(true, 'License verified (cached).');
      return;
    }

    // 3. Key exists, verify against server.
    if (licenseKey) {
      fetch(`${API_BASE_URL}/verify?key=${encodeURIComponent(licenseKey)}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.valid === true) {
            chrome.storage.local.set({
              licenseStatus: 'valid',
              licenseVerifiedAt: Date.now()
            }, () => {
              callback(true, 'License verified on server.');
            });
          } else {
            chrome.storage.local.set({ licenseStatus: 'invalid' }, () => {
              callback(false, 'Invalid license key.');
            });
          }
        })
        .catch(err => {
          console.error('Error during license verification check:', err);
          if (licenseStatus === 'valid') {
            callback(true, 'Offline fallback (previously valid).');
          } else {
            callback(false, 'Verification server offline.');
          }
        });
      return;
    }

    // 4. No license key and trial expired.
    callback(false, 'Trial expired.');
  });
}

function checkForTargetAndInject() {
  const target = document.querySelector(currentConfig.selectors.cardContainer);
  if (!target) return;

  checkLicense((isLicensed, statusMsg) => {
    console.log(`[Hubquick] License verification: ${statusMsg}`);
    
    // Check if panel is already injected
    const existing = document.querySelector('#hubquick-floating-container');
    
    if (isLicensed) {
      // If active panel is already there and NOT locked, do nothing
      if (existing && !existing.querySelector('.hubquick-panel-locked')) {
        return;
      }
      injectPanel(target);
    } else {
      // If locked panel is already there, do nothing
      if (existing && existing.querySelector('.hubquick-panel-locked')) {
        return;
      }
      injectLockedPanel(target);
    }
  });
}

// Inject locked interface card
function injectLockedPanel(targetElement) {
  const existing = document.querySelector('#hubquick-floating-container');
  if (existing) {
    existing.remove();
  }

  const container = document.createElement('div');
  container.id = 'hubquick-floating-container';
  container.className = 'hubquick-panel-container';

  container.innerHTML = `
    <div class="hubquick-panel hubquick-panel-locked" style="background: rgba(20, 10, 15, 0.95) !important; border: 1px solid rgba(239, 68, 68, 0.4) !important; display: flex !important; flex-direction: column !important; gap: 12px !important; align-items: stretch !important; width: 100% !important; box-sizing: border-box !important;">
      <div style="display: flex !important; justify-content: space-between !important; align-items: center !important; width: 100% !important;">
        <span class="hubquick-panel-brand" style="color: #ef4444 !important; font-weight: 700 !important; font-size: 15px !important; display: flex !important; align-items: center !important; gap: 6px !important;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          Hubquick (Trial Expired)
        </span>
        <a href="https://buy.stripe.com/mock_hubquick_checkout" target="_blank" class="hubquick-btn" style="background: linear-gradient(135deg, #ef4444, #f59e0b) !important; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3) !important; text-decoration: none !important; color: white !important; font-size: 12px !important; font-weight: 600 !important; padding: 6px 12px !important; border-radius: 6px !important;">
          Purchase License
        </a>
      </div>
      <div style="font-size: 12px !important; color: var(--text-muted) !important; line-height: 1.4 !important; font-family: var(--font-family) !important;">
        Your 7-day trial of Hubquick has expired. Paste a valid license key below to reactivate sorting and clipboard exporting.
      </div>
      <div style="display: flex !important; gap: 8px !important; align-items: center !important; width: 100% !important;">
        <input type="text" id="hubquick-license-input" placeholder="Paste license key (UUID v4)" class="hubquick-input" style="flex: 1 !important; height: 32px !important; box-sizing: border-box !important;" />
        <button class="hubquick-btn" id="hubquick-btn-activate" style="padding: 6px 16px !important; height: 32px !important;">Activate</button>
      </div>
    </div>
  `;

  targetElement.parentNode.insertBefore(container, targetElement);

  container.querySelector('#hubquick-btn-activate').addEventListener('click', () => {
    const keyInput = container.querySelector('#hubquick-license-input');
    const key = keyInput.value.trim();
    if (!key) {
      alert('Please enter a license key.');
      return;
    }

    const btn = container.querySelector('#hubquick-btn-activate');
    btn.disabled = true;
    btn.textContent = 'Verifying...';

    fetch(`${API_BASE_URL}/verify?key=${encodeURIComponent(key)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.valid === true) {
          chrome.storage.local.set({
            licenseKey: key,
            licenseStatus: 'valid',
            licenseVerifiedAt: Date.now()
          }, () => {
            showToast('✨ License successfully activated!');
            removePanel();
            checkForTargetAndInject();
          });
        } else {
          alert('Invalid license key. Please check the format (UUID v4) and try again.');
          btn.disabled = false;
          btn.textContent = 'Activate';
        }
      })
      .catch(err => {
        alert('Server unreachable. Could not verify key. Details: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Activate';
      });
  });
}

// Inject floating actions panel above target
function injectPanel(targetElement) {
  const existing = document.querySelector('#hubquick-floating-container');
  if (existing) {
    existing.remove();
  }

  const container = document.createElement('div');
  container.id = 'hubquick-floating-container';
  container.className = 'hubquick-panel-container';

  // HTML layout
  container.innerHTML = `
    <div class="hubquick-panel">
      <div class="hubquick-panel-left">
        <span class="hubquick-panel-brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="hubquick-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#6366f1" />
                <stop offset="50%" stop-color="#a855f7" />
                <stop offset="100%" stop-color="#ec4899" />
              </linearGradient>
            </defs>
            <path d="M13 10V3L4 14H11V21L20 10H13Z" fill="url(#hubquick-grad)"/>
          </svg>
          Hubquick
        </span>
        <div class="hubquick-profile-selector-container">
          <span class="hubquick-label">Profile:</span>
          <select class="hubquick-select" id="hubquick-profile-select">
            <!-- Populated dynamically -->
          </select>
        </div>
      </div>
      <div class="hubquick-panel-right">
        <button class="hubquick-btn hubquick-btn-secondary" id="hubquick-btn-sort">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="21" y1="10" x2="7" y2="10"></line>
            <line x1="21" y1="6" x2="3" y2="6"></line>
            <line x1="21" y1="14" x2="11" y2="14"></line>
            <line x1="21" y1="18" x2="15" y2="18"></line>
          </svg>
          Sort UI
        </button>
        <button class="hubquick-btn" id="hubquick-btn-copy">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy JSON
        </button>
      </div>
    </div>
  `;
  
  // Inject exactly above the target container element
  targetElement.parentNode.insertBefore(container, targetElement);
  
  // Populate profiles and wire events
  updateDropdownOptions();
  
  container.querySelector('#hubquick-profile-select').addEventListener('change', (e) => {
    const val = e.target.value;
    currentConfig.activeProfileId = val;
    chrome.storage.local.set({ activeProfileId: val });
  });
  
  container.querySelector('#hubquick-btn-copy').addEventListener('click', handleCopyAction);
  container.querySelector('#hubquick-btn-sort').addEventListener('click', handleSortUIAction);
}

function updateDropdownOptions() {
  const selectEl = document.querySelector('#hubquick-profile-select');
  if (!selectEl) return;
  
  selectEl.innerHTML = currentConfig.profiles.map(p => 
    `<option value="${p.id}" ${p.id === currentConfig.activeProfileId ? 'selected' : ''}>${p.name}</option>`
  ).join('');
}

// Robust Price Parser
function parsePrice(text) {
  if (!text) return 0;
  // Remove non-numeric characters except dots, commas, minus signs
  let cleaned = text.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return 0;
  
  const commaIndex = cleaned.lastIndexOf(',');
  const dotIndex = cleaned.lastIndexOf('.');
  
  if (commaIndex > dotIndex) {
    // Comma is decimal separator (e.g. 1.234,56 or 1234,56)
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (dotIndex > commaIndex) {
    // Dot is decimal separator (e.g. 1,234.56 or 1234.56)
    cleaned = cleaned.replace(/,/g, '');
  } else if (commaIndex !== -1) {
    // Only comma exists. Check if it looks like decimal (e.g., 12,50)
    if (cleaned.length - commaIndex === 3) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(',', '');
    }
  }
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// Extract Line Items from DOM
function extractLineItems() {
  const container = document.querySelector(currentConfig.selectors.cardContainer);
  if (!container) return [];
  
  const rows = container.querySelectorAll(currentConfig.selectors.row);
  const items = [];
  
  rows.forEach((row, index) => {
    // Skip headers or empty rows by verifying we find a name or price
    const nameEl = row.querySelector(currentConfig.selectors.name);
    const priceEl = row.querySelector(currentConfig.selectors.price);
    
    if (!nameEl && !priceEl) return;
    
    const name = nameEl ? nameEl.textContent.trim() : `Product ${index + 1}`;
    const rawPrice = priceEl ? priceEl.textContent.trim() : '$0.00';
    const price = parsePrice(rawPrice);
    
    const qtyEl = row.querySelector(currentConfig.selectors.quantity);
    const quantity = qtyEl ? parseInt(qtyEl.textContent.replace(/[^\d]/g, '') || '1', 10) : 1;
    
    items.push({
      id: index,
      name,
      price,
      rawPrice,
      quantity,
      rowElement: row
    });
  });
  
  return items;
}

// Sort logic helper
function getSortedItems(items, profile) {
  if (!profile) return items;
  
  return [...items].sort((a, b) => {
    let valA = a[profile.sortBy];
    let valB = b[profile.sortBy];
    
    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }
    
    if (valA < valB) return profile.direction === 'asc' ? -1 : 1;
    if (valA > valB) return profile.direction === 'asc' ? 1 : -1;
    return 0;
  });
}

// Click Handler: Copy JSON
function handleCopyAction() {
  const btn = document.querySelector('#hubquick-btn-copy');
  if (btn) btn.disabled = true;
  
  try {
    const rawItems = extractLineItems();
    if (rawItems.length === 0) {
      showToast('⚠️ No line items found to export.', 'warning');
      if (btn) btn.disabled = false;
      return;
    }
    
    const activeProfile = currentConfig.profiles.find(p => p.id === currentConfig.activeProfileId);
    const sortedItems = getSortedItems(rawItems, activeProfile);
    
    // Format JSON for clipboard (omitting temporary DOM elements)
    const jsonOutput = sortedItems.map(item => ({
      name: item.name,
      price: item.price,
      rawPrice: item.rawPrice,
      quantity: item.quantity
    }));
    
    const clipboardText = JSON.stringify(jsonOutput, null, 2);
    
    // Copy using Clipboard API
    navigator.clipboard.writeText(clipboardText).then(() => {
      showToast(`✨ Copied ${jsonOutput.length} line items (Sorted: ${activeProfile ? activeProfile.name : 'None'})!`);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = clipboardText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      showToast(`✨ Copied ${jsonOutput.length} line items!`);
    });
    
  } catch (error) {
    console.error('Error during Hubquick copy:', error);
    showToast('❌ Error parsing line items.', 'error');
  } finally {
    if (btn) {
      setTimeout(() => { btn.disabled = false; }, 500);
    }
  }
}

// Click Handler: Sort UI Rows Visually
function handleSortUIAction() {
  try {
    const items = extractLineItems();
    if (items.length === 0) {
      showToast('⚠️ No line items found to sort.', 'warning');
      return;
    }
    
    const activeProfile = currentConfig.profiles.find(p => p.id === currentConfig.activeProfileId);
    if (!activeProfile) {
      showToast('⚠️ Select a sort profile first.', 'warning');
      return;
    }
    
    const sortedItems = getSortedItems(items, activeProfile);
    
    // Perform Visual DOM Sorting
    // We find the parent body of the row elements and append them in sorted order.
    // React table bodies usually support appendChild for rearranging, though state changes may reset it.
    let reorderedCount = 0;
    sortedItems.forEach(item => {
      const el = item.rowElement;
      if (el && el.parentNode) {
        el.parentNode.appendChild(el);
        reorderedCount++;
      }
    });
    
    showToast(`🔄 Reordered ${reorderedCount} items visually: ${activeProfile.name}`);
  } catch (error) {
    console.error('Error during Hubquick UI Sort:', error);
    showToast('❌ Error sorting UI rows.', 'error');
  }
}

// Toast notification helper
function showToast(message, type = 'success') {
  // Remove existing toast
  const existing = document.querySelector('.hubquick-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'hubquick-toast';
  if (type === 'warning') {
    toast.style.background = 'rgba(245, 158, 11, 0.95)';
  } else if (type === 'error') {
    toast.style.background = 'rgba(239, 68, 68, 0.95)';
  }
  
  // Icon based on type
  const icon = type === 'success' 
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

  toast.innerHTML = `${icon} <span>${message}</span>`;
  document.body.appendChild(toast);
  
  // Auto dismiss after 2.5s
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}
