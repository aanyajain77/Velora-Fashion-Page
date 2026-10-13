/*
 * Velora shared header behaviour.
 *
 * Every page has the same header markup: a wishlist icon link, a cart icon
 * link with a `.cart-badge`, and a "Login / Sign Up" button. This module
 * keeps those in sync with the stores:
 *
 *   - cart badge shows the number of units in the cart
 *   - a wishlist badge (created here, the markup has none) shows saved items
 *   - the auth button greets a logged-in user by first name
 *
 * It listens to "velora:change" so any store update (this tab or another)
 * refreshes the header. Safe to call Header.init() more than once.
 */
(function (global) {
  'use strict';

  const V = global.Velora || {};
  const doc = global.document;

  function findIconLink(label) {
    // aria-labels vary slightly between pages ("Search" vs "Search Catalog"),
    // so match on the start of the label, case-insensitively.
    const links = doc.querySelectorAll('.header-actions .icon-btn[aria-label]');
    const wanted = label.toLowerCase();
    for (const el of links) {
      if (el.getAttribute('aria-label').toLowerCase().startsWith(wanted)) return el;
    }
    return null;
  }

  function ensureBadge(link, className) {
    if (!link) return null;
    let badge = link.querySelector(`.${className}`);
    if (!badge) {
      badge = doc.createElement('span');
      badge.className = `cart-badge ${className}`;
      link.appendChild(badge);
    }
    return badge;
  }

  function setBadge(badge, count) {
    if (!badge) return;
    const n = Math.max(0, Number(count) || 0);
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.dataset.count = String(n);
    badge.classList.toggle('is-empty', n === 0);
  }

  function render() {
    const cartLink = findIconLink('shopping cart');
    const wishLink = findIconLink('wishlist');

    if (cartLink && V.Cart) {
      const badge = ensureBadge(cartLink, 'cart-badge');
      const n = V.Cart.count();
      setBadge(badge, n);
      cartLink.setAttribute('aria-label', `Shopping Cart, ${n} item${n === 1 ? '' : 's'}`);
    }

    if (wishLink && V.Wishlist) {
      const badge = ensureBadge(wishLink, 'wishlist-badge');
      const n = V.Wishlist.count();
      setBadge(badge, n);
      wishLink.setAttribute('aria-label', `Wishlist, ${n} item${n === 1 ? '' : 's'}`);
    }

    const authBtn = doc.querySelector('.header-actions .btn-auth');
    if (authBtn && V.Profile) {
      if (!authBtn.dataset.defaultLabel) authBtn.dataset.defaultLabel = authBtn.textContent.trim();
      if (V.Profile.isLoggedIn()) {
        const p = V.Profile.get();
        const first = (p.name || p.email).split(/[\s@]/)[0];
        authBtn.textContent = `Hi, ${first}`;
        authBtn.classList.add('is-logged-in');
      } else {
        authBtn.textContent = authBtn.dataset.defaultLabel;
        authBtn.classList.remove('is-logged-in');
      }
    }
  }

  let bound = false;

  function init() {
    render();
    if (bound) return;
    bound = true;
    doc.addEventListener('velora:change', (event) => {
      const store = event.detail && event.detail.store;
      if (!store || ['cart', 'wishlist', 'profile'].includes(store)) render();
    });
  }

  global.Velora = V;
  V.Header = Object.freeze({ init, render });
})(window);
