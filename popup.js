// popup.js - Hubquick Popup Control Logic

// API Configuration: Set this to your live Cloudflare Worker URL in production
const API_BASE_URL = 'http://127.0.0.1:8787'; // e.g. 'https://hubquick-backend.chaki.workers.dev'

const DEFAULT_SELECTORS = {
  cardContainer: '[data-selenium-test="line-items-card"], [data-key="deal-line-items"], .line-items-card, .line-item-section, .line-items-table-container',
  row: 'table tbody tr, .line-item-row, tr[data-id], .line-items-table tr',
  name: 'td:nth-child(2), [data-field="name"], .line-item-name, a[href*="/product/"], .product-name-cell',
  price: 'td:nth-child(3), [data-field="price"], .line-item-price, .price-cell, span[class*="price"]',
  quantity: 'td:nth-child(4), [data-field="quantity"], .line-item-quantity, .quantity-cell'
};

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

    // 1. If trial is still active (under 7 days), unlock.
    if (daysActive < 7) {
      callback(true, `Trial active. ${(7 - daysActive).toFixed(1)} days left.`);
      return;
    }

    // 2. If cached verification is under 24 hours and valid, unlock.
    const cacheAgeMs = Date.now() - licenseVerifiedAt;
    const cacheAgeHours = cacheAgeMs / (1000 * 60 * 60);
    if (licenseStatus === 'valid' && cacheAgeHours < 24) {
      callback(true, 'License verified (cached).');
      return;
    }

    // 3. If key exists, verify against server.
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

