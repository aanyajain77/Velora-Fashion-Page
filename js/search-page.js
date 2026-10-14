/*
 * Velora search page (search.html only).
 *
 *  - The header search icon on every page links here. The search box is
 *    focused on load and results render as the user types.
 *  - Matching uses Velora.Products.search (name, category, subcategory,
 *    gender, colours, badge, description, sizes; partial, case-insensitive).
 *  - Results are standard Velora product cards (the same markup the home
 *    page and wishlist page use), so the shared "Add to Bag" and wishlist
 *    heart handlers in cart-ui.js / wishlist-ui.js work unchanged.
 *  - The query lives in the URL (search.html?q=dress): it is read on load,
 *    updated as the user types, and submitted with Enter, so results survive
 *    a refresh and the link can be shared.
 *  - Empty box: category links and popular products. No matches: an empty
 *    state with Clear Search and Continue Shopping.
 *
 * All DOM is built with createElement/textContent; no HTML strings are
 * assembled from user input or product data.
 */
(function (global) {
  'use strict';

  const V = global.Velora;
  const doc = global.document;
  if (!V || !V.Products || !V.util) return;

  const { Products, Cart, Wishlist, WishlistUI, formatPrice, util } = V;
  const QUERY_PARAM = 'q';
  const MAX_QUERY = 80;
  const DEBOUNCE_MS = 80;
  const FEATURED_LIMIT = 8;
  const FEATURED_BADGES = ['best seller', 'bestseller', 'popular', 'trending', 'must have'];

  const refs = {};
  let timer = 0;
  let lastRendered = null;

  // ---------------------------------------------------------------- helpers

  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function cleanQuery(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
  }

  function queryFromUrl() {
    try { return cleanQuery(new URL(global.location.href).searchParams.get(QUERY_PARAM)); } catch (e) { return ''; }
  }

  /** Keep ?q= in sync with the box without adding history entries. */
  function writeUrl(query) {
    if (!global.history || typeof global.history.replaceState !== 'function') return;
    const url = new URL(global.location.href);
    if (query) url.searchParams.set(QUERY_PARAM, query);
    else url.searchParams.delete(QUERY_PARAM);
    global.history.replaceState(global.history.state, '', url.toString());
  }

  function isOnSale(product) {
    return product.compareAtPrice != null && product.compareAtPrice > product.price;
  }

  function stars(count) {
    return '★★★★★'.slice(0, Math.max(0, Math.min(5, count)));
  }

  // ------------------------------------------------------------------ cards

  /** Standard Velora product card (same classes as home.html / wishlist.html). */
  function buildCard(product) {
    const card = el('div', 'product-card search-card');
    card.dataset.productId = product.id;

    const box = el('div', 'product-image-box');
    const badge = product.badge || (isOnSale(product) ? `-${Products.discountPercent(product)}%` : '');
    if (badge) box.appendChild(el('span', 'product-badge', badge));
    const link = el('a', 'search-card__link');
    link.href = Products.url(product);
    link.setAttribute('aria-label', product.name);
    const img = el('img');
    img.src = product.image;
    img.alt = product.alt || product.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    link.appendChild(img);
    box.appendChild(link);
    // The wishlist heart is injected by wishlist-ui.js (ensureHearts).

    const content = el('div', 'product-content');
    content.appendChild(el('span', 'product-category', product.subcategory || product.category));
    const name = el('h3', 'product-name');
    const nameLink = el('a', null, product.name);
    nameLink.href = Products.url(product);
    nameLink.title = product.name;
    name.appendChild(nameLink);
    content.appendChild(name);

    const price = el('div', 'product-price', formatPrice(product.price));
    if (isOnSale(product)) {
      price.appendChild(el('span', 'search-card__compare', formatPrice(product.compareAtPrice)));
    }
    content.appendChild(price);

    const rating = el('div', 'rating-row');
    rating.appendChild(el('span', 'stars', stars(5)));
    rating.appendChild(el('span', null, `(${product.reviews || 0})`));
    content.appendChild(rating);

    const add = el('button', 'add-cart-btn', Cart && Cart.has(product.id) ? 'Add Another to Bag' : 'Add to Bag');
    add.type = 'button';
    content.appendChild(add);

    card.append(box, content);
    return card;
  }

  function fillGrid(grid, products) {
    grid.textContent = '';
    products.forEach((p) => grid.appendChild(buildCard(p)));
    // Hearts + saved/in-bag state for the freshly built cards.
    if (WishlistUI) WishlistUI.ensureHearts();
    util.markLoadedImages();
    util.syncCardState();
  }

  /** "Add Another to Bag" labels follow the cart without a full re-render. */
  function syncAddLabels() {
    if (!Cart) return;
    doc.querySelectorAll('.search-card[data-product-id] .add-cart-btn').forEach((btn) => {
      const id = btn.closest('[data-product-id]').dataset.productId;
      btn.textContent = Cart.has(id) ? 'Add Another to Bag' : 'Add to Bag';
    });
  }

  // ----------------------------------------------------------------- states

  function featuredProducts() {
    const all = Products.all();
    const popular = all.filter((p) => p.badge && FEATURED_BADGES.includes(p.badge.toLowerCase()));
    const list = popular.length >= 4 ? popular : popular.concat(all.filter((p) => !popular.includes(p)));
    return list.slice(0, FEATURED_LIMIT);
  }

  function showStart() {
    refs.start.hidden = false;
    refs.empty.hidden = true;
    refs.grid.hidden = true;
    refs.grid.textContent = '';
    refs.count.textContent = '';
    refs.clear.hidden = true;
    doc.title = 'Search | Velora';
    if (!refs.featured.childElementCount) fillGrid(refs.featured, featuredProducts());
  }

  function showEmpty(query) {
    refs.start.hidden = true;
    refs.grid.hidden = true;
    refs.grid.textContent = '';
    refs.empty.hidden = false;
    refs.emptyText.textContent = `We couldn't find anything matching “${query}”. Try a different word, a category like “dress” or “sneakers”, or a colour.`;
    refs.count.textContent = `0 results for “${query}”`;
    doc.title = `No results for “${query}” | Velora`;
  }

  function showResults(query, matches) {
    refs.start.hidden = true;
    refs.empty.hidden = true;
    refs.grid.hidden = false;
    fillGrid(refs.grid, matches);
    refs.count.textContent = `${matches.length} ${matches.length === 1 ? 'result' : 'results'} for “${query}”`;
    doc.title = `“${query}” | Search | Velora`;
  }

  /** Render whatever matches the current box contents. */
  function render() {
    const query = cleanQuery(refs.input.value);
    refs.clear.hidden = !refs.input.value;
    writeUrl(query);
    if (query === lastRendered) return;
    lastRendered = query;
    if (!query) return showStart();
    const matches = Products.search(query);
    if (matches.length === 0) return showEmpty(query);
    return showResults(query, matches);
  }

  function scheduleRender() {
    global.clearTimeout(timer);
    timer = global.setTimeout(render, DEBOUNCE_MS);
  }

  function clearSearch() {
    global.clearTimeout(timer);
    refs.input.value = '';
    render();
    refs.input.focus();
  }

  // ------------------------------------------------------------------- init

  function bind() {
    refs.form.addEventListener('submit', (event) => {
      // Enter: render immediately (the form's GET fallback is only for no-JS).
      event.preventDefault();
      global.clearTimeout(timer);
      refs.input.value = cleanQuery(refs.input.value);
      render();
      if (!refs.input.value) refs.input.focus();
    });
    refs.input.addEventListener('input', scheduleRender);
    refs.input.addEventListener('search', scheduleRender); // native clear control, where shown
    refs.clear.addEventListener('click', clearSearch);
    refs.emptyClear.addEventListener('click', clearSearch);
    doc.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && doc.activeElement === refs.input && refs.input.value) clearSearch();
    });
    doc.addEventListener('velora:change', (event) => {
      const store = event.detail && event.detail.store;
      if (!store || store === 'cart') syncAddLabels();
    });
    // Back/forward with a different ?q= in the same document.
    global.addEventListener('popstate', () => {
      refs.input.value = queryFromUrl();
      render();
    });
  }

  function init() {
    refs.form = doc.getElementById('search-form');
    refs.input = doc.getElementById('search-input');
    refs.clear = doc.getElementById('search-clear');
    refs.count = doc.getElementById('search-count-label');
    refs.start = doc.getElementById('search-start');
    refs.featured = doc.getElementById('search-featured');
    refs.empty = doc.getElementById('search-empty');
    refs.emptyText = doc.getElementById('search-empty-text');
    refs.emptyClear = doc.getElementById('search-empty-clear');
    refs.grid = doc.getElementById('search-grid');
    if (!refs.form || !refs.input || !refs.grid) return;

    bind();
    refs.input.value = queryFromUrl();
    render();
    refs.input.focus({ preventScroll: true });
    if (refs.input.value) refs.input.setSelectionRange(refs.input.value.length, refs.input.value.length);
  }

  V.SearchPage = Object.freeze({ render, clear: clearSearch });

  if (V.__booted) init();
  else doc.addEventListener('velora:ready', init, { once: true });
})(window);
