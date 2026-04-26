/**
 * bc-settings.js
 * Settings management for bc-sankey
 *
 * Responsibilities:
 *   - Load/save settings (localStorage for non-sensitive, sessionStorage for tokens)
 *   - Validate settings
 *   - Build BC API URLs
 *   - Manage data source mode ('bc' | 'local')
 *   - Render and control the Settings modal UI
 */

'use strict';

import { validateTenantId, validateClientId, initAuth } from './bc-auth.js';

// ── Storage key ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'bc-sankey-settings';

// ── Default settings ───────────────────────────────────────────────────────

export const DEFAULT_SETTINGS = {
  // BC Connection
  clientId:   '',          // Azure App Registration Client ID
  tenantId:   '',          // Azure Tenant ID or domain
  companyId:  '',          // BC Company name or ID (display name)
  environment: 'production', // BC environment name

  // Kontenschema
  accountScheduleName: '', // Name des Kontenschemas in BC (z.B. "GuV")

  // Data source
  dataSource: 'local',    // 'bc' | 'local'
  localFilePath: '',       // last used local file name (display only)

  // UI
  animStepDelay: 600,
  animTransitionMs: 900,
};

// ── Settings CRUD ──────────────────────────────────────────────────────────

/**
 * Load settings from localStorage.
 * Merges with defaults so new keys always have a value.
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings to localStorage.
 * Returns { ok: true } or { ok: false, error }
 */
