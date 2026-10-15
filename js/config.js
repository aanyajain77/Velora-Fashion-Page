/*
 * Velora Configuration Module.
 *
 * Provides runtime credentials for external services (Supabase Auth and Database).
 * In production or local development, replace the placeholder values below with your
 * real Supabase project URL and anon public key from your Supabase Dashboard:
 * Settings -> API.
 *
 * Keys may also be injected at deployment via window.__VELORA_ENV__ or customized
 * in-browser for quick evaluation.
 */
(function (global) {
  'use strict';

  const env = global.__VELORA_ENV__ || {};

  // Default placeholders:
  const DEFAULT_URL = 'https://placeholder-project.supabase.co';
  const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder-anon-key';

  // Read from env, localStorage override, or default:
  let url = env.SUPABASE_URL || global.localStorage?.getItem('velora_config_supabase_url') || DEFAULT_URL;
  let anonKey = env.SUPABASE_ANON_KEY || global.localStorage?.getItem('velora_config_supabase_anon_key') || DEFAULT_KEY;

  const Config = {
    get SUPABASE_URL() {
      return url;
    },
    get SUPABASE_ANON_KEY() {
      return anonKey;
    },
    /** Returns true if valid custom Supabase credentials have been configured. */
    isConfigured() {
      return (
        typeof url === 'string' &&
        url.startsWith('https://') &&
        !url.includes('placeholder-project') &&
        typeof anonKey === 'string' &&
        !anonKey.includes('placeholder-anon-key') &&
        anonKey.length > 20
      );
    },
    /**
     * Programmatically update credentials (e.g. for testing or sandbox setup).
     */
    setCredentials(newUrl, newKey) {
      if (newUrl) {
        url = newUrl.trim();
        try { global.localStorage?.setItem('velora_config_supabase_url', url); } catch (e) {}
      }
      if (newKey) {
        anonKey = newKey.trim();
        try { global.localStorage?.setItem('velora_config_supabase_anon_key', anonKey); } catch (e) {}
      }
      if (global.Velora && global.Velora.Supabase && typeof global.Velora.Supabase.reinit === 'function') {
        global.Velora.Supabase.reinit();
      }
    },
    clearCredentials() {
      try {
        global.localStorage?.removeItem('velora_config_supabase_url');
        global.localStorage?.removeItem('velora_config_supabase_anon_key');
      } catch (e) {}
      url = DEFAULT_URL;
      anonKey = DEFAULT_KEY;
    },
  };

  global.Velora = global.Velora || {};
  global.Velora.Config = Config;
})(window);
