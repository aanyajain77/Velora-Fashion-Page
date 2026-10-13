/*
 * Velora state stores: cart, wishlist, profile and preferences.
 *
 * Each store keeps a validated copy of its data in memory, persists every
 * change through Velora.Storage, and emits "velora:change" on `document`
 * so UI code (header badges, page widgets) can re-render without any store
 * knowing about the DOM.
 *
 * Cart lines are keyed by product + size + color so the same product in two
 * sizes is two lines. Prices are always read from the catalog at render time,
 * never trusted from storage.
 */
(function (global) {
  'use strict';

  const { Storage, Products } = global.Velora || {};
  if (!Storage || !Products) {
    throw new Error('Velora.Store requires storage.js and products.js to load first');
  }

  const KEYS = Object.freeze({
    cart: 'cart',
    wishlist: 'wishlist',
    profile: 'profile',
    prefs: 'prefs',
  });

  const MAX_QTY = 10;

  // ---------- helpers ----------

  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isStr = (v) => typeof v === 'string';
  const cleanStr = (v, max = 120) => (isStr(v) ? v.trim().slice(0, max) : '');

  function clampQty(n) {
    const q = Math.floor(Number(n));
    if (!Number.isFinite(q) || q < 1) return 1;
    return Math.min(q, MAX_QTY);
  }

  function emit(store, detail) {
    if (typeof global.CustomEvent !== 'function' || !global.document) return;
    global.document.dispatchEvent(new global.CustomEvent('velora:change', {
      detail: Object.assign({ store }, detail || {}),
    }));
  }

  /** Normalise a size/color choice against the product's real options. */
  function pickOption(list, value) {
    if (!Array.isArray(list) || list.length === 0) return '';
    if (value === undefined || value === null || value === '') return '';
    const v = String(value);
    return list.includes(v) ? v : '';
  }

  function colorNames(product) {
    return (product.colors || []).map((c) => c.name);
  }

  const lineKey = (productId, size, color) => `${productId}|${size || ''}|${color || ''}`;

  // ---------- CART ----------

  function validCartLine(line) {
    return isObj(line)
      && isStr(line.productId) && Products.has(line.productId)
      && (line.size === undefined || isStr(line.size))
      && (line.color === undefined || isStr(line.color))
      && Number.isFinite(Number(line.qty));
  }

  function loadCart() {
    const raw = Storage.get(KEYS.cart, [], Array.isArray);
    // Drop lines we cannot make sense of; sanitise the rest.
    const seen = new Map();
    raw.forEach((line) => {
      if (!validCartLine(line)) return;
      const product = Products.get(line.productId);
      const size = pickOption(product.sizes, line.size);
      const color = pickOption(colorNames(product), line.color);
      const key = lineKey(product.id, size, color);
      const existing = seen.get(key);
      const qty = clampQty(line.qty);
      if (existing) {
        existing.qty = clampQty(existing.qty + qty);
      } else {
        seen.set(key, {
          key,
          productId: product.id,
          size,
          color,
          qty,
          addedAt: Number.isFinite(Number(line.addedAt)) ? Number(line.addedAt) : Date.now(),
        });
      }
    });
    return Array.from(seen.values());
  }

  let cartLines = loadCart();

  function saveCart(detail) {
    Storage.set(KEYS.cart, cartLines);
    emit('cart', detail);
  }

  const Cart = {
    /** Lines joined with their catalog product and computed totals. */
    items() {
      return cartLines.map((line) => {
        const product = Products.get(line.productId);
        return Object.assign({}, line, {
          product,
          unitPrice: product.price,
          lineTotal: Math.round(product.price * line.qty * 100) / 100,
        });
      });
    },
    /** Total number of units (what the header badge shows). */
    count() {
      return cartLines.reduce((n, l) => n + l.qty, 0);
    },
    isEmpty() {
      return cartLines.length === 0;
    },
    subtotal() {
      return Math.round(this.items().reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
    },
    /** Does the cart contain this product in any size/colour? */
    has(productId) {
      return cartLines.some((l) => l.productId === productId);
    },
    getLine(key) {
      return cartLines.find((l) => l.key === key) || null;
    },
    /**
     * Add a product. `options` = { size, color, qty }. Unknown ids are
     * ignored and return null. Returns the resulting line.
     */
    add(productId, options = {}) {
      const product = Products.get(productId);
      if (!product) return null;
      const size = pickOption(product.sizes, options.size);
      const color = pickOption(colorNames(product), options.color);
      const key = lineKey(product.id, size, color);
      const qty = clampQty(options.qty === undefined ? 1 : options.qty);
      let line = cartLines.find((l) => l.key === key);
      if (line) {
        line.qty = clampQty(line.qty + qty);
      } else {
        line = { key, productId: product.id, size, color, qty, addedAt: Date.now() };
        cartLines.push(line);
      }
      saveCart({ action: 'add', productId: product.id, key });
      return line;
    },
    setQty(key, qty) {
      const line = cartLines.find((l) => l.key === key);
      if (!line) return false;
      const q = Math.floor(Number(qty));
      if (!Number.isFinite(q) || q < 1) return this.remove(key);
      line.qty = clampQty(q);
      saveCart({ action: 'qty', productId: line.productId, key });
      return true;
    },
    remove(key) {
      const before = cartLines.length;
      cartLines = cartLines.filter((l) => l.key !== key);
      if (cartLines.length === before) return false;
      saveCart({ action: 'remove', key });
      return true;
    },
    clear() {
      cartLines = [];
      saveCart({ action: 'clear' });
    },
    /** Re-read from storage (used after another tab changed it). */
    reload() {
      cartLines = loadCart();
      emit('cart', { action: 'reload' });
    },
  };

  // ---------- WISHLIST ----------

  function loadWishlist() {
    const raw = Storage.get(KEYS.wishlist, [], Array.isArray);
    const ids = [];
    raw.forEach((id) => {
      if (isStr(id) && Products.has(id) && !ids.includes(id)) ids.push(id);
    });
    return ids;
  }

  let wishlistIds = loadWishlist();

  function saveWishlist(detail) {
    Storage.set(KEYS.wishlist, wishlistIds);
    emit('wishlist', detail);
  }

  const Wishlist = {
    ids() {
      return wishlistIds.slice();
    },
    items() {
      return wishlistIds.map((id) => Products.get(id)).filter(Boolean);
    },
    count() {
      return wishlistIds.length;
    },
    has(productId) {
      return wishlistIds.includes(productId);
    },
    add(productId) {
      if (!Products.has(productId) || wishlistIds.includes(productId)) return false;
      wishlistIds.push(productId);
      saveWishlist({ action: 'add', productId });
      return true;
    },
    remove(productId) {
      if (!wishlistIds.includes(productId)) return false;
      wishlistIds = wishlistIds.filter((id) => id !== productId);
      saveWishlist({ action: 'remove', productId });
      return true;
    },
    /** Returns true when the product is now in the wishlist. */
    toggle(productId) {
      if (wishlistIds.includes(productId)) {
        this.remove(productId);
        return false;
      }
      return this.add(productId);
    },
    clear() {
      wishlistIds = [];
      saveWishlist({ action: 'clear' });
    },
    reload() {
      wishlistIds = loadWishlist();
      emit('wishlist', { action: 'reload' });
    },
  };

  // ---------- PROFILE ----------
  // Only non-sensitive details are stored. Passwords are never persisted.

  const EMPTY_PROFILE = Object.freeze({
    name: '',
    email: '',
    phone: '',
    address: { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' },
    loggedIn: false,
    createdAt: null,
  });

  function sanitiseProfile(input) {
    const src = isObj(input) ? input : {};
    const addr = isObj(src.address) ? src.address : {};
    return {
      name: cleanStr(src.name, 80),
      email: cleanStr(src.email, 120).toLowerCase(),
      phone: cleanStr(src.phone, 40),
      address: {
        line1: cleanStr(addr.line1), line2: cleanStr(addr.line2), city: cleanStr(addr.city, 60),
        state: cleanStr(addr.state, 60), postalCode: cleanStr(addr.postalCode, 20), country: cleanStr(addr.country, 60),
      },
      loggedIn: src.loggedIn === true,
      createdAt: Number.isFinite(Number(src.createdAt)) ? Number(src.createdAt) : null,
    };
  }

  let profile = sanitiseProfile(Storage.get(KEYS.profile, EMPTY_PROFILE, isObj));

  function saveProfile(detail) {
    Storage.set(KEYS.profile, profile);
    emit('profile', detail);
  }

  const Profile = {
    get() {
      return JSON.parse(JSON.stringify(profile));
    },
    isLoggedIn() {
      return profile.loggedIn === true && profile.email !== '';
    },
    /** Shallow-merge fields (address merges too). Password fields are dropped. */
    update(fields) {
      const next = Object.assign({}, profile, isObj(fields) ? fields : {});
      if (isObj(fields) && isObj(fields.address)) {
        next.address = Object.assign({}, profile.address, fields.address);
      }
      delete next.password;
      profile = sanitiseProfile(next);
      saveProfile({ action: 'update' });
      return this.get();
    },
    login({ name, email } = {}) {
      return this.update({
        name: name || profile.name,
        email: email || profile.email,
        loggedIn: true,
        createdAt: profile.createdAt || Date.now(),
      });
    },
    logout() {
      return this.update({ loggedIn: false });
    },
    clear() {
      profile = sanitiseProfile(EMPTY_PROFILE);
      saveProfile({ action: 'clear' });
    },
    reload() {
      profile = sanitiseProfile(Storage.get(KEYS.profile, EMPTY_PROFILE, isObj));
      emit('profile', { action: 'reload' });
    },
  };

  // ---------- PREFERENCES ----------
  // Small UI preferences worth remembering between visits.

  const DEFAULT_PREFS = Object.freeze({
    gender: 'women',          // last gender tab on accessories/footwear
    sort: 'featured',         // last sort option
    newsletterEmail: '',
    recentlyViewed: [],       // product ids, most recent first (max 12)
    dismissedPromos: [],      // promo ids the user closed
  });

  const RECENT_MAX = 12;

  function sanitisePrefs(input) {
    const src = isObj(input) ? input : {};
    const list = (v) => (Array.isArray(v) ? v.filter(isStr) : []);
    return {
      gender: ['women', 'men'].includes(src.gender) ? src.gender : DEFAULT_PREFS.gender,
      sort: cleanStr(src.sort, 30) || DEFAULT_PREFS.sort,
      newsletterEmail: cleanStr(src.newsletterEmail, 120).toLowerCase(),
      recentlyViewed: list(src.recentlyViewed).filter((id) => Products.has(id)).slice(0, RECENT_MAX),
      dismissedPromos: list(src.dismissedPromos).slice(0, 50),
    };
  }

  let prefs = sanitisePrefs(Storage.get(KEYS.prefs, DEFAULT_PREFS, isObj));

  function savePrefs(detail) {
    Storage.set(KEYS.prefs, prefs);
    emit('prefs', detail);
  }

  const Prefs = {
    get(key) {
      const copy = JSON.parse(JSON.stringify(prefs));
      return key === undefined ? copy : copy[key];
    },
    set(key, value) {
      if (!isStr(key) || !(key in DEFAULT_PREFS)) return false;
      prefs = sanitisePrefs(Object.assign({}, prefs, { [key]: value }));
      savePrefs({ action: 'set', key });
      return true;
    },
    addRecentlyViewed(productId) {
      if (!Products.has(productId)) return;
      const next = [productId].concat(prefs.recentlyViewed.filter((id) => id !== productId));
      this.set('recentlyViewed', next.slice(0, RECENT_MAX));
    },
    reset() {
      prefs = sanitisePrefs(DEFAULT_PREFS);
      savePrefs({ action: 'reset' });
    },
    reload() {
      prefs = sanitisePrefs(Storage.get(KEYS.prefs, DEFAULT_PREFS, isObj));
      emit('prefs', { action: 'reload' });
    },
  };

  // ---------- cross-tab sync ----------
  // When another tab writes a key, reload that store so this tab stays in step.
  const reloaders = { cart: Cart.reload, wishlist: Wishlist.reload, profile: Profile.reload, prefs: Prefs.reload };
  Storage.onChange((key) => {
    const fn = reloaders[key];
    if (fn) fn();
  });

  /** Money formatter shared by every page. */
  function formatPrice(amount) {
    const n = Number(amount) || 0;
    const whole = Number.isInteger(n);
    return `$${whole ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  global.Velora.Cart = Cart;
  global.Velora.Wishlist = Wishlist;
  global.Velora.Profile = Profile;
  global.Velora.Prefs = Prefs;
  global.Velora.formatPrice = formatPrice;
  global.Velora.STORAGE_KEYS = KEYS;
})(window);
