/*
 * Velora page bootstrap.
 *
 * Loaded last (deferred) on every page. Runs exactly once per page load,
 * wires the shared header, tags image load state, and exposes a few
 * utilities that feature modules (cart, wishlist, quick view, auth) build on.
 *
 * Nothing in here depends on which page it is on: elements that do not
 * exist are simply skipped.
 */
(function (global) {
  'use strict';

  const V = global.Velora || {};
  const doc = global.document;

  // Guard against the bundle being included twice on a page.
  if (V.__booted) return;
  V.__booted = true;

  /** Current page file name, e.g. "men.html" ("home.html" for "/"). */
  function currentPage() {
    const file = (global.location.pathname.split('/').pop() || '').toLowerCase();
    return file.endsWith('.html') ? file : 'home.html';
  }

  /** Product bound to a card/modal, read from its data-product-id. */
  function productFromElement(el) {
    const host = el && el.closest ? el.closest('[data-product-id]') : null;
    return host ? V.Products.get(host.dataset.productId) : null;
  }

  /** Product cards on this page that carry a known product id. */
  function productCards(root = doc) {
    return Array.from(root.querySelectorAll('.product-card[data-product-id]'))
      .filter((card) => V.Products.has(card.dataset.productId));
  }

  /**
   * Delegated event binding that cannot double up: the same (event, selector)
   * pair is registered once per page no matter how often it is requested.
   */
  const delegated = new Set();
  function on(eventName, selector, handler) {
    const id = `${eventName}::${selector}`;
    if (delegated.has(id)) return;
    delegated.add(id);
    doc.addEventListener(eventName, (event) => {
      const target = event.target && event.target.closest ? event.target.closest(selector) : null;
      if (target && doc.contains(target)) handler(event, target);
    });
  }

  /** Mark images as loaded (used by CSS fade-ins); replaces the inline script that only accessories.html had. */
  function markLoadedImages() {
    doc.querySelectorAll('img').forEach((img) => {
      if (img.dataset.veloraWatched) return;
      img.dataset.veloraWatched = '1';
      const done = () => img.classList.add('loaded');
      if (img.complete) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    });
  }

  /** Reflect cart/wishlist membership onto cards and wishlist buttons. */
  function syncCardState() {
    productCards().forEach((card) => {
      const id = card.dataset.productId;
      const wished = V.Wishlist.has(id);
      card.classList.toggle('in-wishlist', wished);
      card.classList.toggle('in-cart', V.Cart.has(id));
      const btn = card.querySelector('.wishlist-btn');
      if (btn) {
        btn.classList.toggle('active', wished);
        btn.setAttribute('aria-pressed', wished ? 'true' : 'false');
        btn.setAttribute('aria-label', wished ? 'Remove from Wishlist' : 'Add to Wishlist');
      }
    });
  }

  function boot() {
    V.page = currentPage();
    V.Header.init();
    markLoadedImages();
    syncCardState();
    doc.addEventListener('velora:change', (event) => {
      const store = event.detail && event.detail.store;
      if (!store || store === 'cart' || store === 'wishlist') syncCardState();
    });
    doc.dispatchEvent(new global.CustomEvent('velora:ready', { detail: { page: V.page } }));
  }

  V.util = Object.freeze({ currentPage, productFromElement, productCards, on, markLoadedImages, syncCardState });
  global.Velora = V;

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(window);
