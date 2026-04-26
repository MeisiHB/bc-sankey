/**
 * bc-auth.js
 * Microsoft Authentication for bc-sankey via MSAL.js 3.x
 *
 * Requires:
 *   - @azure/msal-browser loaded via CDN (window.msal)
 *   - A registered Azure App (clientId) configured in Settings
 *
 * Architecture:
 *   - Popup-based login (no page redirect — keeps diagram state)
 *   - Silent token refresh via MSAL cache
 *   - Auth state stored in memory + MSAL sessionStorage cache
 *   - Login is OPTIONAL — local JSON mode always works without auth
 */

'use strict';

// ── Constants ──────────────────────────────────────────────────────────────

export const BC_SCOPES = [
  'https://api.businesscentral.dynamics.com/user_impersonation',
];

export const GRAPH_SCOPES = [
  'User.Read',
];

const AUTHORITY_BASE = 'https://login.microsoftonline.com/';

// ── Auth state ─────────────────────────────────────────────────────────────

let _msalInstance = null;
let _account       = null;
let _onAuthChange  = null; // callback(account | null)

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize MSAL with the given clientId and tenantId.
 * Must be called before any other auth function.
 * Re-initializes safely when settings change.
 */
export function initAuth(clientId, tenantId) {
  if (!clientId || !tenantId) return;
  if (!window.msal) {
    console.warn('bc-auth: MSAL.js not loaded');
    return;
  }

  const config = {
    auth: {
      clientId,
      authority: buildAuthorityUrl(tenantId),
      redirectUri: window.location.origin + window.location.pathname,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
    system: {
      loggerOptions: {
        logLevel: window.msal.LogLevel.Warning,
        loggerCallback: (level, msg) => {
          if (level === window.msal.LogLevel.Error) console.error('[MSAL]', msg);
        },
      },
    },
  };

  _msalInstance = new window.msal.PublicClientApplication(config);
  _msalInstance.initialize().then(() => {
    // Restore account from cache on page reload
    const accounts = _msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      _account = accounts[0];
      _notifyAuthChange();
    }
  }).catch(err => console.error('bc-auth init error:', err));
}

/**
 * Sign in via popup. Returns account info or null on failure.
 */
export async function signIn() {
  if (!_msalInstance) throw new Error('Auth not initialized. Set Client-ID and Tenant-ID in Settings first.');

  const request = {
    scopes: GRAPH_SCOPES,
    prompt: 'select_account',
  };

  try {
    const result = await _msalInstance.loginPopup(request);
    _account = result.account;
    _notifyAuthChange();
    return parseAccountInfo(_account);
  } catch (err) {
    if (err.errorCode === 'user_cancelled') return null;
    throw err;
  }
}

/**
 * Sign out via popup.
 */
export async function signOut() {
  if (!_msalInstance || !_account) return;
  try {
    await _msalInstance.logoutPopup({ account: _account });
  } finally {
    _account = null;
    _notifyAuthChange();
  }
}

/**
 * Acquire an access token for Business Central silently.
 * Falls back to interactive popup if silent fails.
 * Returns the access token string or null.
 */
export async function acquireBCToken(tenantId) {
  if (!_msalInstance || !_account) return null;

  const request = {
    scopes:    BC_SCOPES,
    account:   _account,
    authority: buildAuthorityUrl(tenantId),
  };

  try {
    const result = await _msalInstance.acquireTokenSilent(request);
    return result.accessToken;
  } catch (silentErr) {
    if (silentErr instanceof window.msal.InteractionRequiredAuthError) {
      try {
        const result = await _msalInstance.acquireTokenPopup(request);
        return result.accessToken;
      } catch (popupErr) {
        console.error('bc-auth: token acquisition failed', popupErr);
        return null;
      }
    }
    throw silentErr;
  }
}

/**
 * Returns true if a user is currently signed in.
 */
export function isSignedIn() {
  return _account !== null;
}

/**
 * Returns parsed account info object or null.
 */
export function getAccount() {
  if (!_account) return null;
  return parseAccountInfo(_account);
}

/**
 * Register a callback for auth state changes.
 * Called with account info object or null.
 */
export function onAuthChange(callback) {
  _onAuthChange = callback;
}

// ── Utility functions (exported for testing) ────────────────────────────────

/**
 * Build Microsoft authority URL from tenant ID.
 */
export function buildAuthorityUrl(tenantId) {
  if (!tenantId || typeof tenantId !== 'string') return AUTHORITY_BASE + 'common';
  return AUTHORITY_BASE + tenantId.trim();
}

/**
 * Validate a tenant ID (GUID or domain).
 * Returns { valid: boolean, error?: string }
 */
export function validateTenantId(tenantId) {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    return { valid: false, error: 'Tenant-ID darf nicht leer sein' };
  }
  const trimmed = tenantId.trim();
  // Accept GUID format
  const guidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Accept domain format (e.g. contoso.onmicrosoft.com)
  const domainRx = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
  if (!guidRx.test(trimmed) && !domainRx.test(trimmed)) {
    return { valid: false, error: 'Tenant-ID muss eine GUID oder Domain sein (z.B. contoso.onmicrosoft.com)' };
  }
  return { valid: true };
}

/**
 * Validate an Azure client ID (must be a GUID).
 */
export function validateClientId(clientId) {
  if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
    return { valid: false, error: 'Client-ID darf nicht leer sein' };
  }
  const guidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guidRx.test(clientId.trim())) {
    return { valid: false, error: 'Client-ID muss eine GUID sein' };
  }
  return { valid: true };
}

/**
 * Parse MSAL account object into a clean info structure.
 */
export function parseAccountInfo(account) {
  if (!account) return null;
  return {
    name:      account.name     || account.username || 'Unbekannt',
    email:     account.username || '',
    tenantId:  account.tenantId || '',
    accountId: account.homeAccountId || '',
    idToken:   account.idTokenClaims || {},
  };
}

/**
 * Check if a token expiry timestamp (seconds) is in the past.
 */
export function isTokenExpired(expiresOn) {
  if (!expiresOn && expiresOn !== 0) return true;
  return Date.now() / 1000 > Number(expiresOn);
}

// ── Private helpers ────────────────────────────────────────────────────────

function _notifyAuthChange() {
  if (typeof _onAuthChange === 'function') {
    _onAuthChange(_account ? parseAccountInfo(_account) : null);
  }
}