document.addEventListener('DOMContentLoaded', () => {
  // Select DOM Elements
  const unlockedView = document.getElementById('unlocked-view');
  const lockedView = document.getElementById('locked-view');
  const popupLicenseInput = document.getElementById('popup-license-input');
  const btnActivateLicense = document.getElementById('btn-activate-license');

  const activeProfileSelect = document.getElementById('active-profile-select');
  const profilesList = document.getElementById('profiles-list');
  const newProfileName = document.getElementById('new-profile-name');
  const newProfileSortBy = document.getElementById('new-profile-sortby');
  const newProfileDirection = document.getElementById('new-profile-direction');
  const btnAddProfile = document.getElementById('btn-add-profile');
  
  const selectorCard = document.getElementById('selector-card');
  const selectorRow = document.getElementById('selector-row');
  const selectorName = document.getElementById('selector-name');
  const selectorPrice = document.getElementById('selector-price');
  const selectorQty = document.getElementById('selector-qty');
  
  const btnSaveSelectors = document.getElementById('btn-save-selectors');
  const btnResetSelectors = document.getElementById('btn-reset-selectors');
  const syncStatus = document.getElementById('sync-status');

  // Trigger License Check
  checkLicense((isLicensed, statusMsg) => {
    console.log(`[Hubquick] License verification: ${statusMsg}`);
    if (isLicensed) {
      unlockedView.style.display = 'flex';
      lockedView.style.display = 'none';
      loadSettings();
    } else {
      unlockedView.style.display = 'none';
      lockedView.style.display = 'flex';
    }
  });

  // Activate license trigger
  btnActivateLicense.addEventListener('click', () => {
    const key = popupLicenseInput.value.trim();
    if (!key) {
      alert('Please enter a license key.');
      return;
    }

    btnActivateLicense.disabled = true;
    btnActivateLicense.textContent = 'Verifying key...';

    fetch(`${API_BASE_URL}/verify?key=${encodeURIComponent(key)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.valid === true) {
          chrome.storage.local.set({
            licenseKey: key,
            licenseStatus: 'valid',
            licenseVerifiedAt: Date.now()
          }, () => {
            alert('License successfully activated! Unlocking features...');
            // Reload active tab if it's local dev or HubSpot to hot-reload injected UI
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0] && (tabs[0].url.includes('hubspot.com') || tabs[0].url.includes('localhost') || tabs[0].url.includes('127.0.0.1'))) {
                chrome.tabs.reload(tabs[0].id);
              }
            });
            window.close();
          });
        } else {
          alert('Invalid license key. Please verify and try again.');
          btnActivateLicense.disabled = false;
          btnActivateLicense.textContent = 'Activate License';
        }
      })
      .catch(err => {
        console.error('Connection failure:', err);
        alert('Server unreachable. Details: ' + err.message);
        btnActivateLicense.disabled = false;
        btnActivateLicense.textContent = 'Activate License';
      });
  });

  // Load and Render Configuration
  function loadSettings() {
    chrome.storage.local.get(['selectors', 'profiles', 'activeProfileId'], (result) => {
      const selectors = result.selectors || DEFAULT_SELECTORS;
      const profiles = result.profiles || [];
      const activeProfileId = result.activeProfileId || '';

      // 1. Populate Active Profile Dropdown
      activeProfileSelect.innerHTML = profiles.map(p => 
        `<option value="${p.id}" ${p.id === activeProfileId ? 'selected' : ''}>${p.name}</option>`
      ).join('');

      // 2. Render Profiles List
      renderProfiles(profiles, activeProfileId);

      // 3. Fill Advanced Selector fields
      selectorCard.value = selectors.cardContainer;
      selectorRow.value = selectors.row;
      selectorName.value = selectors.name;
      selectorPrice.value = selectors.price;
      selectorQty.value = selectors.quantity;
    });
  }

  // Render profiles with Delete buttons
  function renderProfiles(profiles, activeId) {
    if (profiles.length === 0) {
      profilesList.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 10px;">No custom profiles configured.</div>`;
      return;
    }

    profilesList.innerHTML = profiles.map(p => `
      <div class="profile-row" data-id="${p.id}">
        <span style="font-weight: 500; ${p.id === activeId ? 'color: var(--primary-solid);' : ''}">
          ${p.name} <span style="font-size: 10px; color: var(--text-muted);">(${p.sortBy} ${p.direction})</span>
        </span>
        <div class="profile-actions">
          <button class="btn-icon delete-profile-btn" data-id="${p.id}" title="Delete profile">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Attach Delete action to dynamically generated rows
    document.querySelectorAll('.delete-profile-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        deleteProfile(id);
      });
    });
  }

  // Delete Custom Profile
  function deleteProfile(profileId) {
    chrome.storage.local.get(['profiles', 'activeProfileId'], (result) => {
      let profiles = result.profiles || [];
      let activeId = result.activeProfileId;

      // Filter out target profile
      profiles = profiles.filter(p => p.id !== profileId);
      
      // If we deleted the active profile, point active index to first remaining profile
      if (activeId === profileId) {
        activeId = profiles.length > 0 ? profiles[0].id : '';
      }

      chrome.storage.local.set({ profiles, activeProfileId: activeId }, () => {
        showStatus('Profile deleted');
        loadSettings();
      });
    });
  }

  // Save active profile choice on dropdown change
  activeProfileSelect.addEventListener('change', (e) => {
    const activeId = e.target.value;
    chrome.storage.local.set({ activeProfileId: activeId }, () => {
      showStatus('Active profile updated');
      loadSettings(); // refresh highlights
    });
  });

  // Add Custom Profile
  btnAddProfile.addEventListener('click', () => {
    const name = newProfileName.value.trim();
    const sortBy = newProfileSortBy.value;
    const direction = newProfileDirection.value;

    if (!name) {
      alert('Please specify a profile name.');
      return;
    }

    chrome.storage.local.get(['profiles'], (result) => {
      const profiles = result.profiles || [];
      const newId = 'profile_' + Date.now();

      const newProfile = {
        id: newId,
        name,
        sortBy,
        direction
      };

      profiles.push(newProfile);
      
      // Update local storage and set the newly created profile as active
      chrome.storage.local.set({ profiles, activeProfileId: newId }, () => {
        newProfileName.value = '';
        showStatus('New profile added');
        loadSettings();
      });
    });
  });

  // Save DOM Selectors Settings
  btnSaveSelectors.addEventListener('click', () => {
    const selectors = {
      cardContainer: selectorCard.value.trim(),
      row: selectorRow.value.trim(),
      name: selectorName.value.trim(),
      price: selectorPrice.value.trim(),
      quantity: selectorQty.value.trim()
    };

    // basic validation
    if (!selectors.cardContainer || !selectors.row || !selectors.name || !selectors.price) {
      alert('Please fill out all mandatory selectors (card container, row, name, and price).');
      return;
    }

    chrome.storage.local.set({ selectors }, () => {
      showStatus('Advanced selectors saved');
    });
  });

  // Reset DOM Selectors to default HubSpot selectors
  btnResetSelectors.addEventListener('click', () => {
    chrome.storage.local.set({ selectors: DEFAULT_SELECTORS }, () => {
      showStatus('Reset selectors to defaults');
      loadSettings();
    });
  });

  // Update sync status text temporarily
  function showStatus(text) {
    syncStatus.textContent = `✓ ${text}`;
    syncStatus.style.color = 'var(--success)';
    setTimeout(() => {
      syncStatus.textContent = 'Ready';
    }, 2000);
  }

  // Initialize
  loadSettings();
});
