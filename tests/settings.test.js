/**
 * settings.test.js
 * Unit tests for bc-settings.js — logic functions only (no DOM tests)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  resetSettings,
  validateSettings,
  buildBCApiUrl,
  buildBCEndpointUrl,
  getDataSourceMode,
} from '../js/bc-settings.js';

// ── localStorage mock ─────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store = {};
  return {
    getItem:    key      => store[key] ?? null,
    setItem:    (key, v) => { store[key] = String(v); },
    removeItem: key      => { delete store[key]; },
    clear:      ()       => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

beforeEach(() => localStorageMock.clear());

// ── loadSettings ──────────────────────────────────────────────────────────

describe('loadSettings', () => {
  it('returns defaults when nothing is stored', () => {
    const s = loadSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('returns merged settings when partial data is stored', () => {
    localStorageMock.setItem('bc-sankey-settings', JSON.stringify({ clientId: 'abc' }));
    const s = loadSettings();
    expect(s.clientId).toBe('abc');
    expect(s.dataSource).toBe(DEFAULT_SETTINGS.dataSource); // default preserved
  });

  it('returns defaults when stored JSON is corrupt', () => {
    localStorageMock.setItem('bc-sankey-settings', 'NOT JSON');
    const s = loadSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('returns a copy — mutating it does not change stored settings', () => {
    const s1 = loadSettings();
    s1.clientId = 'changed';
    const s2 = loadSettings();
    expect(s2.clientId).toBe('');
  });
});

// ── saveSettings ──────────────────────────────────────────────────────────

describe('saveSettings', () => {
  it('saves settings and can be loaded back', () => {
    const s = { ...DEFAULT_SETTINGS, clientId: 'test-client-id' };
    const result = saveSettings(s);
    expect(result.ok).toBe(true);
    expect(loadSettings().clientId).toBe('test-client-id');
  });

  it('returns ok: false for null input', () => {
    expect(saveSettings(null).ok).toBe(false);
  });

  it('returns ok: false for non-object input', () => {
    expect(saveSettings('string').ok).toBe(false);
  });

  it('merges with defaults — unknown keys from defaults are preserved', () => {
    saveSettings({ clientId: 'x' });
    const loaded = loadSettings();
    expect(loaded.dataSource).toBe(DEFAULT_SETTINGS.dataSource);
  });

  it('includes error message on failure', () => {
    const result = saveSettings(null);
    expect(result.error).toBeTruthy();
  });
});

// ── resetSettings ─────────────────────────────────────────────────────────

describe('resetSettings', () => {
  it('returns default settings after reset', () => {
    saveSettings({ ...DEFAULT_SETTINGS, clientId: 'something' });
    const result = resetSettings();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('clears localStorage so next load returns defaults', () => {
    saveSettings({ ...DEFAULT_SETTINGS, tenantId: 'abc' });
    resetSettings();
    expect(loadSettings().tenantId).toBe('');
  });
});

// ── validateSettings ──────────────────────────────────────────────────────

describe('validateSettings', () => {
  describe('local mode (no BC credentials required)', () => {
    it('accepts minimal local settings', () => {
      const result = validateSettings({ ...DEFAULT_SETTINGS, dataSource: 'local' });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });
  });

  describe('BC mode (credentials required)', () => {
    const validBC = {
      ...DEFAULT_SETTINGS,
      dataSource:  'bc',
      clientId:    '12345678-1234-1234-1234-123456789012',
      tenantId:    '12345678-1234-1234-1234-123456789012',
      companyId:   'CRONUS International Ltd.',
    };

    it('accepts fully valid BC settings', () => {
      expect(validateSettings(validBC).valid).toBe(true);
    });

    it('rejects BC mode without clientId', () => {
      const result = validateSettings({ ...validBC, clientId: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.clientId).toBeTruthy();
    });

    it('rejects BC mode without tenantId', () => {
      const result = validateSettings({ ...validBC, tenantId: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.tenantId).toBeTruthy();
    });

    it('rejects BC mode without companyId', () => {
      const result = validateSettings({ ...validBC, companyId: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.companyId).toBeTruthy();
    });

    it('rejects invalid clientId format', () => {
      const result = validateSettings({ ...validBC, clientId: 'not-a-guid' });
      expect(result.valid).toBe(false);
      expect(result.errors.clientId).toBeTruthy();
    });

    it('rejects invalid tenantId format', () => {
      const result = validateSettings({ ...validBC, tenantId: 'badtenantformat' });
      expect(result.valid).toBe(false);
      expect(result.errors.tenantId).toBeTruthy();
    });

    it('can have multiple errors simultaneously', () => {
      const result = validateSettings({ ...validBC, clientId: '', tenantId: '' });
      expect(Object.keys(result.errors).length).toBeGreaterThan(1);
    });
  });

  describe('animation settings', () => {
    it('accepts valid step delay', () => {
      expect(validateSettings({ ...DEFAULT_SETTINGS, animStepDelay: 1000 }).valid).toBe(true);
    });

    it('rejects step delay below 200', () => {
      const result = validateSettings({ ...DEFAULT_SETTINGS, animStepDelay: 100 });
      expect(result.valid).toBe(false);
      expect(result.errors.animStepDelay).toBeTruthy();
    });

    it('rejects step delay above 5000', () => {
      const result = validateSettings({ ...DEFAULT_SETTINGS, animStepDelay: 9999 });
      expect(result.valid).toBe(false);
    });

    it('rejects non-numeric step delay', () => {
      const result = validateSettings({ ...DEFAULT_SETTINGS, animStepDelay: 'fast' });
      expect(result.valid).toBe(false);
    });
  });
});

// ── buildBCApiUrl ─────────────────────────────────────────────────────────

describe('buildBCApiUrl', () => {
  const tid  = '12345678-1234-1234-1234-123456789012';
  const env  = 'production';
  const comp = 'CRONUS International Ltd.';

  it('builds correct base URL with all params', () => {
    const url = buildBCApiUrl(tid, env, comp);
    expect(url).toBe(
      `https://api.businesscentral.dynamics.com/v2.0/${tid}/${env}/api/v2.0/companies(${comp})/`
    );
  });

  it('URL starts with https BC base', () => {
    const url = buildBCApiUrl(tid, env, comp);
    expect(url).toMatch(/^https:\/\/api\.businesscentral\.dynamics\.com/);
  });

  it('URL contains v2.0 API version', () => {
    expect(buildBCApiUrl(tid, env, comp)).toContain('/api/v2.0/');
  });

  it('URL contains companies() endpoint', () => {
    expect(buildBCApiUrl(tid, env, comp)).toContain('companies(');
  });

  it('returns null when tenantId is empty', () => {
    expect(buildBCApiUrl('', env, comp)).toBeNull();
  });

  it('returns null when environment is empty', () => {
    expect(buildBCApiUrl(tid, '', comp)).toBeNull();
  });

  it('returns null when companyId is empty', () => {
    expect(buildBCApiUrl(tid, env, '')).toBeNull();
  });

  it('returns null for null inputs', () => {
    expect(buildBCApiUrl(null, env, comp)).toBeNull();
  });

  it('trims whitespace from all params', () => {
    const url = buildBCApiUrl('  ' + tid + '  ', '  ' + env + '  ', '  ' + comp + '  ');
    expect(url).not.toContain('  ');
  });

  it('ends with trailing slash', () => {
    expect(buildBCApiUrl(tid, env, comp)).toMatch(/\/$/);
  });
});

// ── buildBCEndpointUrl ────────────────────────────────────────────────────

describe('buildBCEndpointUrl', () => {
  const base = 'https://api.businesscentral.dynamics.com/v2.0/tid/production/api/v2.0/companies(c)/';

  it('appends endpoint to base URL', () => {
    const url = buildBCEndpointUrl(base, 'accounts');
    expect(url).toBe(base + 'accounts');
  });

  it('handles base without trailing slash', () => {
    const url = buildBCEndpointUrl(base.slice(0, -1), 'accounts');
    expect(url).toContain('/accounts');
  });

  it('returns null for null base', () => {
    expect(buildBCEndpointUrl(null, 'accounts')).toBeNull();
  });

  it('returns null for null endpoint', () => {
    expect(buildBCEndpointUrl(base, null)).toBeNull();
  });
});


// ── accountScheduleName ───────────────────────────────────────────────────

describe('accountScheduleName in settings', () => {
  it('default is empty string', () => {
    expect(DEFAULT_SETTINGS.accountScheduleName).toBe('');
  });

  it('is saved and loaded correctly', () => {
    saveSettings({ ...DEFAULT_SETTINGS, accountScheduleName: 'GuV' });
    expect(loadSettings().accountScheduleName).toBe('GuV');
  });

  it('is preserved after reset', () => {
    saveSettings({ ...DEFAULT_SETTINGS, accountScheduleName: 'Bilanz' });
    resetSettings();
    expect(loadSettings().accountScheduleName).toBe('');
  });

  it('is included in merged defaults when missing from stored data', () => {
    localStorageMock.setItem('bc-sankey-settings', JSON.stringify({ clientId: 'x' }));
    const s = loadSettings();
    expect(Object.prototype.hasOwnProperty.call(s, 'accountScheduleName')).toBe(true);
  });

  it('does not fail validation when empty (optional field)', () => {
    const result = validateSettings({ ...DEFAULT_SETTINGS, accountScheduleName: '' });
    expect(result.valid).toBe(true);
  });

  it('does not fail validation when set to a name', () => {
    const result = validateSettings({ ...DEFAULT_SETTINGS, accountScheduleName: 'GuV' });
    expect(result.valid).toBe(true);
  });

  it('works in BC mode with accountScheduleName set', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      dataSource:          'bc',
      clientId:            '12345678-1234-1234-1234-123456789012',
      tenantId:            '12345678-1234-1234-1234-123456789012',
      companyId:           'CRONUS International Ltd.',
      accountScheduleName: 'GuV',
    };
    expect(validateSettings(s).valid).toBe(true);
  });
});

// ── getDataSourceMode ─────────────────────────────────────────────────────

describe('getDataSourceMode', () => {
  const fullBCSettings = {
    dataSource: 'bc',
    clientId:   '12345678-1234-1234-1234-123456789012',
    tenantId:   '12345678-1234-1234-1234-123456789012',
    companyId:  'CRONUS International Ltd.',
  };

  it('returns "bc" when all BC settings are present and mode is bc', () => {
    expect(getDataSourceMode(fullBCSettings)).toBe('bc');
  });

  it('returns "local" when dataSource is local', () => {
    expect(getDataSourceMode({ ...fullBCSettings, dataSource: 'local' })).toBe('local');
  });

  it('returns "local" when clientId is missing', () => {
    expect(getDataSourceMode({ ...fullBCSettings, clientId: '' })).toBe('local');
  });

  it('returns "local" when tenantId is missing', () => {
    expect(getDataSourceMode({ ...fullBCSettings, tenantId: '' })).toBe('local');
  });

  it('returns "local" when companyId is missing', () => {
    expect(getDataSourceMode({ ...fullBCSettings, companyId: '' })).toBe('local');
  });

  it('returns "local" for null settings', () => {
    expect(getDataSourceMode(null)).toBe('local');
  });

  it('returns "local" for undefined settings', () => {
    expect(getDataSourceMode(undefined)).toBe('local');
  });
});
