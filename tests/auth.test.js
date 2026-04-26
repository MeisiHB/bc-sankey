/**
 * auth.test.js
 * Unit tests for bc-auth.js — pure logic functions only
 * (MSAL.js itself is not tested here; that requires integration tests)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildAuthorityUrl,
  validateTenantId,
  validateClientId,
  parseAccountInfo,
  isTokenExpired,
} from '../js/bc-auth.js';

// ── buildAuthorityUrl ─────────────────────────────────────────────────────

describe('buildAuthorityUrl', () => {
  it('builds URL from GUID tenant ID', () => {
    const tid = '12345678-1234-1234-1234-123456789012';
    expect(buildAuthorityUrl(tid)).toBe('https://login.microsoftonline.com/' + tid);
  });

  it('builds URL from domain tenant', () => {
    expect(buildAuthorityUrl('contoso.onmicrosoft.com'))
      .toBe('https://login.microsoftonline.com/contoso.onmicrosoft.com');
  });

  it('trims whitespace from tenant ID', () => {
    expect(buildAuthorityUrl('  contoso.onmicrosoft.com  '))
      .toBe('https://login.microsoftonline.com/contoso.onmicrosoft.com');
  });

  it('falls back to common authority for null', () => {
    expect(buildAuthorityUrl(null)).toBe('https://login.microsoftonline.com/common');
  });

  it('falls back to common authority for empty string', () => {
    expect(buildAuthorityUrl('')).toBe('https://login.microsoftonline.com/common');
  });

  it('falls back to common authority for undefined', () => {
    expect(buildAuthorityUrl(undefined)).toBe('https://login.microsoftonline.com/common');
  });

  it('always uses https', () => {
    expect(buildAuthorityUrl('contoso.onmicrosoft.com')).toMatch(/^https:\/\//);
  });
});

// ── validateTenantId ──────────────────────────────────────────────────────

describe('validateTenantId', () => {
  it('accepts a valid GUID', () => {
    const result = validateTenantId('12345678-1234-1234-1234-123456789012');
    expect(result.valid).toBe(true);
  });

  it('accepts a valid onmicrosoft.com domain', () => {
    expect(validateTenantId('contoso.onmicrosoft.com').valid).toBe(true);
  });

  it('accepts uppercase GUID', () => {
    expect(validateTenantId('12345678-1234-1234-1234-123456789ABC').valid).toBe(true);
  });

  it('accepts a subdomain domain', () => {
    expect(validateTenantId('my-company.onmicrosoft.com').valid).toBe(true);
  });

  it('rejects empty string', () => {
    const result = validateTenantId('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects null', () => {
    expect(validateTenantId(null).valid).toBe(false);
  });

  it('rejects undefined', () => {
    expect(validateTenantId(undefined).valid).toBe(false);
  });

  it('rejects plain text (not GUID or domain)', () => {
    expect(validateTenantId('not-valid').valid).toBe(false);
  });

  it('rejects GUID with wrong length', () => {
    expect(validateTenantId('12345678-1234-1234-1234-1234567890').valid).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(validateTenantId('   ').valid).toBe(false);
  });

  it('returns error message on failure', () => {
    const result = validateTenantId('bad');
    expect(result.error).toBeTruthy();
    expect(typeof result.error).toBe('string');
  });
});

// ── validateClientId ──────────────────────────────────────────────────────

describe('validateClientId', () => {
  it('accepts a valid GUID client ID', () => {
    expect(validateClientId('12345678-1234-1234-1234-123456789012').valid).toBe(true);
  });

  it('rejects empty string', () => {
    expect(validateClientId('').valid).toBe(false);
  });

  it('rejects null', () => {
    expect(validateClientId(null).valid).toBe(false);
  });

  it('rejects domain (only GUIDs allowed)', () => {
    expect(validateClientId('contoso.onmicrosoft.com').valid).toBe(false);
  });

  it('rejects short random string', () => {
    expect(validateClientId('abc-def').valid).toBe(false);
  });

  it('returns error message on failure', () => {
    const result = validateClientId('notvalid');
    expect(result.error).toBeTruthy();
  });

  it('trims whitespace before validating', () => {
    expect(validateClientId('  12345678-1234-1234-1234-123456789012  ').valid).toBe(true);
  });
});

// ── parseAccountInfo ──────────────────────────────────────────────────────

describe('parseAccountInfo', () => {
  const mockAccount = {
    name:         'Max Mustermann',
    username:     'max@contoso.com',
    tenantId:     '12345678-1234-1234-1234-123456789012',
    homeAccountId: 'abc123.12345678-1234-1234-1234-123456789012',
    idTokenClaims: { oid: 'abc123', tid: '12345678' },
  };

  it('parses name correctly', () => {
    expect(parseAccountInfo(mockAccount).name).toBe('Max Mustermann');
  });

  it('parses email (username) correctly', () => {
    expect(parseAccountInfo(mockAccount).email).toBe('max@contoso.com');
  });

  it('parses tenant ID correctly', () => {
    expect(parseAccountInfo(mockAccount).tenantId).toBe('12345678-1234-1234-1234-123456789012');
  });

  it('parses accountId correctly', () => {
    expect(parseAccountInfo(mockAccount).accountId).toBe('abc123.12345678-1234-1234-1234-123456789012');
  });

  it('includes idTokenClaims', () => {
    expect(parseAccountInfo(mockAccount).idToken).toEqual({ oid: 'abc123', tid: '12345678' });
  });

  it('returns null for null input', () => {
    expect(parseAccountInfo(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseAccountInfo(undefined)).toBeNull();
  });

  it('falls back gracefully when name is missing', () => {
    const account = { ...mockAccount, name: undefined };
    const result = parseAccountInfo(account);
    expect(result.name).toBeTruthy(); // falls back to username or 'Unbekannt'
  });

  it('handles account without idTokenClaims', () => {
    const account = { ...mockAccount, idTokenClaims: undefined };
    const result = parseAccountInfo(account);
    expect(result.idToken).toEqual({});
  });
});

// ── isTokenExpired ────────────────────────────────────────────────────────

describe('isTokenExpired', () => {
  it('returns true for a past timestamp', () => {
    const past = Date.now() / 1000 - 3600; // 1 hour ago
    expect(isTokenExpired(past)).toBe(true);
  });

  it('returns false for a future timestamp', () => {
    const future = Date.now() / 1000 + 3600; // 1 hour from now
    expect(isTokenExpired(future)).toBe(false);
  });

  it('returns true for null', () => {
    expect(isTokenExpired(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isTokenExpired(undefined)).toBe(true);
  });

  it('returns true for timestamp exactly at now', () => {
    const now = Math.floor(Date.now() / 1000);
    // At exactly now the token is considered expired
    expect(isTokenExpired(now - 1)).toBe(true);
  });

  it('returns false for token expiring in 1 second', () => {
    const soon = Date.now() / 1000 + 1;
    expect(isTokenExpired(soon)).toBe(false);
  });

  it('handles string timestamps', () => {
    const future = String(Date.now() / 1000 + 3600);
    expect(isTokenExpired(future)).toBe(false);
  });
});
