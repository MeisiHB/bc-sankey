/**
 * api.test.js
 * Unit tests for bc-api.js
 * Tests pure logic: URL builders, parsers, error handling, converters
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildODataCompanyUrl,
  buildAccScheduleNamesUrl,
  buildAccScheduleLinesUrl,
  buildColumnLayoutUrl,
  parseBCError,
  parseAccScheduleLines,
  parseAccScheduleNames,
  filterSankeyRelevantLines,
  convertScheduleToSankey,
  guessNodeGroup,
  BCApiError,
  ROW_TYPES,
} from '../js/bc-api.js';

// ── buildODataCompanyUrl ──────────────────────────────────────────────────

describe('buildODataCompanyUrl', () => {
  const tid = '12345678-1234-1234-1234-123456789012';
  const env = 'production';
  const co  = 'CRONUS International Ltd.';

  it('builds a correct OData company URL', () => {
    const url = buildODataCompanyUrl(tid, env, co);
    expect(url).toContain('api.businesscentral.dynamics.com');
    expect(url).toContain('ODataV4');
    expect(url).toContain('Company(');
  });

  it('includes tenant ID in URL', () => {
    expect(buildODataCompanyUrl(tid, env, co)).toContain(tid);
  });

  it('includes environment name in URL', () => {
    expect(buildODataCompanyUrl(tid, env, co)).toContain(env);
  });

  it('URL-encodes company name with special chars', () => {
    const url = buildODataCompanyUrl(tid, env, 'CRONUS International Ltd.');
    expect(url).toContain(encodeURIComponent('CRONUS International Ltd.'));
  });

  it('returns null when tenantId is missing', () => {
    expect(buildODataCompanyUrl('', env, co)).toBeNull();
  });

  it('returns null when environment is missing', () => {
    expect(buildODataCompanyUrl(tid, '', co)).toBeNull();
  });

  it('returns null when companyName is missing', () => {
    expect(buildODataCompanyUrl(tid, env, '')).toBeNull();
  });

  it('returns null for null inputs', () => {
    expect(buildODataCompanyUrl(null, env, co)).toBeNull();
  });

  it('trims whitespace from all inputs', () => {
    const url = buildODataCompanyUrl('  '+tid+'  ', '  '+env+'  ', '  '+co+'  ');
    expect(url).not.toContain('  ');
  });

  it('always uses https', () => {
    expect(buildODataCompanyUrl(tid, env, co)).toMatch(/^https:\/\//);
  });
});

// ── buildAccScheduleNamesUrl ──────────────────────────────────────────────

describe('buildAccScheduleNamesUrl', () => {
  const base = 'https://api.businesscentral.dynamics.com/v2.0/tid/production/ODataV4/Company(\'CRONUS\')';

  it('appends AccScheduleNames endpoint', () => {
    expect(buildAccScheduleNamesUrl(base)).toContain('AccScheduleNames');
  });

  it('includes $format=json', () => {
    expect(buildAccScheduleNamesUrl(base)).toContain('$format=json');
  });

  it('returns null for null input', () => {
    expect(buildAccScheduleNamesUrl(null)).toBeNull();
  });

  it('handles base URL with trailing slash', () => {
    const url = buildAccScheduleNamesUrl(base + '/');
    expect(url).toContain('AccScheduleNames');
    expect(url).not.toContain('//AccScheduleNames');
  });
});

// ── buildAccScheduleLinesUrl ──────────────────────────────────────────────

describe('buildAccScheduleLinesUrl', () => {
  const base = 'https://api.businesscentral.dynamics.com/v2.0/tid/production/ODataV4/Company(\'CRONUS\')';

  it('appends AccScheduleLines endpoint', () => {
    expect(buildAccScheduleLinesUrl(base, 'GuV')).toContain('AccScheduleLines');
  });

  it('includes $filter with schedule name', () => {
    const url = buildAccScheduleLinesUrl(base, 'GuV');
    expect(url).toContain('ScheduleName');
    expect(url).toContain(encodeURIComponent('GuV'));
  });

  it('URL-encodes schedule names with spaces', () => {
    const url = buildAccScheduleLinesUrl(base, 'Gewinn und Verlust');
    expect(url).toContain(encodeURIComponent('Gewinn und Verlust'));
  });

  it('includes $format=json', () => {
    expect(buildAccScheduleLinesUrl(base, 'GuV')).toContain('$format=json');
  });

  it('returns null when companyUrl is null', () => {
    expect(buildAccScheduleLinesUrl(null, 'GuV')).toBeNull();
  });

  it('returns null when scheduleName is null', () => {
    expect(buildAccScheduleLinesUrl(base, null)).toBeNull();
  });

  it('returns null when scheduleName is empty', () => {
    expect(buildAccScheduleLinesUrl(base, '')).toBeNull();
  });

  it('trims whitespace from schedule name', () => {
    const url = buildAccScheduleLinesUrl(base, '  GuV  ');
    // Should contain 'GuV' not '  GuV  '
    expect(url).toContain(encodeURIComponent('GuV'));
  });
});

// ── parseBCError ──────────────────────────────────────────────────────────

describe('parseBCError', () => {
  it('returns friendly message for 401', () => {
    const msg = parseBCError('', 401);
    expect(msg).toContain('autorisiert');
  });

  it('returns friendly message for 403', () => {
    expect(parseBCError('', 403)).toContain('Zugriff');
  });

  it('returns friendly message for 404', () => {
    expect(parseBCError('', 404)).toContain('nicht gefunden');
  });

  it('returns friendly message for 429', () => {
    expect(parseBCError('', 429)).toContain('viele Anfragen');
  });

  it('returns friendly message for 503', () => {
    expect(parseBCError('', 503)).toContain('nicht verfügbar');
  });

  it('extracts message from BC JSON error body', () => {
    const body = JSON.stringify({ error: { message: 'Company ACME not found.' } });
    expect(parseBCError(body, 404)).toContain('Company ACME not found.');
  });

  it('falls back to generic message for unknown status', () => {
    const msg = parseBCError('', 418);
    expect(msg).toContain('418');
  });

  it('handles empty body gracefully', () => {
    expect(() => parseBCError('', 500)).not.toThrow();
  });

  it('handles malformed JSON body gracefully', () => {
    expect(() => parseBCError('NOT JSON {{{', 404)).not.toThrow();
  });

  it('handles null body gracefully', () => {
    expect(() => parseBCError(null, 401)).not.toThrow();
  });
});

// ── BCApiError ────────────────────────────────────────────────────────────

describe('BCApiError', () => {
  it('is an Error instance', () => {
    expect(new BCApiError('msg', 404, 'url')).toBeInstanceOf(Error);
  });

  it('has correct name', () => {
    expect(new BCApiError('msg', 404, 'url').name).toBe('BCApiError');
  });

  it('stores status code', () => {
    expect(new BCApiError('msg', 401, 'url').statusCode).toBe(401);
  });

  it('stores URL', () => {
    expect(new BCApiError('msg', 404, 'https://example.com').url).toBe('https://example.com');
  });

  it('message is accessible', () => {
    expect(new BCApiError('Fehler!', 500, '').message).toBe('Fehler!');
  });
});

// ── parseAccScheduleLines ─────────────────────────────────────────────────

describe('parseAccScheduleLines', () => {
  const mockResponse = {
    value: [
      { LineNo: 10, Description: 'Umsatzerlöse', Totaling: '4000..4999', RowType: 'Posting Accounts', Bold: true, Italic: false, Indentation: 0 },
      { LineNo: 20, Description: 'Materialkosten', Totaling: '5000..5499', RowType: 'Posting Accounts', Bold: false, Italic: false, Indentation: 1 },
      { LineNo: 30, Description: 'EBIT', Totaling: '10+20', RowType: 'Formula', Bold: true, Italic: false, Indentation: 0 },
    ],
  };

  it('returns array of correct length', () => {
    expect(parseAccScheduleLines(mockResponse)).toHaveLength(3);
  });

  it('maps LineNo correctly', () => {
    expect(parseAccScheduleLines(mockResponse)[0].lineNo).toBe(10);
  });

  it('maps Description correctly', () => {
    expect(parseAccScheduleLines(mockResponse)[0].description).toBe('Umsatzerlöse');
  });

  it('maps Totaling correctly', () => {
    expect(parseAccScheduleLines(mockResponse)[0].totaling).toBe('4000..4999');
  });

  it('maps RowType correctly', () => {
    expect(parseAccScheduleLines(mockResponse)[0].rowType).toBe('Posting Accounts');
  });

  it('maps Bold flag correctly', () => {
    expect(parseAccScheduleLines(mockResponse)[0].bold).toBe(true);
    expect(parseAccScheduleLines(mockResponse)[1].bold).toBe(false);
  });

  it('maps Indentation correctly', () => {
    expect(parseAccScheduleLines(mockResponse)[1].indentation).toBe(1);
  });

  it('returns empty array for null response', () => {
    expect(parseAccScheduleLines(null)).toEqual([]);
  });

  it('returns empty array when value is missing', () => {
    expect(parseAccScheduleLines({})).toEqual([]);
  });

  it('returns empty array when value is not an array', () => {
    expect(parseAccScheduleLines({ value: 'wrong' })).toEqual([]);
  });

  it('handles alternative BC field names (Line_No)', () => {
    const alt = { value: [{ Line_No: 99, Description: 'Test', RowType: 'Total' }] };
    expect(parseAccScheduleLines(alt)[0].lineNo).toBe(99);
  });
});

// ── parseAccScheduleNames ─────────────────────────────────────────────────

describe('parseAccScheduleNames', () => {
  const mockResponse = {
    value: [
      { Name: 'GuV', Description: 'Gewinn und Verlust', DefaultColumnLayout: 'Standard' },
      { Name: 'Bilanz', Description: 'Bilanz', DefaultColumnLayout: '' },
    ],
  };

  it('parses name correctly', () => {
    expect(parseAccScheduleNames(mockResponse)[0].name).toBe('GuV');
  });

  it('parses description correctly', () => {
    expect(parseAccScheduleNames(mockResponse)[0].description).toBe('Gewinn und Verlust');
  });

  it('parses columnLayoutName correctly', () => {
    expect(parseAccScheduleNames(mockResponse)[0].columnLayoutName).toBe('Standard');
  });

  it('returns empty array for null response', () => {
    expect(parseAccScheduleNames(null)).toEqual([]);
  });

  it('returns correct count', () => {
    expect(parseAccScheduleNames(mockResponse)).toHaveLength(2);
  });
});

// ── filterSankeyRelevantLines ─────────────────────────────────────────────

describe('filterSankeyRelevantLines', () => {
  const lines = [
    { lineNo: 10, description: 'Umsatzerlöse',    totaling: '4000..4999', rowType: 'Posting Accounts' },
    { lineNo: 20, description: '',                 totaling: '',           rowType: 'Heading' },
    { lineNo: 30, description: 'Überschrift',      totaling: '',           rowType: 'Heading' },
    { lineNo: 40, description: 'Gesamtumsatz',     totaling: '10',         rowType: 'Formula' },
    { lineNo: 50, description: 'Materialaufwand',  totaling: '5000..5499', rowType: 'Posting Accounts' },
  ];

  it('removes lines with empty description', () => {
    const result = filterSankeyRelevantLines(lines);
    expect(result.every(l => l.description.trim())).toBe(true);
  });

  it('removes heading lines without totaling', () => {
    const result = filterSankeyRelevantLines(lines);
    const headingsWithoutTotaling = result.filter(l => l.rowType === 'Heading' && !l.totaling);
    expect(headingsWithoutTotaling).toHaveLength(0);
  });

  it('keeps posting account lines', () => {
    const result = filterSankeyRelevantLines(lines);
    expect(result.some(l => l.rowType === 'Posting Accounts')).toBe(true);
  });

  it('keeps formula lines with description', () => {
    const result = filterSankeyRelevantLines(lines);
    expect(result.some(l => l.rowType === 'Formula')).toBe(true);
  });

  it('returns empty array for null input', () => {
    expect(filterSankeyRelevantLines(null)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(filterSankeyRelevantLines([])).toEqual([]);
  });
});

// ── guessNodeGroup ────────────────────────────────────────────────────────

describe('guessNodeGroup', () => {
  const makeLine = (desc, rowType = 'Posting Accounts') => ({
    description: desc, rowType, totaling: '1000..2000'
  });

  it('identifies revenue line by keyword "umsatz"', () => {
    const result = guessNodeGroup(makeLine('Umsatzerlöse'), 0, [makeLine('Umsatzerlöse')]);
    expect(['revenue-1', 'revenue-2']).toContain(result);
  });

  it('identifies result line by keyword "ebit"', () => {
    const lines = [makeLine('EBIT')];
    expect(guessNodeGroup(lines[0], 0, lines)).toBe('result');
  });

  it('identifies result line by keyword "ergebnis"', () => {
    const lines = [makeLine('Betriebsergebnis')];
    expect(guessNodeGroup(lines[0], 0, lines)).toBe('result');
  });

  it('identifies total line by keyword "gesamt"', () => {
    const lines = [makeLine('Gesamtumsatz')];
    expect(guessNodeGroup(lines[0], 0, lines)).toBe('total');
  });

  it('identifies cost line by keyword "kosten"', () => {
    const lines = Array(10).fill(null).map((_, i) => makeLine(i === 7 ? 'Gesamtkosten' : `Z${i}`));
    expect(guessNodeGroup(lines[7], 7, lines)).toBe('cost-1');
  });

  it('returns a valid group for unknown lines', () => {
    const validGroups = ['revenue-2', 'revenue-1', 'total', 'cost-1', 'cost-2', 'result'];
    const lines = [makeLine('Unbekannt')];
    expect(validGroups).toContain(guessNodeGroup(lines[0], 0, lines));
  });
});

// ── convertScheduleToSankey ───────────────────────────────────────────────

describe('convertScheduleToSankey', () => {
  const lines = [
    { lineNo: 10, description: 'Umsatzerlöse',   totaling: '4000..4999', rowType: 'Posting Accounts', bold: false, italic: false, indentation: 0 },
    { lineNo: 20, description: 'Gesamtumsatz',    totaling: '10',         rowType: 'Total',            bold: true,  italic: false, indentation: 0 },
    { lineNo: 30, description: 'Personalaufwand', totaling: '6000..6499', rowType: 'Posting Accounts', bold: false, italic: false, indentation: 0 },
    { lineNo: 40, description: 'EBIT',            totaling: '20-30',      rowType: 'Formula',          bold: true,  italic: false, indentation: 0 },
  ];

  it('returns non-null result for valid lines', () => {
    expect(convertScheduleToSankey(lines, 'GuV')).not.toBeNull();
  });

  it('includes title from schedule name', () => {
    expect(convertScheduleToSankey(lines, 'GuV').title).toBe('GuV');
  });

  it('returns nodes array', () => {
    const result = convertScheduleToSankey(lines, 'GuV');
    expect(Array.isArray(result.nodes)).toBe(true);
  });

  it('returns links array', () => {
    const result = convertScheduleToSankey(lines, 'GuV');
    expect(Array.isArray(result.links)).toBe(true);
  });

  it('marks source as bc-odata', () => {
    expect(convertScheduleToSankey(lines, 'GuV')._source).toBe('bc-odata');
  });

  it('includes warning about manual review', () => {
    expect(convertScheduleToSankey(lines, 'GuV')._warning).toBeTruthy();
  });

  it('returns null for empty lines array', () => {
    expect(convertScheduleToSankey([], 'GuV')).toBeNull();
  });

  it('returns null for null lines', () => {
    expect(convertScheduleToSankey(null, 'GuV')).toBeNull();
  });

  it('each node has id, label, and group', () => {
    const result = convertScheduleToSankey(lines, 'GuV');
    result.nodes.forEach(n => {
      expect(n.id).toBeTruthy();
      expect(n.label).toBeTruthy();
      expect(n.group).toBeTruthy();
    });
  });
});
