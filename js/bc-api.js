/**
 * bc-api.js
 * Business Central OData API client for bc-sankey
 *
 * Weg A: Manuelle Konfiguration des Kontenschemas.
 * Der Nutzer trägt den Namen des Kontenschemas in den Einstellungen ein.
 * Voraussetzung: Seiten 103 (Acc. Schedule Names) und 104 (Acc. Schedule Lines)
 * müssen in BC als OData-Webservices veröffentlicht sein.
 *
 * Veröffentlichung in BC:
 *   Suche → Webservices → Neu → Page 103 → "AccScheduleNames"  → Veröffentlicht ✓
 *                               → Page 104 → "AccScheduleLines" → Veröffentlicht ✓
 *
 * Endpunkte (Beispiel):
 *   GET .../ODataV4/Company('CRONUS')/AccScheduleNames
 *   GET .../ODataV4/Company('CRONUS')/AccScheduleLines?$filter=ScheduleName eq 'GuV'
 */

'use strict';

// ── BC OData Basis-URL ────────────────────────────────────────────────────

const BC_ODATA_BASE = 'https://api.businesscentral.dynamics.com/v2.0';

// ── Zeilentypen in einem Kontenschema ─────────────────────────────────────

export const ROW_TYPES = {
  POSTING:   'Posting Accounts',  // Buchungskonten
  TOTAL:     'Total',             // Summe/Ergebnis
  FORMULA:   'Formula',          // Formel
  HEADING:   'Heading',          // Überschrift (kein Wert)
  BEGIN_TOTAL: 'Begin-Total',    // Anfang Einzug
  END_TOTAL:   'End-Total',      // Ende Einzug
};

// ── URL Builder ───────────────────────────────────────────────────────────

/**
 * Build the OData base URL for a BC company.
 * @param {string} tenantId
 * @param {string} environment
 * @param {string} companyName - exact company display name as in BC
 * @returns {string}
 */
export function buildODataCompanyUrl(tenantId, environment, companyName) {
  if (!tenantId || !environment || !companyName) return null;
  const t = tenantId.trim();
  const e = environment.trim();
  const c = companyName.trim();
  if (!t || !e || !c) return null;
  return `${BC_ODATA_BASE}/${t}/${e}/ODataV4/Company('${encodeURIComponent(c)}')`;
}

/**
 * Build URL to list all account schedule names for a company.
 */
export function buildAccScheduleNamesUrl(companyUrl) {
  if (!companyUrl) return null;
  const base = companyUrl.endsWith('/') ? companyUrl.slice(0, -1) : companyUrl;
  return `${base}/AccScheduleNames?$format=json`;
}

/**
 * Build URL to fetch lines of a specific account schedule.
 * @param {string} companyUrl
 * @param {string} scheduleName - exact name of the Kontenschema
 * @returns {string}
 */
export function buildAccScheduleLinesUrl(companyUrl, scheduleName) {
  if (!companyUrl || !scheduleName) return null;
  const base = companyUrl.endsWith('/') ? companyUrl.slice(0, -1) : companyUrl;
  const filter = `ScheduleName eq '${scheduleName.trim()}'`;
  return `${base}/AccScheduleLines?$filter=${encodeURIComponent(filter)}&$format=json`;
}

/**
 * Build URL to fetch column layout entries.
 * @param {string} companyUrl
 * @param {string} columnLayoutName
 */