export function saveSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return { ok: false, error: 'Settings müssen ein Objekt sein' };
  }
  try {
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Reset settings to defaults.
 */
export function resetSettings() {
  localStorage.removeItem(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS };
}

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate a full settings object.
 * Returns { valid: boolean, errors: { field: message } }
 */
export function validateSettings(settings) {
  const errors = {};

  if (settings.dataSource === 'bc') {
    const clientResult = validateClientId(settings.clientId);
    if (!clientResult.valid) errors.clientId = clientResult.error;

    const tenantResult = validateTenantId(settings.tenantId);
    if (!tenantResult.valid) errors.tenantId = tenantResult.error;

    if (!settings.companyId || !settings.companyId.trim()) {
      errors.companyId = 'Mandant darf nicht leer sein';
    }
  }

  if (settings.animStepDelay !== undefined) {
    const delay = Number(settings.animStepDelay);
    if (isNaN(delay) || delay < 200 || delay > 5000) {
      errors.animStepDelay = 'Schrittdauer muss zwischen 200 und 5000 ms liegen';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ── BC API URL builder ─────────────────────────────────────────────────────

/**
 * Build the base OData URL for a Business Central company.
 *
 * Format: https://api.businesscentral.dynamics.com/v2.0/{tenantId}/{environment}/api/v2.0/companies({companyId})/
 */
export function buildBCApiUrl(tenantId, environment, companyId) {
  if (!tenantId || !environment || !companyId) return null;
  const t = tenantId.trim();
  const e = environment.trim();
  const c = companyId.trim();
  if (!t || !e || !c) return null;
  return `https://api.businesscentral.dynamics.com/v2.0/${t}/${e}/api/v2.0/companies(${c})/`;
}

/**
 * Build a specific BC OData endpoint URL.
 */
export function buildBCEndpointUrl(baseUrl, endpoint) {
  if (!baseUrl || !endpoint) return null;
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  return base + endpoint;
}

// ── Data source mode ───────────────────────────────────────────────────────

/**
 * Determine the effective data source mode from settings.
 * Returns 'bc' only if all BC settings are filled AND dataSource is 'bc'.
 * Otherwise falls back to 'local'.
 */
export function getDataSourceMode(settings) {
  if (!settings) return 'local';
  if (settings.dataSource !== 'bc') return 'local';
  if (!settings.clientId || !settings.tenantId || !settings.companyId) return 'local';
  return 'bc';
}

// ── Settings Modal UI ──────────────────────────────────────────────────────

const MODAL_ID   = 'bc-settings-modal';
const OVERLAY_ID = 'bc-settings-overlay';

/**
 * Open the settings modal.
 * Creates it if it doesn't exist yet.
 */
export function openSettings() {
  let modal = document.getElementById(MODAL_ID);
  if (!modal) {
    modal = _buildModal();
    document.body.appendChild(modal.overlay);
  }
  _populateModal();
  document.getElementById(OVERLAY_ID).classList.add('visible');
  document.getElementById(MODAL_ID).focus();
}

/**
 * Close the settings modal.
 */
export function closeSettings() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.classList.remove('visible');
}

// ── Modal builder ──────────────────────────────────────────────────────────

function _buildModal() {
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'bc-modal-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSettings(); });

  overlay.innerHTML = `
<div class="bc-modal" id="${MODAL_ID}" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="bc-modal-title">

  <div class="bc-modal__header">
    <span class="bc-modal__title" id="bc-modal-title">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="margin-right:6px;vertical-align:-2px">
        <path d="M8 0a1 1 0 0 1 1 1v.5a5.5 5.5 0 0 1 2.6 1.07l.36-.36a1 1 0 1 1 1.41 1.41l-.36.36A5.5 5.5 0 0 1 14.5 6.5H15a1 1 0 0 1 0 2h-.5a5.5 5.5 0 0 1-1.07 2.6l.36.36a1 1 0 0 1-1.41 1.41l-.36-.36A5.5 5.5 0 0 1 9.5 13.5V14a1 1 0 0 1-2 0v-.5a5.5 5.5 0 0 1-2.6-1.07l-.36.36A1 1 0 1 1 3.13 11.38l.36-.36A5.5 5.5 0 0 1 2.5 8.5H2a1 1 0 0 1 0-2h.5A5.5 5.5 0 0 1 3.57 4.13l-.36-.36A1 1 0 1 1 4.62 2.35l.36.36A5.5 5.5 0 0 1 7.5 1.5V1a1 1 0 0 1 1-1Zm0 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="currentColor"/>
      </svg>
      Einstellungen
    </span>
    <button class="bc-modal__close" id="bc-modal-close" aria-label="Schließen">&times;</button>
  </div>

  <div class="bc-modal__tabs">
    <button class="bc-tab active" data-tab="bc">Business Central</button>
    <button class="bc-tab"        data-tab="local">Lokale Daten</button>
    <button class="bc-tab"        data-tab="connection">Verbindung</button>
  </div>

  <!-- Tab: BC -->
  <div class="bc-tab-panel active" id="tab-panel-bc">
    <p class="bc-settings-hint">
      Verbinde bc-sankey direkt mit deiner Business Central Cloud-Umgebung.
      Du benötigst eine <a href="https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app" target="_blank" rel="noopener">Azure App-Registrierung</a>
      mit der Berechtigung <code>Financials.ReadWrite.All</code>.
    </p>
    <div class="bc-field-group">
      <label class="bc-field-label" for="set-client-id">Client-ID (Azure App Registration)</label>
      <input class="bc-field-input" id="set-client-id" type="text"
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" spellcheck="false" />
      <span class="bc-field-error" id="err-client-id"></span>
    </div>
    <div class="bc-field-group">
      <label class="bc-field-label" for="set-tenant-id">Tenant-ID oder Domain</label>
      <input class="bc-field-input" id="set-tenant-id" type="text"
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx oder contoso.onmicrosoft.com" autocomplete="off" spellcheck="false" />
      <span class="bc-field-error" id="err-tenant-id"></span>
    </div>
    <div class="bc-field-group">
      <label class="bc-field-label" for="set-company-id">Mandant (Company-Name oder ID)</label>
      <input class="bc-field-input" id="set-company-id" type="text"
        placeholder="CRONUS International Ltd." autocomplete="off" />
      <span class="bc-field-error" id="err-company-id"></span>
    </div>
    <div class="bc-field-group">
      <label class="bc-field-label" for="set-environment">Umgebungsname</label>
      <input class="bc-field-input" id="set-environment" type="text"
        placeholder="production" value="production" autocomplete="off" />
    </div>
    <div class="bc-field-group">
      <label class="bc-field-label" for="set-account-schedule">Kontenschema (Name in BC)</label>
      <input class="bc-field-input" id="set-account-schedule" type="text"
        placeholder="z.B. GuV oder Gewinn und Verlust" autocomplete="off" />
      <span class="bc-field-error" id="err-account-schedule"></span>
      <small style="display:block;margin-top:4px;font-size:9pt;color:var(--bc-text-muted)">
        Exakter Name des Kontenschemas aus <em>Finanzberichte</em> in Business Central.
        Kann leer bleiben — dann manuelle JSON-Eingabe verwenden.
      </small>
    </div>
    <div class="bc-field-group">
      <label class="bc-field-check">
        <input type="radio" name="datasource" id="ds-bc" value="bc" />
        Business Central als Datenquelle verwenden
      </label>
    </div>
  </div>

  <!-- Tab: Lokale Daten -->
  <div class="bc-tab-panel" id="tab-panel-local">
    <p class="bc-settings-hint">
      Lade eine lokale JSON-Datei im bc-sankey Format. Diese Option funktioniert
      ohne Microsoft-Anmeldung und eignet sich für Tests und Demonstrationen.
    </p>
    <div class="bc-upload-zone" id="settings-drop-zone">
      <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/></svg>
      <p>JSON-Datei hier ablegen<br/>oder</p>
      <button class="bc-btn bc-btn--primary" id="settings-upload-btn">Datei auswählen</button>
      <input type="file" id="settings-file-input" accept=".json" style="display:none" />
    </div>
    <div class="bc-loaded-file" id="settings-loaded-file" style="display:none">
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
      <span id="settings-file-name">—</span>
    </div>
    <div class="bc-field-group" style="margin-top:1.5rem">
      <label class="bc-field-check">
        <input type="radio" name="datasource" id="ds-local" value="local" checked />
        Lokale Datei als Datenquelle verwenden
      </label>
    </div>
  </div>

  <!-- Tab: Verbindung -->
  <div class="bc-tab-panel" id="tab-panel-connection">
    <div class="bc-connection-status" id="conn-status">
      <div class="bc-status-row">
        <span class="bc-status-dot" id="conn-dot"></span>
        <span class="bc-status-label" id="conn-label">Nicht angemeldet</span>
      </div>
      <div class="bc-status-detail" id="conn-detail"></div>
    </div>
    <div style="margin-top:1rem">
      <p class="bc-settings-hint" id="conn-hint">
        Melde dich mit deinem Microsoft-Konto an, um auf Business Central zuzugreifen.
        Stelle sicher, dass Client-ID und Tenant-ID im Tab „Business Central" eingetragen sind.
      </p>
    </div>
    <div class="bc-field-group" style="margin-top:1rem">
      <label class="bc-field-label">API-Basis-URL (Vorschau)</label>
      <div class="bc-url-preview" id="api-url-preview">—</div>
    </div>
  </div>

  <div class="bc-modal__footer">
    <button class="bc-btn" id="btn-settings-cancel">Abbrechen</button>
    <button class="bc-btn bc-btn--primary" id="btn-settings-save">Speichern</button>
  </div>

</div>`;

  // Event-Listener
  overlay.querySelector('#bc-modal-close').addEventListener('click', closeSettings);
  overlay.querySelector('#btn-settings-cancel').addEventListener('click', closeSettings);
  overlay.querySelector('#btn-settings-save').addEventListener('click', _onSave);

  // Tabs
  overlay.querySelectorAll('.bc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.bc-tab').forEach(t => t.classList.remove('active'));
      overlay.querySelectorAll('.bc-tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      overlay.querySelector('#tab-panel-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'connection') _refreshConnectionTab();
    });
  });

  // File upload in local tab
  overlay.querySelector('#settings-upload-btn').addEventListener('click', () => {
    overlay.querySelector('#settings-file-input').click();
  });
  overlay.querySelector('#settings-file-input').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) _onLocalFileSelected(f);
  });

  // Drag & drop
  const dz = overlay.querySelector('#settings-drop-zone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith('.json')) _onLocalFileSelected(f);
  });

  // ESC key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSettings();
  });

  return { overlay };
}

