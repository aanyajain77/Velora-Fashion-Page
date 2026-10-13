/*
 * Velora wishlist UI (every page).
 *
 *  - Heart buttons on catalog cards (accessories, footwear, sale) toggle the
 *    product in the wishlist.
 *  - Cards on home/men/women have no heart in their markup, so one is added
 *    to each card's image box using the same .wishlist-btn class.
 *  - Saved/unsaved state is reflected by app.js (syncCardState) through the
 *    "active" class and aria-pressed; this module only handles the clicks.
 */
(function (global) {
  'use strict';

  const V = global.Velora;
  const doc = global.document;
  if (!V || !V.Wishlist || !V.util) return;
  if (V.WishlistUI) return;

  const { Wishlist, util, CartUI } = V;
  const WISHLIST_URL = 'wishlist.html';
  const HEART_PATH = 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function heartIcon() {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', HEART_PATH);
    svg.appendChild(path);
    return svg;
  }

  /** Give every product card a heart button if its markup lacks one. */
  function ensureHearts() {
    util.productCards().forEach((card) => {
      if (card.querySelector('.wishlist-btn')) return;
      const host = card.querySelector('.product-image-box') || card;
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'wishlist-btn wishlist-btn--injected';
      btn.setAttribute('aria-label', 'Add to Wishlist');
      btn.appendChild(heartIcon());
      host.appendChild(btn);
    });
  }

  function toggle(product) {
    if (!product) {
      if (CartUI) CartUI.toast('Sorry, this product is no longer available.', { tone: 'error' });
      return false;
    }
    const saved = Wishlist.toggle(product.id);
    if (CartUI) {
      if (saved) CartUI.toast(`Saved to wishlist: ${product.name}`, { actionLabel: 'View Wishlist', actionHref: WISHLIST_URL });
      else CartUI.toast(`Removed from wishlist: ${product.name}`, { actionLabel: 'Undo', onAction: () => Wishlist.add(product.id) });
    }
    return saved;
  }

  util.on('click', '.product-card .wishlist-btn', (event, btn) => {
    event.preventDefault();
    toggle(util.productFromElement(btn));
  });

  function init() {
    ensureHearts();
    util.syncCardState();
  }

  if (V.__booted) init();
  else doc.addEventListener('velora:ready', init, { once: true });

  V.WishlistUI = Object.freeze({ toggle, ensureHearts, WISHLIST_URL });
})(window);
