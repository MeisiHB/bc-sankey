/**
 * fixtures.js
 * Shared test data used across all test files.
 */

export const SAMPLE_DATA = {
  title:      'Gewinn- und Verlustrechnung 2024',
  period:     'Geschäftsjahr 2024',
  currency:   'EUR',
  unit:       1000,
  unit_label: 'T€',

  nodes: [
    { id: 'inland',        label: 'Inland',          group: 'revenue-2' },
    { id: 'export',        label: 'Export',           group: 'revenue-2' },
    { id: 'service',       label: 'Service',          group: 'revenue-2' },
    { id: 'prod-revenue',  label: 'Produktumsatz',    group: 'revenue-1' },
    { id: 'svc-revenue',   label: 'Serviceumsatz',    group: 'revenue-1' },
    { id: 'total-revenue', label: 'Gesamtumsatz',     group: 'total'     },
    { id: 'personnel',     label: 'Personal',         group: 'cost-1'    },
    { id: 'material',      label: 'Material',         group: 'cost-1'    },
    { id: 'other',         label: 'Sonstige Kosten',  group: 'cost-1'    },
    { id: 'ebit',          label: 'EBIT',             group: 'result'    },
    { id: 'wages',         label: 'Löhne & Gehälter', group: 'cost-2'    },
    { id: 'social',        label: 'Sozialabgaben',    group: 'cost-2'    },
    { id: 'rawmat',        label: 'Rohstoffe',        group: 'cost-2'    },
    { id: 'energy',        label: 'Energie',          group: 'cost-2'    },
  ],

  links: [
    { source: 'inland',        target: 'prod-revenue',  value: 420 },
    { source: 'export',        target: 'prod-revenue',  value: 180 },
    { source: 'service',       target: 'svc-revenue',   value: 200 },
    { source: 'prod-revenue',  target: 'total-revenue', value: 600 },
    { source: 'svc-revenue',   target: 'total-revenue', value: 200 },
    { source: 'total-revenue', target: 'personnel',     value: 280 },
    { source: 'total-revenue', target: 'material',      value: 180 },
    { source: 'total-revenue', target: 'other',         value: 100 },
    { source: 'total-revenue', target: 'ebit',          value: 240 },
    { source: 'personnel',     target: 'wages',         value: 200 },
    { source: 'personnel',     target: 'social',        value:  80 },
    { source: 'material',      target: 'rawmat',        value: 130 },
    { source: 'material',      target: 'energy',        value:  50 },
  ],
};

export const LOSS_DATA = { ...SAMPLE_DATA, title: 'Verlustjahr 2023', links: SAMPLE_DATA.links.map(l => l.target === 'ebit' ? { ...l, value: -40 } : l) };

export const MINIMAL_DATA = {
  currency: 'EUR', unit_label: 'T€',
  nodes: [{ id: 'rev', label: 'Umsatz', group: 'total' }, { id: 'costs', label: 'Kosten', group: 'cost-1' }, { id: 'result', label: 'Gewinn', group: 'result' }],
  links: [{ source: 'rev', target: 'costs', value: 700 }, { source: 'rev', target: 'result', value: 300 }]
};
