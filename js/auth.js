/*
 * Velora Authentication & User Session Manager.
 *
 * Coordinates authentication state, profile synchronization, session persistence,
 * and database sync (wishlist and cart) between Supabase Auth and Velora stores.
 */
(function (global) {
  'use strict';

  const V = global.Velora = global.Velora || {};
  const doc = global.document;

  function getClient() {
    return V.Supabase?.client;
  }

  // ---------------------------------------------------------------------------
  // Validation Helpers
  // ---------------------------------------------------------------------------
  const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  function validateEmail(email) {
    if (!email || typeof email !== 'string') return 'Email address is required.';
    const clean = email.trim();
    if (!EMAIL_REGEX.test(clean)) return 'Please enter a valid email address.';
    return null;
  }

  function evaluatePasswordStrength(password) {
    const pw = String(password || '');
    let score = 0;
    const tips = [];

    if (pw.length >= 8) score += 1;
    else tips.push('At least 8 characters');

    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
    else tips.push('Mix of uppercase & lowercase');

    if (/\d/.test(pw)) score += 1;
    else tips.push('At least one number');

    if (/[^A-Za-z0-9]/.test(pw)) score += 1;
    else tips.push('At least one special symbol');

    let label = 'Weak';
    let color = '#d93025';
    let percent = 25;

    if (score === 2) {
      label = 'Fair';
      color = '#e37400';
      percent = 50;
    } else if (score === 3) {
      label = 'Good';
      color = '#1b73e8';
      percent = 75;
    } else if (score === 4) {
      label = 'Strong';
      color = '#188038';
      percent = 100;
    }

    if (!pw.length) percent = 0;

    return { score, label, color, percent, tips };
  }

  // ---------------------------------------------------------------------------
  // Sync Stores with Authenticated User
  // ---------------------------------------------------------------------------
  async function syncUserState(user) {
    if (!user) {
      if (V.Profile) V.Profile.logout();
      return;
    }

    const client = getClient();
    let profileData = null;

    if (client) {
      try {
        const { data } = await client
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        profileData = data;
      } catch (e) {
        console.warn('[Velora] Could not fetch profile from database:', e);
      }
    }

    const fullName = profileData?.full_name || user.user_metadata?.full_name || '';
    const phone = profileData?.phone || user.user_metadata?.phone || '';
    const avatarUrl = profileData?.avatar_url || user.user_metadata?.avatar_url || '';

    if (V.Profile) {
      V.Profile.login({
        name: fullName,
        email: user.email,
        phone: phone,
        avatarUrl: avatarUrl,
        id: user.id,
      });
    }

    // Sync Wishlist from Database
    if (client && V.Wishlist) {
      try {
        const { data: dbWishlist } = await client
          .from('wishlist_items')
          .select('product_id')
          .eq('user_id', user.id);

        if (Array.isArray(dbWishlist)) {
          // Merge local wishlist into DB and vice-versa
          const localIds = V.Wishlist.ids();
          for (const localId of localIds) {
            if (!dbWishlist.some((w) => w.product_id === localId)) {
              await client.from('wishlist_items').insert({
                user_id: user.id,
                product_id: localId,
              });
            }
          }
          // Add all DB wishlist to local store
          dbWishlist.forEach((w) => {
            if (!V.Wishlist.has(w.product_id)) {
              V.Wishlist.add(w.product_id);
            }
          });
        }
      } catch (err) {
        console.warn('[Velora] Wishlist sync error:', err);
      }
    }

    if (V.Header && typeof V.Header.render === 'function') {
      V.Header.render();
    }
  }

  // ---------------------------------------------------------------------------
  // Authentication Actions
  // ---------------------------------------------------------------------------
  const Auth = {
    async getSession() {
      const client = getClient();
      if (!client) return null;
      const { data } = await client.auth.getSession();
      return data?.session || null;
    },

    async getUser() {
      const client = getClient();
      if (!client) return null;
      const { data } = await client.auth.getUser();
      return data?.user || null;
    },

    async isLoggedIn() {
      const user = await this.getUser();
      return !!user;
    },

    /**
     * Sign Up a new user.
     */
    async signUp({ fullName, email, phone, password }) {
      const nameClean = String(fullName || '').trim();
      const emailClean = String(email || '').trim().toLowerCase();
      const phoneClean = String(phone || '').trim();
      const pw = String(password || '');

      if (!nameClean || nameClean.length < 2) {
        throw new Error('Please provide your full name (minimum 2 characters).');
      }

      const emailErr = validateEmail(emailClean);
      if (emailErr) throw new Error(emailErr);

      if (pw.length < 8) {
        throw new Error('Password must be at least 8 characters long.');
      }

      const strength = evaluatePasswordStrength(pw);
      if (strength.score < 2) {
        throw new Error('Please choose a stronger password containing uppercase, numbers, or symbols.');
      }

      const client = getClient();
      if (!client) throw new Error('Authentication client unavailable.');

      const { data, error } = await client.auth.signUp({
        email: emailClean,
        password: pw,
        options: {
          data: {
            full_name: nameClean,
            phone: phoneClean,
          },
        },
      });

      if (error) {
        throw new Error(error.message || 'Unable to register account. Please try again.');
      }

      if (data?.user) {
        await syncUserState(data.user);
      }

      const needsEmailConfirmation = data?.user && !data?.session && !data?.user?.email_confirmed_at;
      return {
        user: data?.user,
        session: data?.session,
        needsEmailConfirmation,
      };
    },

    /**
     * Log In existing user.
     */
    async signIn({ email, password }) {
      const emailClean = String(email || '').trim().toLowerCase();
      const pw = String(password || '');

      if (!emailClean) throw new Error('Please enter your email address.');
      if (!pw) throw new Error('Please enter your password.');

      const client = getClient();
      if (!client) throw new Error('Authentication client unavailable.');

      const { data, error } = await client.auth.signInWithPassword({
        email: emailClean,
        password: pw,
      });

      if (error) {
        throw new Error(error.message || 'Invalid email or password.');
      }

      if (data?.user) {
        await syncUserState(data.user);
      }

      return {
        user: data?.user,
        session: data?.session,
      };
    },

    /**
     * Log Out.
     */
    async signOut() {
      const client = getClient();
      if (client) {
        try {
          await client.auth.signOut();
        } catch (e) {
          console.warn('[Velora] Error during sign out:', e);
        }
      }

      if (V.Profile) {
        V.Profile.logout();
      }

      if (V.Header && typeof V.Header.render === 'function') {
        V.Header.render();
      }

      // If on protected page, redirect to home
      const path = global.location.pathname.toLowerCase();
      if (path.includes('profile.html')) {
        global.location.href = 'home.html';
      }
    },

    /**
     * Request Password Reset Email.
     */
    async resetPassword(email) {
      const emailClean = String(email || '').trim().toLowerCase();
      const err = validateEmail(emailClean);
      if (err) throw new Error(err);

      const client = getClient();
      if (!client) throw new Error('Authentication client unavailable.');

      const redirectUrl = global.location.origin + '/reset-password.html';
      const { error } = await client.auth.resetPasswordForEmail(emailClean, {
        redirectTo: redirectUrl,
      });

      if (error) {
        throw new Error(error.message || 'Failed to send password reset link.');
      }
      return true;
    },

    /**
     * Update Password (from settings or recovery page).
     */
    async updatePassword(newPassword) {
      const pw = String(newPassword || '');
      if (pw.length < 8) {
        throw new Error('New password must be at least 8 characters long.');
      }
      const client = getClient();
      if (!client) throw new Error('Authentication client unavailable.');

      const { data, error } = await client.auth.updateUser({
        password: pw,
      });

      if (error) {
        throw new Error(error.message || 'Failed to update password.');
      }
      return data?.user;
    },

    /**
     * Guard protected pages.
     */
    async requireAuth(returnUrl) {
      const session = await this.getSession();
      if (!session || !session.user) {
        const dest = returnUrl || (global.location.pathname + global.location.search);
        global.location.href = `login.html?redirect=${encodeURIComponent(dest)}`;
        return false;
      }
      return true;
    },

    /**
     * Redirect authenticated users away from guest-only auth pages.
     */
    async redirectIfAuth(defaultUrl = 'profile.html') {
      const session = await this.getSession();
      if (session && session.user) {
        const params = new URLSearchParams(global.location.search);
        const redirect = params.get('redirect') || defaultUrl;
        global.location.href = redirect;
        return true;
      }
      return false;
    },

    evaluatePasswordStrength,
    validateEmail,
  };

  // Listen to Supabase Auth state changes
  function initAuthWatcher() {
    const client = getClient();
    if (!client) return;

    client.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await syncUserState(session.user);
      } else {
        if (V.Profile) V.Profile.logout();
        if (V.Header) V.Header.render();
      }
    });

    // Check initial session
    client.auth.getSession().then(({ data }) => {
      if (data?.session?.user) {
        syncUserState(data.session.user);
      }
    });
  }

  V.Auth = Auth;

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', initAuthWatcher, { once: true });
  } else {
    initAuthWatcher();
  }
})(window);
