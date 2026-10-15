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
    const userAccountLink = findIconLink('user account') || doc.querySelector('.header-actions a[aria-label="User Account"]');

    if (V.Profile) {
      const loggedIn = V.Profile.isLoggedIn();

      if (authBtn) {
        if (!authBtn.dataset.defaultLabel) authBtn.dataset.defaultLabel = authBtn.textContent.trim();
        if (loggedIn) {
          const p = V.Profile.get();
          const first = (p.name || p.email).split(/[\s@]/)[0] || 'Member';
          authBtn.textContent = `Hi, ${first}`;
          authBtn.classList.add('is-logged-in');
          authBtn.href = 'profile.html';
        } else {
          authBtn.textContent = authBtn.dataset.defaultLabel;
          authBtn.classList.remove('is-logged-in');
          authBtn.href = 'login.html';
        }
      }

      if (userAccountLink) {
        userAccountLink.href = loggedIn ? 'profile.html' : 'login.html';
        userAccountLink.setAttribute('aria-label', loggedIn ? 'My Profile' : 'User Account');
      }
    }
  }

  function wireAuthModal() {
    const modal = doc.getElementById('login-modal');
    if (!modal) return;

    // Login Form inside modal
    const loginForm = modal.querySelector('.content-login form');
    if (loginForm && !loginForm.dataset.veloraBound) {
      loginForm.dataset.veloraBound = '1';
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = loginForm.querySelector('#login-email') || loginForm.querySelector('input[type="email"]');
        const passwordInput = loginForm.querySelector('#login-password') || loginForm.querySelector('input[type="password"]');
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        if (!email || !password) {
          alert('Please enter both email and password.');
          return;
        }

        const origText = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Authenticating...';
        }

        try {
          if (V.Auth) {
            await V.Auth.signIn({ email, password });
            global.location.hash = ''; // close modal
            render();
            if (V.CartUI) V.CartUI.toast('Signed in successfully!', { actionLabel: 'View Account', actionHref: 'profile.html' });
          }
        } catch (err) {
          alert(err.message || 'Login failed. Please check credentials.');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
          }
        }
      });
    }

    // Sign Up Form inside modal
    const signupForm = modal.querySelector('.content-signup form');
    if (signupForm && !signupForm.dataset.veloraBound) {
      signupForm.dataset.veloraBound = '1';
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = signupForm.querySelector('#signup-name') || signupForm.querySelector('input[type="text"]');
        const emailInput = signupForm.querySelector('#signup-email') || signupForm.querySelector('input[type="email"]');
        const passwordInput = signupForm.querySelector('#signup-password') || signupForm.querySelector('input[type="password"]');
        const submitBtn = signupForm.querySelector('button[type="submit"]');

        const fullName = nameInput ? nameInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        if (!fullName || !email || !password) {
          alert('Please fill in all registration fields.');
          return;
        }

        const origText = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Creating Account...';
        }

        try {
          if (V.Auth) {
            const res = await V.Auth.signUp({ fullName, email, password });
            global.location.hash = ''; // close modal
            render();
            if (res.needsEmailConfirmation) {
              alert('Account created! Please check your email to confirm registration.');
            } else {
              if (V.CartUI) V.CartUI.toast('Welcome to Velora! Your account has been created.', { actionLabel: 'View Account', actionHref: 'profile.html' });
            }
          }
        } catch (err) {
          alert(err.message || 'Sign up failed.');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
          }
        }
      });
    }
  }

  let bound = false;

  function init() {
    render();
    wireAuthModal();
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
