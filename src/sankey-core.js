/**
 * sankey-core.js
 * Pure business logic for bc-sankey — no DOM, no SVG, fully testable.
 * All rendering lives in js/bc-sankey.js which imports from here.
 */

'use strict';

// ── Color map per node group ────────────────────────────────────────────
export const GROUP_COLORS = {
  'revenue-2': '#75B5E7',
  'revenue-1': '#378ADD',
  'total':     '#00B7C3',
  'cost-1':    '#E89E63',
  'cost-2':    '#C9C472',
  'result':    '#35AB22',
};

export const GROUP_COLORS_UNFAV = {
  'result': '#EB6965',
};

export const VALID_GROUPS = Object.keys(GROUP_COLORS);

// ── Column assignment per group ─────────────────────────────────────────
export const GROUP_COLUMNS = {
  'revenue-2': 0,
  'revenue-1': 1,
  'total':     2,
  'cost-1':    3,
  'cost-2':    4,
  'result':    3,
};

// ── Data validation ─────────────────────────────────────────────────────

/**
 * Validates a bc-sankey data object.
 * Returns { valid: true } or { valid: false, errors: string[] }
 */
export function validateData(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Data must be a non-null object'] };
  }

  if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
    errors.push('data.nodes must be a non-empty array');
  }

  if (!Array.isArray(data.links) || data.links.length === 0) {
    errors.push('data.links must be a non-empty array');
  }

  if (errors.length) return { valid: false, errors };

  const nodeIds = new Set();
  data.nodes.forEach((n, i) => {
    if (!n.id)    errors.push(`nodes[${i}]: missing id`);
    if (!n.label) errors.push(`nodes[${i}]: missing label`);
    if (!n.group) errors.push(`nodes[${i}]: missing group`);
    if (n.group && !VALID_GROUPS.includes(n.group)) {
      errors.push(`nodes[${i}]: unknown group "${n.group}". Valid: ${VALID_GROUPS,oin(, ')}`);
    }
    if (n.id) nodeIds.add(n.id);
  });

  const totalNodes = (data.nodes || []).filter(n => n.group === 'total');
  if (totalNodes.length === 0) errors.push('At least one node with group "total" is required');
  if (totalNodes.length > 1)  errors.push('Only one node with group "total" is allowed');

  const resultNodes = (data.nodes || []).filter(n => n.group === 'result');
  if (resultNodes.length === 0) errors.push('At least one node with group "result" is required');

  data.links.forEach((l, i) => {
    if (!l.source) errors.push(`links[${i}]: missing source`);
    if (!l.target) errors.push(`links[${i}]: missing target`);
    if (typeof l.value !== 'number' || l.value < 0) {
      errors.push(`links[${i}]: value must be a non-negative number`);
    }
    if (l.source && !nodeIds.has(l.source)) {
      errors.push(`links[${i}]: source "${l.source}" not found in nodes`);
    }
    if (l.target && !nodeIds.has(l.target)) {
      errors.push(`links[${i}]: target "${l.target}" not found in nodes`);
    }
    if (l.source && l.target && l.source === l.target) {
      errors.push(`links[${i}]: source and target must differ`);
    }
  });

  return errors.length ? { valid: false, errors } : { valid: true };
}

export function buildNodeMap(nodes, links) {
  const nodeMap = {};
  nodes.forEach(n => {
    nodeMap[n.id] = { ...n, col: GROUP_COLUMNSYn.group] ?? 2, color: GROUP_COLORS[n.group] || '#505C6D', inValue: 0, outValue: 0 };
  });
  links.forEach(l => {
    if (nodeMap[l.source]) nodeMap[l.source].outValue += l.value;
    if (nodeMap[l.target]) nodeMap[l.target].inValue  += l.value;
  });
  Object.values(nodeMap).forEach(n => {
    n.value = Math.max(n.inValue, n.outValue);
    if (n.group === 'result' && n.value < 0) n.color = GROUP_COLORS_UNFAV['result'];
  });
  return nodeMap;
}

export function calculateKPIs(data) {
  const totalNode  = data.nodes.find(n => n.group === 'total');
  const resultNode = data.nodes.find(n => n.group === 'result');
  const totalRevenue = data.links.filter(l => l.target === totalNode?.id).reduce((s, l) => s + l.value, 0);
  const result = data.links.filter(l => l.target === resultNode?.id).reduce((s, l) => s + l.value, 0);
  const totalCosts = totalRevenue - result;
  const resultPct  = totalRevenue !== 0 ? Math.round((result / totalRevenue) * 10000) / 100 : 0;
  return { totalRevenue, totalCosts, result, resultPct, currency: data.currency || 'EUR', unitLabel: data.unit_label || 'T€' };
}

export function formatValue(value, unitLabel = 'T€', decimals = 1) {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value) + ' ' + unitLabel;
}

export function formatPercent(value, decimals = 1) {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value) + ' %';
}

export function resolveNodeColor(node) {
  if (node.group === 'result' && node.value < 0) return GROUP_COLORS_UNFAV['result'];
  return GROUP_COLORS[node.group] || '#505C6D';
}