// ── Modal population ───────────────────────────────────────────────────────

function _populateModal() {
  const s = loadSettings();
  _setVal('set-client-id',       s.clientId);
  _setVal('set-tenant-id',       s.tenantId);
  _setVal('set-company-id',      s.companyId);
  _setVal('set-environment',     s.environment);
  _setVal('set-account-schedule', s.accountScheduleName);

  const radio = document.querySelector(`input[name="datasource"][value="${s.dataSource}"]`);
  if (radio) radio.checked = true;

  const fileDisplay = document.getElementById('settings-loaded-file');
  const fileName    = document.getElementById('settings-file-name');
  if (s.localFilePath) {
    fileDisplay.style.display = 'flex';
    fileName.textContent = s.localFilePath;
  } else {
    fileDisplay.style.display = 'none';
  }

  _clearErrors();
  _refreshConnectionTab();
}

function _refreshConnectionTab() {
  const s = loadSettings();
  const dot    = document.getElementById('conn-dot');
  const label  = document.getElementById('conn-label');
  const detail = document.getElementById('conn-detail');
  const preview = document.getElementById('api-url-preview');
  if (!dot) return;

  const isLoggedIn = window.bcAuth && window.bcAuth.isSignedIn && window.bcAuth.isSignedIn();
  const account    = window.bcAuth && window.bcAuth.getAccount ? window.bcAuth.getAccount() : null;

  if (isLoggedIn && account) {
    dot.className    = 'bc-status-dot connected';
    label.textContent = 'Angemeldet als ' + account.name;
    detail.textContent = account.email;
  } else {
    dot.className    = 'bc-status-dot';
    label.textContent = 'Nicht angemeldet';
    detail.textContent = '';
  }

  const url = buildBCApiUrl(s.tenantId, s.environment, s.companyId);
  if (preview) preview.textContent = url || '— (Tenant-ID, Umgebung und Mandant ausfüllen)';
}

