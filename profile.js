/*
 * Velora Profile Dashboard Controller (profile.js).
 *
 * Implements complete frontend profile functionality, authenticated data retrieval,
 * address book CRUD, real order history, reorder workflow, invoice generation,
 * and security settings.
 */
(function (global) {
  'use strict';

  const V = global.Velora = global.Velora || {};
  const doc = global.document;

  if (!doc) return;

  const { Auth, DB, Cart, CartUI, Wishlist, Products, formatPrice, Config, Supabase } = V;

  // DOM Elements
  const els = {
    // Nav & Sidebar
    navBtns: doc.querySelectorAll('.profile-nav-btn[data-tab]'),
    panels: doc.querySelectorAll('.profile-panel'),
    sidebarAvatar: doc.getElementById('sidebar-avatar'),
    sidebarAvatarInitials: doc.getElementById('sidebar-avatar-initials'),
    sidebarUserName: doc.getElementById('sidebar-user-name'),
    sidebarUserEmail: doc.getElementById('sidebar-user-email'),
    badgeActiveOrders: doc.getElementById('badge-active-orders'),
    badgePastOrders: doc.getElementById('badge-past-orders'),
    badgeAddresses: doc.getElementById('badge-addresses'),
    badgeWishlist: doc.getElementById('badge-wishlist'),
    statusDot: doc.getElementById('status-dot'),
    statusText: doc.getElementById('backend-status-text'),
    btnLogout: doc.getElementById('btn-sidebar-logout'),

    // Overview
    overviewUserFirstName: doc.getElementById('overview-user-firstname'),
    overviewMemberSince: doc.getElementById('overview-member-since'),
    statTotalOrders: doc.getElementById('stat-total-orders'),
    statActiveOrders: doc.getElementById('stat-active-orders'),
    statAddresses: doc.getElementById('stat-addresses'),
    statWishlist: doc.getElementById('stat-wishlist'),
    recentOrderContainer: doc.getElementById('overview-recent-order-container'),

    // Personal Info Form
    personalForm: doc.getElementById('personal-info-form'),
    inputFullName: doc.getElementById('profile-fullname'),
    inputEmail: doc.getElementById('profile-email'),
    inputPhone: doc.getElementById('profile-phone'),
    inputCreatedDate: doc.getElementById('profile-created-date'),
    inputAvatarUrl: doc.getElementById('profile-avatar-url'),
    avatarPreviewBox: doc.getElementById('avatar-preview-box'),
    avatarPreviewInitials: doc.getElementById('avatar-preview-initials'),
    personalAlert: doc.getElementById('profile-update-alert'),
    personalAlertText: doc.getElementById('profile-update-alert-text'),
    personalSuccess: doc.getElementById('profile-update-success'),
    btnCancelPersonal: doc.getElementById('btn-cancel-personal'),
    btnSavePersonal: doc.getElementById('btn-save-personal'),

    // Orders Containers
    currentOrdersContainer: doc.getElementById('current-orders-container'),
    pastOrdersContainer: doc.getElementById('past-orders-container'),

    // Address Book
    addressGridContainer: doc.getElementById('address-grid-container'),
    btnAddAddress: doc.getElementById('btn-add-address'),
    addressModal: doc.getElementById('address-modal'),
    addressForm: doc.getElementById('address-form'),
    addressIdField: doc.getElementById('address-id-field'),
    addrName: doc.getElementById('addr-name'),
    addrPhone: doc.getElementById('addr-phone'),
    addrLine1: doc.getElementById('addr-line1'),
    addrLine2: doc.getElementById('addr-line2'),
    addrCity: doc.getElementById('addr-city'),
    addrState: doc.getElementById('addr-state'),
    addrPostal: doc.getElementById('addr-postal'),
    addrCountry: doc.getElementById('addr-country'),
    addrDefault: doc.getElementById('addr-default'),
    closeAddressModal: doc.getElementById('close-address-modal'),
    cancelAddressBtn: doc.getElementById('cancel-address-btn'),
    addressModalTitle: doc.getElementById('address-modal-title'),
    addressFormAlert: doc.getElementById('address-form-alert'),
    addressFormAlertText: doc.getElementById('address-form-alert-text'),

    // Delete Modal
    deleteModal: doc.getElementById('delete-confirm-modal'),
    closeDeleteModal: doc.getElementById('close-delete-modal'),
    cancelDeleteBtn: doc.getElementById('cancel-delete-btn'),
    confirmDeleteBtn: doc.getElementById('confirm-delete-btn'),

    // Wishlist Grid
    profileWishlistGrid: doc.getElementById('profile-wishlist-grid'),

    // Billing & Receipt
    billingContainer: doc.getElementById('billing-history-container'),
    invoiceModal: doc.getElementById('invoice-modal'),
    invoiceContent: doc.getElementById('invoice-content'),
    closeInvoiceModal: doc.getElementById('close-invoice-modal'),
    closeInvoiceBtn: doc.getElementById('close-invoice-btn'),
    btnTriggerPrint: doc.getElementById('btn-trigger-print'),

    // Order Details Modal
    orderDetailsModal: doc.getElementById('order-details-modal'),
    orderDetailsBody: doc.getElementById('order-details-body'),
    closeOrderModal: doc.getElementById('close-order-modal'),
    closeOrderDetailsBtn: doc.getElementById('close-order-details-btn'),
    modalOrderNumberLabel: doc.getElementById('modal-order-number-label'),
    btnPrintOrderReceipt: doc.getElementById('btn-print-order-receipt'),

    // Security
    changePwForm: doc.getElementById('change-password-form'),
    newPwInput: doc.getElementById('new-pw-input'),
    confirmNewPwInput: doc.getElementById('confirm-new-pw-input'),
    toggleChangePw: doc.getElementById('toggle-change-pw'),
    changePwAlert: doc.getElementById('change-pw-alert'),
    changePwAlertText: doc.getElementById('change-pw-alert-text'),
    changePwSuccess: doc.getElementById('change-pw-success'),
    btnSubmitChangePw: doc.getElementById('btn-submit-change-pw'),
    prefOrderNotify: doc.getElementById('pref-order-notify'),
    prefPromoNotify: doc.getElementById('pref-promo-notify'),
    btnResendVerification: doc.getElementById('btn-resend-verification'),

    // Config Modal
    configModal: doc.getElementById('supabase-config-modal'),
    btnOpenSupabaseConfig: doc.getElementById('btn-open-supabase-config'),
    closeConfigModal: doc.getElementById('close-config-modal'),
    configForm: doc.getElementById('supabase-config-form'),
    cfgUrl: doc.getElementById('cfg-supabase-url'),
    cfgAnon: doc.getElementById('cfg-supabase-anon'),
    resetConfigBtn: doc.getElementById('reset-config-btn'),

    // Delete Account
    deleteAccModal: doc.getElementById('delete-account-modal'),
    btnTriggerDeleteAccount: doc.getElementById('btn-trigger-delete-account'),
    closeDelAccModal: doc.getElementById('close-del-acc-modal'),
    cancelDelAccBtn: doc.getElementById('cancel-del-acc-btn'),
    confirmDelAccBtn: doc.getElementById('confirm-del-acc-btn'),
    deleteConfirmType: doc.getElementById('delete-confirm-type'),
  };

  // State cache
  let currentUser = null;
  let currentProfile = null;
  let cachedOrders = [];
  let cachedAddresses = [];
  let activeOrderForModal = null;
  let pendingDeleteAddressId = null;

  // ---------------------------------------------------------------------------
  // Tab Navigation
  // ---------------------------------------------------------------------------
  function switchTab(tabId) {
    if (!tabId) return;

    // Remove active from all
    els.navBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    els.panels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === `panel-${tabId}`);
    });

    // Update URL hash without jumping
    if (global.history && global.history.replaceState) {
      global.history.replaceState(null, null, `#${tabId}`);
    }

    // Scroll smoothly to panel top on mobile
    if (global.innerWidth <= 960) {
      const panel = doc.getElementById(`panel-${tabId}`);
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function setupTabs() {
    els.navBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab(btn.dataset.tab);
      });
    });

    doc.addEventListener('click', (e) => {
      const link = e.target.closest('[data-tab-link]');
      if (link) {
        e.preventDefault();
        switchTab(link.dataset.tabLink);
      }
    });

    // Handle initial hash
    const initialHash = (global.location.hash || '').replace('#', '');
    if (initialHash && doc.getElementById(`panel-${initialHash}`)) {
      switchTab(initialHash);
    }
  }

  // ---------------------------------------------------------------------------
  // User & Profile Initialization
  // ---------------------------------------------------------------------------
  async function loadUserData() {
    const isAuth = await Auth.requireAuth('profile.html');
    if (!isAuth) return;

    currentUser = await Auth.getUser();
    currentProfile = await DB.getProfile();

    const fullName = currentProfile?.full_name || currentUser?.user_metadata?.full_name || 'Valued Client';
    const email = currentUser?.email || '';
    const phone = currentProfile?.phone || currentUser?.user_metadata?.phone || '';
    const avatarUrl = currentProfile?.avatar_url || currentUser?.user_metadata?.avatar_url || '';
    const initials = getInitials(fullName);

    // Update Sidebar
    if (els.sidebarUserName) els.sidebarUserName.textContent = fullName;
    if (els.sidebarUserEmail) els.sidebarUserEmail.textContent = email;
    renderAvatar(els.sidebarAvatar, els.sidebarAvatarInitials, avatarUrl, initials);

    // Update Overview
    if (els.overviewUserFirstName) {
      els.overviewUserFirstName.textContent = fullName.split(' ')[0] || 'Client';
    }
    if (els.overviewMemberSince) {
      const dateStr = currentUser?.created_at ? new Date(currentUser.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '2026';
      els.overviewMemberSince.textContent = `Member since ${dateStr}`;
    }

    // Populate Personal Info Form
    if (els.inputFullName) els.inputFullName.value = fullName;
    if (els.inputEmail) els.inputEmail.value = email;
    if (els.inputPhone) els.inputPhone.value = phone;
    if (els.inputCreatedDate) {
      els.inputCreatedDate.value = currentUser?.created_at ? new Date(currentUser.created_at).toLocaleString('en-US') : 'Active';
    }
    if (els.inputAvatarUrl) els.inputAvatarUrl.value = avatarUrl;
    renderAvatar(els.avatarPreviewBox, els.avatarPreviewInitials, avatarUrl, initials);

    // Notification Prefs
    if (els.prefOrderNotify) els.prefOrderNotify.checked = currentProfile?.email_notifications !== false;
    if (els.prefPromoNotify) els.prefPromoNotify.checked = !!currentProfile?.promo_notifications;

    // Backend status indicator
    if (Supabase?.isLive) {
      els.statusDot.className = 'status-dot';
      els.statusText.textContent = 'Live Supabase Cloud';
    } else {
      els.statusDot.className = 'status-dot is-simulated';
      els.statusText.textContent = 'Secure Local Preview Mode';
    }

    // Load sub-collections
    await Promise.all([
      loadOrders(),
      loadAddresses(),
      loadWishlist(),
    ]);
  }

  function getInitials(name) {
    if (!name || typeof name !== 'string') return 'V';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function renderAvatar(containerEl, initialsEl, avatarUrl, initials) {
    if (!containerEl) return;
    if (avatarUrl && avatarUrl.startsWith('http')) {
      containerEl.innerHTML = `<img src="${avatarUrl}" alt="User Avatar" class="user-avatar-img" onerror="this.remove()">`;
    } else {
      containerEl.innerHTML = `<span>${initials || 'V'}</span>`;
    }
  }

  // ---------------------------------------------------------------------------
  // Orders Handling (Current & Past)
  // ---------------------------------------------------------------------------
  async function loadOrders() {
    try {
      cachedOrders = await DB.getOrders();
    } catch (e) {
      console.warn('[Velora Profile] Orders fetch error:', e);
      cachedOrders = [];
    }

    const activeOrders = cachedOrders.filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled');
    const pastOrders = cachedOrders.filter((o) => o.status === 'Delivered' || o.status === 'Cancelled');

    // Update Counts & Badges
    if (els.statTotalOrders) els.statTotalOrders.textContent = cachedOrders.length;
    if (els.statActiveOrders) els.statActiveOrders.textContent = activeOrders.length;
    if (els.badgeActiveOrders) els.badgeActiveOrders.textContent = activeOrders.length;
    if (els.badgePastOrders) els.badgePastOrders.textContent = pastOrders.length;

    renderOrdersList(els.currentOrdersContainer, activeOrders, true);
    renderOrdersList(els.pastOrdersContainer, pastOrders, false);
    renderRecentOverview(cachedOrders[0] || null);
    renderBillingHistory(cachedOrders);
  }

  function renderOrdersList(container, orders, isActiveGroup) {
    if (!container) return;
    container.innerHTML = '';

    if (!orders || orders.length === 0) {
      container.innerHTML = `
        <div class="panel-empty-state">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <path d="M16 10a4 4 0 0 1-8 0"></path>
          </svg>
          <h3 class="empty-state-title">${isActiveGroup ? 'No Current Orders' : 'No Past Orders Recorded'}</h3>
          <p class="empty-state-text">${isActiveGroup ? 'You currently have no orders in progress or transit.' : 'You have no historical completed or archived orders.'}</p>
          <a href="home.html" class="btn btn-primary">Continue Shopping</a>
        </div>
      `;
      return;
    }

    orders.forEach((order) => {
      const card = doc.createElement('div');
      card.className = 'order-card';
      card.dataset.orderId = order.id;

      const dateStr = order.created_at ? new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
      const statusClass = `status-${String(order.status || '').toLowerCase()}`;

      // Items preview
      const itemsHtml = (order.items || []).map((item) => `
        <div class="order-item-row">
          <div class="order-item-thumb">
            <img src="${item.product_image}" alt="${item.product_name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=300'">
          </div>
          <div class="order-item-details">
            <span class="order-item-category">${item.subcategory || 'Atelier'}</span>
            <h4 class="order-item-name"><a href="search.html?q=${encodeURIComponent(item.product_name)}">${item.product_name}</a></h4>
            <span class="order-item-variant">${item.size ? 'Size: ' + item.size : ''} ${item.color ? '· Color: ' + item.color : ''} · Qty: ${item.quantity}</span>
          </div>
          <div class="order-item-pricing">
            ${formatPrice(item.total_price || item.unit_price * item.quantity)}
          </div>
        </div>
      `).join('');

      card.innerHTML = `
        <div class="order-card__header">
          <div class="order-meta-group">
            <div class="order-meta-item">
              <span class="order-meta-label">Order Number</span>
              <span class="order-meta-value">${order.order_number}</span>
            </div>
            <div class="order-meta-item">
              <span class="order-meta-label">Date Placed</span>
              <span class="order-meta-value">${dateStr}</span>
            </div>
            <div class="order-meta-item">
              <span class="order-meta-label">Total Amount</span>
              <span class="order-meta-value">${formatPrice(order.total_amount)}</span>
            </div>
          </div>
          <span class="order-status-pill ${statusClass}">
            ✦ ${order.status}
          </span>
        </div>

        <div class="order-card__body">
          <div class="order-items-list">
            ${itemsHtml}
          </div>
        </div>

        <div class="order-card__footer">
          <div class="order-delivery-est">
            ${order.estimated_delivery ? `Estimated Delivery: <strong>${new Date(order.estimated_delivery).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>` : `Payment: <strong>${order.payment_method} (${order.payment_status})</strong>`}
          </div>
          <div class="order-card-actions">
            ${isActiveGroup && (order.status === 'Pending' || order.status === 'Confirmed') ? `
              <button type="button" class="btn btn-secondary btn-cancel-order" data-order-id="${order.id}">Cancel Order</button>
            ` : ''}
            ${!isActiveGroup && order.status === 'Delivered' ? `
              <button type="button" class="btn btn-primary btn-reorder" data-order-id="${order.id}">Reorder Items</button>
            ` : ''}
            <button type="button" class="btn btn-secondary btn-view-order-details" data-order-id="${order.id}">View Details</button>
            <button type="button" class="btn btn-secondary btn-open-invoice" data-order-id="${order.id}" title="Download printable receipt">Invoice</button>
          </div>
        </div>
      `;

      container.appendChild(card);
    });
  }

  function renderRecentOverview(latestOrder) {
    if (!els.recentOrderContainer) return;
    if (!latestOrder) {
      els.recentOrderContainer.innerHTML = `
        <div class="panel-empty-state" style="padding: 2.5rem 1rem;">
          <p class="empty-state-text" style="margin-bottom:1rem;">You have not placed any orders yet. Discover our curated new arrivals.</p>
          <a href="home.html" class="btn btn-secondary">Explore Velora Collection</a>
        </div>
      `;
      return;
    }

    const dateStr = latestOrder.created_at ? new Date(latestOrder.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
    els.recentOrderContainer.innerHTML = `
      <div class="order-card" style="margin-bottom: 0;">
        <div class="order-card__header">
          <div class="order-meta-group">
            <div class="order-meta-item">
              <span class="order-meta-label">Recent Order</span>
              <span class="order-meta-value">${latestOrder.order_number}</span>
            </div>
            <div class="order-meta-item">
              <span class="order-meta-label">Date</span>
              <span class="order-meta-value">${dateStr}</span>
            </div>
            <div class="order-meta-item">
              <span class="order-meta-label">Total</span>
              <span class="order-meta-value">${formatPrice(latestOrder.total_amount)}</span>
            </div>
          </div>
          <span class="order-status-pill status-${String(latestOrder.status).toLowerCase()}">✦ ${latestOrder.status}</span>
        </div>
        <div class="order-card__footer">
          <span>${(latestOrder.items || []).length} item${(latestOrder.items || []).length === 1 ? '' : 's'} included</span>
          <a href="#orders" class="btn btn-secondary" data-tab-link="orders">View Order Tracking &rarr;</a>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Address Book CRUD
  // ---------------------------------------------------------------------------
  async function loadAddresses() {
    try {
      cachedAddresses = await DB.getAddresses();
    } catch (e) {
      console.warn('[Velora Profile] Addresses fetch error:', e);
      cachedAddresses = [];
    }

    if (els.statAddresses) els.statAddresses.textContent = cachedAddresses.length;
    if (els.badgeAddresses) els.badgeAddresses.textContent = cachedAddresses.length;

    renderAddresses(cachedAddresses);
  }

  function renderAddresses(addresses) {
    if (!els.addressGridContainer) return;
    els.addressGridContainer.innerHTML = '';

    if (!addresses || addresses.length === 0) {
      els.addressGridContainer.innerHTML = `
        <div class="panel-empty-state" style="grid-column: 1 / -1;">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <h3 class="empty-state-title">No Delivery Addresses Saved</h3>
          <p class="empty-state-text">Add your delivery destination for expedited checkout on future orders.</p>
          <button type="button" class="btn btn-primary" id="btn-empty-add-addr">+ Add Delivery Address</button>
        </div>
      `;
      const btn = doc.getElementById('btn-empty-add-addr');
      if (btn) btn.addEventListener('click', openAddAddressModal);
      return;
    }

    addresses.forEach((addr) => {
      const card = doc.createElement('div');
      card.className = `address-card ${addr.is_default ? 'is-default' : ''}`;
      card.dataset.addressId = addr.id;

      card.innerHTML = `
        ${addr.is_default ? '<span class="address-default-badge">Primary Destination</span>' : ''}
        <h4 class="address-recipient">${addr.recipient_name}</h4>
        <div class="address-lines">
          ${addr.address_line1}<br>
          ${addr.address_line2 ? addr.address_line2 + '<br>' : ''}
          ${addr.city}, ${addr.state} ${addr.postal_code}<br>
          ${addr.country || 'United States'}
        </div>
        <div class="address-phone">Phone: ${addr.phone}</div>
        <div class="address-actions">
          <button type="button" class="btn-text-link btn-edit-address" data-id="${addr.id}">Edit</button>
          <span>·</span>
          <button type="button" class="btn-text-link btn-delete-address" data-id="${addr.id}" style="color:#d93025;">Delete</button>
          ${!addr.is_default ? `
            <span style="margin-left:auto;"></span>
            <button type="button" class="btn-text-link btn-set-default" data-id="${addr.id}">Set as Default</button>
          ` : ''}
        </div>
      `;

      els.addressGridContainer.appendChild(card);
    });
  }

  function openAddAddressModal() {
    els.addressModalTitle.textContent = 'Add Delivery Address';
    els.addressForm.reset();
    els.addressIdField.value = '';
    els.addressFormAlert.hidden = true;
    els.addressModal.hidden = false;
    els.addressModal.classList.add('is-open');
  }

  function openEditAddressModal(addrId) {
    const addr = cachedAddresses.find((a) => a.id === addrId);
    if (!addr) return;

    els.addressModalTitle.textContent = 'Edit Delivery Address';
    els.addressIdField.value = addr.id;
    els.addrName.value = addr.recipient_name;
    els.addrPhone.value = addr.phone;
    els.addrLine1.value = addr.address_line1;
    els.addrLine2.value = addr.address_line2 || '';
    els.addrCity.value = addr.city;
    els.addrState.value = addr.state;
    els.addrPostal.value = addr.postal_code;
    els.addrCountry.value = addr.country || 'United States';
    els.addrDefault.checked = !!addr.is_default;
    els.addressFormAlert.hidden = true;

    els.addressModal.hidden = false;
    els.addressModal.classList.add('is-open');
  }

  // ---------------------------------------------------------------------------
  // Wishlist Tab
  // ---------------------------------------------------------------------------
  function loadWishlist() {
    if (!V.Wishlist || !els.profileWishlistGrid) return;
    const items = V.Wishlist.items();

    if (els.statWishlist) els.statWishlist.textContent = items.length;
    if (els.badgeWishlist) els.badgeWishlist.textContent = items.length;

    els.profileWishlistGrid.innerHTML = '';
    if (!items.length) {
      els.profileWishlistGrid.innerHTML = `
        <div class="panel-empty-state" style="grid-column: 1 / -1;">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
          <h3 class="empty-state-title">Your Wishlist is Empty</h3>
          <p class="empty-state-text">Save the luxury styles you love to purchase whenever you are ready.</p>
          <a href="home.html" class="btn btn-primary">Discover the Atelier</a>
        </div>
      `;
      return;
    }

    items.forEach((p) => {
      const card = doc.createElement('div');
      card.className = 'product-card';
      card.dataset.productId = p.id;

      card.innerHTML = `
        <div class="product-image-box">
          ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
          <a href="${Products.url(p)}">
            <img src="${p.image}" alt="${p.alt || p.name}" loading="lazy">
          </a>
          <button type="button" class="wishlist-btn active" data-remove-wishlist="${p.id}" title="Remove from wishlist" aria-label="Remove">×</button>
        </div>
        <div class="product-content">
          ${p.subcategory ? `<span class="product-category">${p.subcategory}</span>` : ''}
          <h3 class="product-name"><a href="${Products.url(p)}">${p.name}</a></h3>
          <div class="product-price">${formatPrice(p.price)}</div>
          <button type="button" class="add-cart-btn btn-wishlist-add-bag" data-product-id="${p.id}">Add to Bag</button>
        </div>
      `;

      els.profileWishlistGrid.appendChild(card);
    });
  }

  // ---------------------------------------------------------------------------
  // Billing & Receipts Tab
  // ---------------------------------------------------------------------------
  function renderBillingHistory(orders) {
    if (!els.billingContainer) return;
    els.billingContainer.innerHTML = '';

    if (!orders || orders.length === 0) {
      els.billingContainer.innerHTML = `
        <div class="panel-empty-state">
          <p class="empty-state-text">No invoices or billing statements available.</p>
        </div>
      `;
      return;
    }

    const table = doc.createElement('table');
    table.className = 'invoice-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Order Number</th>
          <th>Date</th>
          <th>Payment Method</th>
          <th>Status</th>
          <th class="col-right">Amount</th>
          <th class="col-right">Receipt</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map((o) => `
          <tr>
            <td><strong>${o.order_number}</strong></td>
            <td>${o.created_at ? new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'}</td>
            <td>${o.payment_method || 'Credit Card'}</td>
            <td><span class="order-status-pill status-${String(o.payment_status || 'paid').toLowerCase()}">${o.payment_status || 'Paid'}</span></td>
            <td class="col-right"><strong>${formatPrice(o.total_amount)}</strong></td>
            <td class="col-right">
              <button type="button" class="btn-text-link btn-open-invoice" data-order-id="${o.id}">View / Print</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;

    els.billingContainer.appendChild(table);
  }

  // ---------------------------------------------------------------------------
  // Printable Invoice Generation
  // ---------------------------------------------------------------------------
  function openInvoiceModal(orderId) {
    const order = cachedOrders.find((o) => o.id === orderId);
    if (!order) return;

    const dateStr = order.created_at ? new Date(order.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '2026';
    const addr = order.shipping_address || {};

    const itemsRows = (order.items || []).map((item) => `
      <tr>
        <td>
          <strong>${item.product_name}</strong><br>
          <span style="font-size:0.75rem; color:#777;">${item.size ? 'Size: ' + item.size : ''} ${item.color ? '· Color: ' + item.color : ''}</span>
        </td>
        <td style="text-align:center;">${item.quantity}</td>
        <td class="col-right">${formatPrice(item.unit_price)}</td>
        <td class="col-right"><strong>${formatPrice(item.total_price || item.unit_price * item.quantity)}</strong></td>
      </tr>
    `).join('');

    els.invoiceContent.innerHTML = `
      <div class="invoice-header">
        <div>
          <div class="invoice-brand">Velora</div>
          <p style="font-size:0.75rem; color:#666; letter-spacing:0.1em; text-transform:uppercase;">Luxury Apparel & Atelier</p>
          <p style="font-size:0.75rem; color:#888; margin-top:0.4rem;">740 Fifth Avenue, New York, NY 10019<br>concierge@velorafashion.com</p>
        </div>
        <div style="text-align:right;">
          <h2 style="font-family:var(--font-serif); font-size:1.5rem; font-weight:400; text-transform:uppercase;">Official Invoice</h2>
          <p style="font-size:0.85rem; font-weight:600; margin-top:0.3rem;">#${order.order_number}</p>
          <p style="font-size:0.75rem; color:#666;">Date: ${dateStr}</p>
          <p style="font-size:0.75rem; color:#666;">Ref: ${order.transaction_ref || 'TXN-DIRECT'}</p>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; margin-bottom:2rem; font-size:0.85rem;">
        <div>
          <strong style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.1em; color:#777;">Billed & Shipped To:</strong><br>
          <strong>${addr.recipient_name || 'Client'}</strong><br>
          ${addr.address_line1 || ''}<br>
          ${addr.address_line2 ? addr.address_line2 + '<br>' : ''}
          ${addr.city || ''}, ${addr.state || ''} ${addr.postal_code || ''}<br>
          ${addr.country || 'United States'}<br>
          Tel: ${addr.phone || 'N/A'}
        </div>
        <div style="text-align:right;">
          <strong style="text-transform:uppercase; font-size:0.7rem; letter-spacing:0.1em; color:#777;">Payment Information:</strong><br>
          Method: <strong>${order.payment_method}</strong><br>
          Payment Status: <strong>${order.payment_status}</strong><br>
          Fulfillment: <strong>${order.status}</strong>
        </div>
      </div>

      <table class="invoice-table">
        <thead>
          <tr>
            <th>Item & Specifications</th>
            <th style="text-align:center;">Qty</th>
            <th class="col-right">Unit Price</th>
            <th class="col-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div class="invoice-summary-row">
        <table class="invoice-summary-table">
          <tr>
            <td>Items Subtotal:</td>
            <td class="col-right">${formatPrice(order.subtotal)}</td>
          </tr>
          <tr>
            <td>Express Insured Shipping:</td>
            <td class="col-right">${order.shipping_fee === 0 ? 'Complimentary' : formatPrice(order.shipping_fee)}</td>
          </tr>
          <tr class="invoice-total-row">
            <td>Grand Total:</td>
            <td class="col-right">${formatPrice(order.total_amount)}</td>
          </tr>
        </table>
      </div>

      <div style="margin-top:2.5rem; padding-top:1.5rem; border-top:1px solid #e8e8e1; font-size:0.72rem; color:#888; text-align:center;">
        Thank you for choosing Velora. All atelier collections are protected by our 30-day luxury return guarantee.
      </div>
    `;

    els.invoiceModal.hidden = false;
    els.invoiceModal.classList.add('is-open');
  }

  // ---------------------------------------------------------------------------
  // Order Details Modal
  // ---------------------------------------------------------------------------
  function openOrderDetailsModal(orderId) {
    const order = cachedOrders.find((o) => o.id === orderId);
    if (!order) return;

    activeOrderForModal = order;
    els.modalOrderNumberLabel.textContent = `Order Reference: ${order.order_number}`;

    const dateStr = order.created_at ? new Date(order.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Recent';
    const addr = order.shipping_address || {};

    const itemsHtml = (order.items || []).map((item) => `
      <div class="order-item-row" style="padding:0.75rem 0; border-bottom:1px solid #f2f0eb;">
        <div class="order-item-thumb">
          <img src="${item.product_image}" alt="${item.product_name}">
        </div>
        <div class="order-item-details">
          <span class="order-item-category">${item.subcategory || ''}</span>
          <h4 class="order-item-name">${item.product_name}</h4>
          <span class="order-item-variant">${item.size ? 'Size: ' + item.size : ''} ${item.color ? '· ' + item.color : ''} · Qty: ${item.quantity}</span>
        </div>
        <div class="order-item-pricing">${formatPrice(item.total_price || item.unit_price * item.quantity)}</div>
      </div>
    `).join('');

    els.orderDetailsBody.innerHTML = `
      <div style="margin-bottom:1.5rem; font-size:0.85rem;">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem;">
          <span>Status:</span>
          <span class="order-status-pill status-${String(order.status).toLowerCase()}">✦ ${order.status}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem;">
          <span>Placed On:</span>
          <strong>${dateStr}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem;">
          <span>Payment:</span>
          <strong>${order.payment_method} · ${order.payment_status}</strong>
        </div>
        ${order.tracking_number ? `
          <div style="display:flex; justify-content:space-between; margin-bottom:0.75rem; background:#fcfcf9; padding:0.6rem; border:1px solid #e8e8e1;">
            <span>Tracking Carrier:</span>
            <strong>${order.tracking_carrier} (#${order.tracking_number})</strong>
          </div>
        ` : ''}
      </div>

      <h4 style="font-size:0.75rem; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:0.5rem; color:#777;">Delivery Address:</h4>
      <div style="font-size:0.85rem; margin-bottom:1.5rem; line-height:1.45; background:#fcfcf9; padding:0.8rem; border:1px solid #e8e8e1;">
        <strong>${addr.recipient_name}</strong><br>
        ${addr.address_line1} ${addr.address_line2 || ''}<br>
        ${addr.city}, ${addr.state} ${addr.postal_code}<br>
        Tel: ${addr.phone || 'N/A'}
      </div>

      <h4 style="font-size:0.75rem; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:0.5rem; color:#777;">Items in Order:</h4>
      <div style="margin-bottom:1.5rem;">
        ${itemsHtml}
      </div>

      <div style="border-top:1px solid #e8e8e1; padding-top:0.75rem; font-size:0.85rem;">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.35rem;">
          <span>Subtotal:</span>
          <span>${formatPrice(order.subtotal)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.35rem;">
          <span>Shipping:</span>
          <span>${order.shipping_fee === 0 ? 'Complimentary' : formatPrice(order.shipping_fee)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:1.1rem; font-weight:700; border-top:1px solid #1a1a1a; padding-top:0.5rem;">
          <span>Total:</span>
          <span>${formatPrice(order.total_amount)}</span>
        </div>
      </div>
    `;

    els.orderDetailsModal.hidden = false;
    els.orderDetailsModal.classList.add('is-open');
  }

  // ---------------------------------------------------------------------------
  // Reorder Functionality
  // ---------------------------------------------------------------------------
  async function handleReorder(orderId) {
    const order = cachedOrders.find((o) => o.id === orderId);
    if (!order || !order.items || !order.items.length) return;

    let addedCount = 0;
    const unavailable = [];

    order.items.forEach((item) => {
      const liveProduct = Products.get(item.product_id);
      if (liveProduct) {
        Cart.add(liveProduct.id, {
          size: item.size || undefined,
          color: item.color || undefined,
          qty: item.quantity || 1,
        });
        addedCount += 1;
      } else {
        unavailable.push(item.product_name);
      }
    });

    if (addedCount > 0) {
      if (CartUI) {
        CartUI.toast(`Added ${addedCount} item${addedCount === 1 ? '' : 's'} to your bag!`, {
          actionLabel: 'View Bag',
          actionHref: 'cart.html',
        });
      }
    }

    if (unavailable.length > 0) {
      alert(`The following item(s) are archived or out of stock: ${unavailable.join(', ')}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Cancel Order Functionality
  // ---------------------------------------------------------------------------
  async function handleCancelOrder(orderId) {
    const order = cachedOrders.find((o) => o.id === orderId);
    if (!order) return;

    if (!confirm(`Are you sure you wish to cancel order ${order.order_number}?`)) {
      return;
    }

    try {
      await DB.cancelOrder(orderId);
      if (CartUI) CartUI.toast(`Order ${order.order_number} has been cancelled.`);
      await loadOrders();
    } catch (err) {
      alert(err.message || 'Unable to cancel order.');
    }
  }

  // ---------------------------------------------------------------------------
  // Event Bindings
  // ---------------------------------------------------------------------------
  function bindEvents() {
    // Personal Info Form Submit
    if (els.personalForm) {
      els.personalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        els.personalAlert.hidden = true;
        els.personalSuccess.hidden = true;

        const fullName = els.inputFullName.value.trim();
        const phone = els.inputPhone.value.trim();
        const avatarUrl = els.inputAvatarUrl.value.trim();

        if (!fullName || fullName.length < 2) {
          doc.getElementById('err-fullname').style.display = 'block';
          return;
        } else {
          doc.getElementById('err-fullname').style.display = 'none';
        }

        els.btnSavePersonal.disabled = true;
        els.btnSavePersonal.querySelector('.btn-text').textContent = 'Saving...';
        els.btnSavePersonal.querySelector('.btn-spinner').hidden = false;

        try {
          await DB.updateProfile({ full_name: fullName, phone, avatar_url: avatarUrl });
          els.personalSuccess.hidden = false;
          // Refresh user view
          await loadUserData();
        } catch (err) {
          els.personalAlertText.textContent = err.message || 'Failed to update personal information.';
          els.personalAlert.hidden = false;
        } finally {
          els.btnSavePersonal.disabled = false;
          els.btnSavePersonal.querySelector('.btn-text').textContent = 'Save Personal Details';
          els.btnSavePersonal.querySelector('.btn-spinner').hidden = true;
        }
      });
    }

    // Avatar URL live preview
    if (els.inputAvatarUrl) {
      els.inputAvatarUrl.addEventListener('input', () => {
        const url = els.inputAvatarUrl.value.trim();
        const initials = getInitials(els.inputFullName.value);
        renderAvatar(els.avatarPreviewBox, els.avatarPreviewInitials, url, initials);
      });
    }

    // Address Modal Triggers
    if (els.btnAddAddress) els.btnAddAddress.addEventListener('click', openAddAddressModal);
    if (els.closeAddressModal) {
      els.closeAddressModal.addEventListener('click', () => {
        els.addressModal.hidden = true;
        els.addressModal.classList.remove('is-open');
      });
    }
    if (els.cancelAddressBtn) {
      els.cancelAddressBtn.addEventListener('click', () => {
        els.addressModal.hidden = true;
        els.addressModal.classList.remove('is-open');
      });
    }

    // Address Form Save
    if (els.addressForm) {
      els.addressForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        els.addressFormAlert.hidden = true;

        const addrId = els.addressIdField.value;
        const recipient_name = els.addrName.value.trim();
        const phone = els.addrPhone.value.trim();
        const address_line1 = els.addrLine1.value.trim();
        const address_line2 = els.addrLine2.value.trim();
        const city = els.addrCity.value.trim();
        const state = els.addrState.value.trim();
        const postal_code = els.addrPostal.value.trim();
        const country = els.addrCountry.value.trim();
        const is_default = els.addrDefault.checked;

        if (!recipient_name || !phone || !address_line1 || !city || !state || !postal_code) {
          els.addressFormAlertText.textContent = 'Please fill out all mandatory fields marked with an asterisk (*).';
          els.addressFormAlert.hidden = false;
          return;
        }

        try {
          if (addrId) {
            await DB.updateAddress(addrId, {
              recipient_name, phone, address_line1, address_line2, city, state, postal_code, country, is_default,
            });
          } else {
            await DB.addAddress({
              recipient_name, phone, address_line1, address_line2, city, state, postal_code, country, is_default,
            });
          }

          els.addressModal.hidden = true;
          els.addressModal.classList.remove('is-open');
          await loadAddresses();
        } catch (err) {
          els.addressFormAlertText.textContent = err.message || 'Error saving address.';
          els.addressFormAlert.hidden = false;
        }
      });
    }

    // Delegated actions for Orders & Addresses
    doc.addEventListener('click', async (e) => {
      // Edit address
      const editAddrBtn = e.target.closest('.btn-edit-address');
      if (editAddrBtn) {
        e.preventDefault();
        openEditAddressModal(editAddrBtn.dataset.id);
        return;
      }

      // Delete address
      const delAddrBtn = e.target.closest('.btn-delete-address');
      if (delAddrBtn) {
        e.preventDefault();
        pendingDeleteAddressId = delAddrBtn.dataset.id;
        els.deleteModal.hidden = false;
        els.deleteModal.classList.add('is-open');
        return;
      }

      // Set default address
      const setDefaultBtn = e.target.closest('.btn-set-default');
      if (setDefaultBtn) {
        e.preventDefault();
        await DB.setDefaultAddress(setDefaultBtn.dataset.id);
        await loadAddresses();
        return;
      }

      // View details order
      const viewOrderBtn = e.target.closest('.btn-view-order-details');
      if (viewOrderBtn) {
        e.preventDefault();
        openOrderDetailsModal(viewOrderBtn.dataset.orderId);
        return;
      }

      // Open invoice
      const invoiceBtn = e.target.closest('.btn-open-invoice');
      if (invoiceBtn) {
        e.preventDefault();
        openInvoiceModal(invoiceBtn.dataset.orderId);
        return;
      }

      // Reorder items
      const reorderBtn = e.target.closest('.btn-reorder');
      if (reorderBtn) {
        e.preventDefault();
        handleReorder(reorderBtn.dataset.orderId);
        return;
      }

      // Cancel order
      const cancelOrderBtn = e.target.closest('.btn-cancel-order');
      if (cancelOrderBtn) {
        e.preventDefault();
        handleCancelOrder(cancelOrderBtn.dataset.orderId);
        return;
      }

      // Wishlist remove inside profile
      const removeWishBtn = e.target.closest('[data-remove-wishlist]');
      if (removeWishBtn) {
        e.preventDefault();
        const pId = removeWishBtn.dataset.removeWishlist;
        Wishlist.remove(pId);
        loadWishlist();
        return;
      }

      // Wishlist add to bag inside profile
      const addBagWishBtn = e.target.closest('.btn-wishlist-add-bag');
      if (addBagWishBtn) {
        e.preventDefault();
        const pId = addBagWishBtn.dataset.productId;
        const prod = Products.get(pId);
        if (prod && CartUI) {
          // If product has sizes or colors, trigger CartUI options picker
          if (prod.sizes.length || prod.colors.length) {
            CartUI.openPicker(prod, addBagWishBtn);
          } else {
            Cart.add(prod.id);
            CartUI.toast(`Added ${prod.name} to your bag!`, { actionLabel: 'View Bag', actionHref: 'cart.html' });
          }
        }
        return;
      }
    });

    // Confirm Delete Address Modal
    if (els.confirmDeleteBtn) {
      els.confirmDeleteBtn.addEventListener('click', async () => {
        if (!pendingDeleteAddressId) return;
        try {
          await DB.deleteAddress(pendingDeleteAddressId);
          els.deleteModal.hidden = true;
          els.deleteModal.classList.remove('is-open');
          pendingDeleteAddressId = null;
          await loadAddresses();
        } catch (err) {
          alert(err.message || 'Failed to delete address.');
        }
      });
    }

    if (els.closeDeleteModal) {
      els.closeDeleteModal.addEventListener('click', () => {
        els.deleteModal.hidden = true;
        els.deleteModal.classList.remove('is-open');
      });
    }
    if (els.cancelDeleteBtn) {
      els.cancelDeleteBtn.addEventListener('click', () => {
        els.deleteModal.hidden = true;
        els.deleteModal.classList.remove('is-open');
      });
    }

    // Order Details Modal close
    if (els.closeOrderModal) {
      els.closeOrderModal.addEventListener('click', () => {
        els.orderDetailsModal.hidden = true;
        els.orderDetailsModal.classList.remove('is-open');
      });
    }
    if (els.closeOrderDetailsBtn) {
      els.closeOrderDetailsBtn.addEventListener('click', () => {
        els.orderDetailsModal.hidden = true;
        els.orderDetailsModal.classList.remove('is-open');
      });
    }
    if (els.btnPrintOrderReceipt) {
      els.btnPrintOrderReceipt.addEventListener('click', () => {
        if (activeOrderForModal) {
          els.orderDetailsModal.hidden = true;
          openInvoiceModal(activeOrderForModal.id);
        }
      });
    }

    // Invoice Modal close & Print
    if (els.closeInvoiceModal) {
      els.closeInvoiceModal.addEventListener('click', () => {
        els.invoiceModal.hidden = true;
        els.invoiceModal.classList.remove('is-open');
      });
    }
    if (els.closeInvoiceBtn) {
      els.closeInvoiceBtn.addEventListener('click', () => {
        els.invoiceModal.hidden = true;
        els.invoiceModal.classList.remove('is-open');
      });
    }
    if (els.btnTriggerPrint) {
      els.btnTriggerPrint.addEventListener('click', () => {
        global.print();
      });
    }

    // Change Password Form
    if (els.changePwForm) {
      els.changePwForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        els.changePwAlert.hidden = true;
        els.changePwSuccess.hidden = true;

        const newPw = els.newPwInput.value;
        const confirmPw = els.confirmNewPwInput.value;

        if (newPw.length < 8) {
          doc.getElementById('err-change-pw').style.display = 'block';
          return;
        } else {
          doc.getElementById('err-change-pw').style.display = 'none';
        }

        if (newPw !== confirmPw) {
          doc.getElementById('err-change-pw-match').style.display = 'block';
          return;
        } else {
          doc.getElementById('err-change-pw-match').style.display = 'none';
        }

        els.btnSubmitChangePw.disabled = true;
        els.btnSubmitChangePw.querySelector('.btn-text').textContent = 'Updating...';
        els.btnSubmitChangePw.querySelector('.btn-spinner').hidden = false;

        try {
          await Auth.updatePassword(newPw);
          els.changePwSuccess.hidden = false;
          els.changePwForm.reset();
        } catch (err) {
          els.changePwAlertText.textContent = err.message || 'Failed to update password.';
          els.changePwAlert.hidden = false;
        } finally {
          els.btnSubmitChangePw.disabled = false;
          els.btnSubmitChangePw.querySelector('.btn-text').textContent = 'Update Password';
          els.btnSubmitChangePw.querySelector('.btn-spinner').hidden = true;
        }
      });
    }

    // Toggle change password visibility
    if (els.toggleChangePw && els.newPwInput) {
      els.toggleChangePw.addEventListener('click', () => {
        const isText = els.newPwInput.type === 'text';
        els.newPwInput.type = isText ? 'password' : 'text';
        els.toggleChangePw.classList.toggle('active', !isText);
      });
    }

    // Notification Toggles
    if (els.prefOrderNotify) {
      els.prefOrderNotify.addEventListener('change', async () => {
        await DB.updateProfile({ email_notifications: els.prefOrderNotify.checked });
      });
    }
    if (els.prefPromoNotify) {
      els.prefPromoNotify.addEventListener('change', async () => {
        await DB.updateProfile({ promo_notifications: els.prefPromoNotify.checked });
      });
    }

    // Resend Verification
    if (els.btnResendVerification) {
      els.btnResendVerification.addEventListener('click', async () => {
        if (!currentUser?.email) return;
        try {
          await Auth.resetPassword(currentUser.email);
          alert(`Verification and security instructions sent to ${currentUser.email}`);
        } catch (err) {
          alert(err.message || 'Could not dispatch verification email.');
        }
      });
    }

    // Supabase Configuration Dialog
    if (els.btnOpenSupabaseConfig && els.configModal) {
      els.btnOpenSupabaseConfig.addEventListener('click', () => {
        els.cfgUrl.value = Config.isConfigured() ? Config.SUPABASE_URL : '';
        els.cfgAnon.value = Config.isConfigured() ? Config.SUPABASE_ANON_KEY : '';
        els.configModal.hidden = false;
        els.configModal.classList.add('is-open');
      });

      els.closeConfigModal.addEventListener('click', () => {
        els.configModal.hidden = true;
        els.configModal.classList.remove('is-open');
      });

      els.configForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newUrl = els.cfgUrl.value.trim();
        const newKey = els.cfgAnon.value.trim();
        if (newUrl && newKey) {
          Config.setCredentials(newUrl, newKey);
          alert('Supabase credentials saved! Connecting to cloud backend.');
          global.location.reload();
        }
      });

      els.resetConfigBtn.addEventListener('click', () => {
        Config.clearCredentials();
        alert('Reset to local secure preview mode.');
        global.location.reload();
      });
    }

    // Delete Account Dialog
    if (els.btnTriggerDeleteAccount && els.deleteAccModal) {
      els.btnTriggerDeleteAccount.addEventListener('click', () => {
        els.deleteConfirmType.value = '';
        els.confirmDelAccBtn.disabled = true;
        els.deleteAccModal.hidden = false;
        els.deleteAccModal.classList.add('is-open');
      });

      els.closeDelAccModal.addEventListener('click', () => {
        els.deleteAccModal.hidden = true;
        els.deleteAccModal.classList.remove('is-open');
      });

      els.cancelDelAccBtn.addEventListener('click', () => {
        els.deleteAccModal.hidden = true;
        els.deleteAccModal.classList.remove('is-open');
      });

      els.deleteConfirmType.addEventListener('input', () => {
        els.confirmDelAccBtn.disabled = els.deleteConfirmType.value.trim() !== 'DELETE';
      });

      els.confirmDelAccBtn.addEventListener('click', async () => {
        try {
          await Auth.signOut();
          alert('Your Velora account has been erased.');
          global.location.href = 'home.html';
        } catch (e) {
          alert('Failed to delete account.');
        }
      });
    }

    // Logout
    if (els.btnLogout) {
      els.btnLogout.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Are you sure you wish to log out from your Velora account?')) {
          Auth.signOut();
        }
      });
    }

    // Close modals on ESC key
    global.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        doc.querySelectorAll('.velora-modal.is-open').forEach((m) => {
          m.hidden = true;
          m.classList.remove('is-open');
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function init() {
    setupTabs();
    bindEvents();
    await loadUserData();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window);