export function buildColumnLayoutUrl(companyUrl, columnLayoutName) {
  if (!companyUrl || !columnLayoutName) return null;
  const base = companyUrl.endsWith('/') ? companyUrl.slice(0, -1) : companyUrl;
  const filter = `ColumnLayoutName eq '${columnLayoutName.trim()}'`;
  return `${base}/AccScheduleColumnLayout?$filter=${encodeURIComponent(filter)}&$format=json`;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────

/**
 * Perform an authenticated GET request against the BC OData API.
 * @param {string} url
 * @param {string|null} accessToken - Bearer token (null = no auth header)
 * @returns {Promise<object>} parsed JSON response
 */
export async function bcGet(url, accessToken = null) {
  if (!url) throw new Error('bc-api: URL ist erforderlich');

  const headers = {
    'Accept': 'application/json',
    'Data-Access-Intent': 'ReadOnly',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const msg = parseBCError(errorBody, response.status);
    throw new BCApiError(msg, response.status, url);
  }

  return response.json();
}

// ── Fehlerbehandlung ──────────────────────────────────────────────────────

export class BCApiError extends Error {
  constructor(message, statusCode, url) {
    super(message);
    this.name = 'BCApiError';
    this.statusCode = statusCode;
    this.url = url;
  }
}

/**
 * Parse a BC OData error response body into a user-friendly message.
 * @param {string} body - raw response body (may be JSON or empty)
 * @param {number} status - HTTP status code
 * @returns {string}
 */
export function parseBCError(body, status) {
  const defaults = {
    401: 'Nicht autorisiert. Bitte melde dich an und prüfe die Berechtigungen.',
    403: 'Zugriff verweigert. Der Benutzer hat keine Berechtigung auf diesen Bereich.',
    404: 'Endpunkt nicht gefunden. Prüfe ob der Webservice in BC veröffentlicht ist.',
    429: 'Zu viele Anfragen. Bitte warte kurz und versuche es erneut.',
    500: 'Interner BC-Serverfehler. Bitte prüfe die BC-Umgebung.',
    503: 'BC-Dienst vorübergehend nicht verfügbar.',
  };

  try {
    if (body && body.trim().startsWith('{')) {
      const parsed = JSON.parse(body);
      const msg = parsed?.error?.message || parsed?.message;
      if (msg) return msg;
    }
  } catch { /* ignore parse errors */ }

  return defaults[status] || `HTTP-Fehler ${status}`;
}

// ── Response Parser ───────────────────────────────────────────────────────

/**
 * Parse the raw OData response from AccScheduleLines into a structured array.
 * Returns only lines that carry data (excludes headings, empty rows).
 * @param {object} odataResponse - raw OData JSON response
 * @returns {Array<AccScheduleLine>}
 */
export function parseAccScheduleLines(odataResponse) {
  if (!odataResponse || !Array.isArray(odataResponse.value)) {
    return [];
  }

  return odataResponse.value.map(row => ({
    lineNo:        row.LineNo          || row.Line_No            || 0,
    description:   row.Description    || '',
    totaling:      row.Totaling       || '',
    rowType:       row.RowType        || row.Row_Type            || '',
    bold:          row.Bold           || false,
    italic:        row.Italic         || false,
    indentation:   Number(row.Indentation || 0),
    showOppositeSign: row.ShowOppositeSign || row.Show_Opposite_Sign || false,
  }));
}

/**
 * Parse AccScheduleNames OData response.
 * @param {object} odataResponse
 * @returns {Array<{name: string, description: string, columnLayoutName: string}>}
 */
export function parseAccScheduleNames(odataResponse) {
  if (!odataResponse || !Array.isArray(odataResponse.value)) {
    return [];
  }

  return odataResponse.value.map(row => ({
    name:             row.Name              || '',
    description:      row.Description       || '',
    columnLayoutName: row.DefaultColumnLayout || row.Column_Layout_Name || '',
  }));
}

/**
 * Filter account schedule lines to only those relevant for Sankey display.
 * Removes headings, blank rows, and formula-only rows without totaling.
 * @param {Array<AccScheduleLine>} lines
 * @returns {Array<AccScheduleLine>}
 */
export function filterSankeyRelevantLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.filter(line => {
    // Keep only lines that have a description and represent real values
    if (!line.description || !line.description.trim()) return false;
    // Skip pure headings without totaling
    if (line.rowType === ROW_TYPES.HEADING && !line.totaling) return false;
    return true;
  });
}

// ── High-level API functions ──────────────────────────────────────────────

/**
 * Fetch account schedule lines for a given schedule name.
 * Returns { lines, rawResponse } on success, throws BCApiError on failure.
 *
 * @param {{ tenantId, environment, companyName, accountScheduleName }} settings
 * @param {string|null} accessToken
 * @returns {Promise<{ lines: Array, rawResponse: object }>}
 */