// ── Save handler ──────────────────────────────────────────────────────────

function _onSave() {
  _clearErrors();
  const s = loadSettings();

  const newSettings = {
    ...s,
    clientId:            _getVal('set-client-id'),
    tenantId:            _getVal('set-tenant-id'),
    companyId:           _getVal('set-company-id'),
    environment:         _getVal('set-environment') || 'production',
    accountScheduleName: _getVal('set-account-schedule'),
    dataSource:          document.querySelector('input[name="datasource"]:checked')?.value || 'local',
  };

  const { valid, errors } = validateSettings(newSettings);
  if (!valid) {
    Object.entries(errors).forEach(([field, msg]) => {
      const errEl = document.getElementById('err-' + field);
      if (errEl) errEl.textContent = msg;
      const input = document.getElementById('set-' + field);
      if (input) input.classList.add('error');
    });
    return;
  }

  saveSettings(newSettings);

  // Re-initialize auth if BC credentials changed
  if (newSettings.clientId && newSettings.tenantId) {
    initAuth(newSettings.clientId, newSettings.tenantId);
  }

  // Dispatch event so main app can react
  document.dispatchEvent(new CustomEvent('bc-settings-saved', { detail: newSettings }));

  closeSettings();
}

// ── Local file selected in Settings modal ──────────────────────────────────

function _onLocalFileSelected(file) {
  const fileDisplay = document.getElementById('settings-loaded-file');
  const fileName    = document.getElementById('settings-file-name');
  if (fileDisplay && fileName) {
    fileDisplay.style.display = 'flex';
    fileName.textContent = file.name;
  }
  const radio = document.getElementById('ds-local');
  if (radio) radio.checked = true;

  // Update localFilePath in live settings
  const s = loadSettings();
  s.localFilePath = file.name;
  s.dataSource    = 'local';
  saveSettings(s);

  // Relay file to main app
  document.dispatchEvent(new CustomEvent('bc-local-file-selected', { detail: file }));
  closeSettings();
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || '';
}

function _clearErrors() {
  document.querySelectorAll('.bc-field-error').forEach(el => { el.textContent = ''; });
  document.querySelectorAll('.bc-field-input.error').forEach(el => el.classList.remove('error'));
}