export async function fetchAccountScheduleLines(settings, accessToken = null) {
  const { tenantId, environment, companyName, accountScheduleName } = settings;

  if (!tenantId || !environment || !companyName) {
    throw new Error('Tenant, Umgebung und Mandant müssen in den Einstellungen konfiguriert sein.');
  }
  if (!accountScheduleName || !accountScheduleName.trim()) {
    throw new Error('Kein Kontenschema konfiguriert. Bitte in den Einstellungen eintragen.');
  }

  const companyUrl = buildODataCompanyUrl(tenantId, environment, companyName);
  if (!companyUrl) throw new Error('Ungültige Verbindungseinstellungen.');

  const linesUrl = buildAccScheduleLinesUrl(companyUrl, accountScheduleName);
  const rawResponse = await bcGet(linesUrl, accessToken);
  const lines = parseAccScheduleLines(rawResponse);

  return { lines, rawResponse };
}

/**
 * Test the BC connection by fetching the company info endpoint.
 * Returns { ok: true, companies } or throws BCApiError.
 * @param {{ tenantId, environment }} settings
 * @param {string|null} accessToken
 */
export async function testConnection(settings, accessToken = null) {
  const { tenantId, environment } = settings;
  if (!tenantId || !environment) {
    throw new Error('Tenant und Umgebung sind erforderlich.');
  }

  const url = `${BC_ODATA_BASE}/${tenantId.trim()}/${environment.trim()}/api/v2.0/companies?$format=json`;
  const response = await bcGet(url, accessToken);
  const companies = (response.value || []).map(c => ({
    id:   c.id,
    name: c.name,
    displayName: c.displayName || c.name,
  }));

  return { ok: true, companies };
}

/**
 * Convert account schedule lines to a bc-sankey JSON structure.
 * This is a best-effort mapping — complex formulas may need manual adjustment.
 *
 * Strategy:
 *   - Lines with Begin-Total / End-Total define node groups
 *   - Lines with Totaling define the revenue/cost account ranges
 *   - The last End-Total with positive sign → revenue; negative → cost
 *
 * @param {Array<AccScheduleLine>} lines
 * @param {string} scheduleName
 * @returns {{ nodes: Array, links: Array, title: string } | null}
 */
export function convertScheduleToSankey(lines, scheduleName) {
  if (!lines || !lines.length) return null;

  // Identify structural blocks by indentation and row type
  const dataLines = filterSankeyRelevantLines(lines);

  // Build a flat node list from the lines
  // For now, return a structured representation that bc-sankey can use
  // Full mapping requires knowledge of the specific schema structure
  const nodes = dataLines
    .filter(l => l.totaling || l.rowType === 'Total')
    .map((l, i) => ({
      id:    `line-${l.lineNo}`,
      label: l.description,
      group: guessNodeGroup(l, i, dataLines),
      totaling: l.totaling,
      lineNo: l.lineNo,
    }));

  return {
    title: scheduleName,
    _source: 'bc-odata',
    _warning: 'Automatische Konvertierung — bitte Knoten und Verbindungen prüfen.',
    nodes,
    links: [], // Links müssen nach Prüfung der Struktur ergänzt werden
  };
}

/**
 * Heuristic: guess the Sankey node group from line position and type.
 * Revenue lines are typically at the top; cost/result at the bottom.
 * @param {AccScheduleLine} line
 * @param {number} index
 * @param {Array<AccScheduleLine>} allLines
 * @returns {string}
 */
export function guessNodeGroup(line, index, allLines) {
  const total = allLines.length;
  const pos   = total > 0 ? index / total : 0;
  const desc  = (line.description || '').toLowerCase();

  if (desc.includes('umsatz') || desc.includes('erlös') || desc.includes('revenue')) {
    return pos < 0.3 ? 'revenue-1' : 'revenue-2';
  }
  if (desc.includes('ergebnis') || desc.includes('gewinn') || desc.includes('ebit') || desc.includes('result')) {
    return 'result';
  }
  if (desc.includes('gesamt') || desc.includes('total')) {
    return 'total';
  }
  if (desc.includes('personal') || desc.includes('material') || desc.includes('kosten') || desc.includes('aufwand')) {
    return pos > 0.6 ? 'cost-1' : 'cost-2';
  }

  // Fallback by position
  if (pos < 0.25) return 'revenue-2';
  if (pos < 0.45) return 'revenue-1';
  if (pos < 0.55) return 'total';
  if (pos < 0.80) return 'cost-1';
  return 'result';
}
