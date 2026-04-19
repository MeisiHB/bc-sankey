/**
 * bc-sankey.js
 * Core Sankey diagram logic for bc-sankey
 * Requires D3.js v7 (loaded via CDN in index.html)
 */

'use strict';

// ── Color map per node group ─────────────────────────────────────────────
const GROUP_COLORS = {
  'revenue-2': '#75B5E7',  // BC Blue — sub-sub revenue
  'revenue-1': '#378ADD',  // BC Blue Dark — sub revenue
  'total':     '#00B7C3',  // BC Primary — total revenue
  'cost-1':    '#E89E63',  // BC Orange — cost groups
  'cost-2':    '#C9C472',  // BC Yellow — sub cost groups
  'result':    '#35AB22',  // BC Favorable — EBIT / result
};

const GROUP_COLORS_UNFAV = {
  'result':    '#EB6965',  // BC Unfavorable — loss
};

// ── Utilities ────────────────────────────────────────────────────────────
function formatValue(value, unit, unitLabel, currency) {
  const formatted = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
  return `${formatted} ${unitLabel}`;
}

function formatCurrency(value, currency) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(value * 1000);
}

// ── Main Sankey renderer ─────────────────────────────────────────────────
class BCSankey {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = {
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      nodeWidth: 120,
      nodeHeight: { min: 28, max: 300 },
      nodePadding: 14,
      animDuration: 600,
      ...options,
    };
    this.data = null;
    this.tooltip = document.getElementById('bc-tooltip');
  }

  // Load data from JSON object
  load(data) {
    this.data = data;
    this.render();
    this.updateKPIs();
  }

  // Load data from JSON file
  async loadFile(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    this.load(data);
  }

  // Load data from URL
  async loadUrl(url) {
    const resp = await fetch(url);
    const data = await resp.json();
    this.load(data);
  }

  // ── KPI summary cards ──────────────────────────────────────────────────
  updateKPIs() {
    const d = this.data;
    if (!d) return;

    // Total revenue = sum of links into 'total' group node
    const totalNode = d.nodes.find(n => n.group === 'total');
    const resultNode = d.nodes.find(n => n.group === 'result');
    if (!totalNode || !resultNode) return;

    const totalRevenue = d.links
      .filter(l => l.target === totalNode.id)
      .reduce((s, l) => s + l.value, 0);

    const ebit = d.links
      .filter(l => l.target === resultNode.id)
      .reduce((s, l) => s + l.value, 0);

    const totalCosts = totalRevenue - ebit;
    const ebitPct = totalRevenue > 0 ? (ebit / totalRevenue * 100) : 0;

    const ul = d.unit_label || 'T€';
    const fmt = v => new Intl.NumberFormat('de-DE').format(v) + ' ' + ul;

    const setKPI = (id, value, sub, type) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.querySelector('.bc-kpi__value').textContent = value;
      el.querySelector('.bc-kpi__value').className =
        'bc-kpi__value' + (type === 'pos' ? ' bc-kpi__value--favorable' :
                           type === 'neg' ? ' bc-kpi__value--unfavorable' : '');
      if (sub) el.querySelector('.bc-kpi__sub').textContent = sub;
    };

    setKPI('kpi-revenue',  fmt(totalRevenue), d.period, '');
    setKPI('kpi-costs',    fmt(totalCosts),   'Gesamtkosten', '');
    setKPI('kpi-ebit',     fmt(ebit),
      `${ebitPct.toFixed(1).replace('.', ',')} % vom Umsatz`,
      ebit >= 0 ? 'pos' : 'neg');

    // Update page title
    const titleEl = document.getElementById('diagram-title');
    if (titleEl) titleEl.textContent = d.title || 'Sankey P&L';
  }

  // ── Main render ────────────────────────────────────────────────────────
  render() {
    const container = document.getElementById(this.containerId);
    if (!container || !this.data) return;

    container.innerHTML = '';

    const d = this.data;
    const m = this.options.margin;
    const W = container.clientWidth || 900;
    const H = Math.max(420, Math.min(W * 0.55, 600));
    const iW = W - m.left - m.right;
    const iH = H - m.top - m.bottom;

    // Assign columns by group
    const colMap = {
      'revenue-2': 0,
      'revenue-1': 1,
      'total':     2,
      'cost-1':    3,
      'cost-2':    4,
      'result':    3,
    };

    // Build node map
    const nodeMap = {};
    d.nodes.forEach(n => {
      nodeMap[n.id] = {
        ...n,
        col: colMap[n.group] ?? 2,
        inValue: 0,
        outValue: 0,
        color: GROUP_COLORS[n.group] || '#505C6D',
        inOffset: 0,
        outOffset: 0,
      };
    });

    // Accumulate values
    d.links.forEach(l => {
      if (nodeMap[l.source]) nodeMap[l.source].outValue += l.value;
      if (nodeMap[l.target]) nodeMap[l.target].inValue  += l.value;
    });

    d.nodes.forEach(n => {
      nodeMap[n.id].value = Math.max(
        nodeMap[n.id].inValue,
        nodeMap[n.id].outValue
      );
    });

    // Handle result node specially — if negative, change color
    const resultNode = d.nodes.find(n => n.group === 'result');
    if (resultNode && nodeMap[resultNode.id].value < 0) {
      nodeMap[resultNode.id].color = GROUP_COLORS_UNFAV['result'];
    }

    // Position nodes per column
    const numCols = 5;
    const colX = col => m.left + (col / (numCols - 1)) * iW;
    const nw = this.options.nodeWidth;

    const colGroups = {};
    Object.values(nodeMap).forEach(n => {
      if (!colGroups[n.col]) colGroups[n.col] = [];
      colGroups[n.col].push(n);
    });

    const maxVal = Math.max(...Object.values(nodeMap).map(n => n.value));
    const scale = v => (v / maxVal) * (iH * 0.85);
    const minH = this.options.nodeHeight.min;

    Object.entries(colGroups).forEach(([col, nodes]) => {
      const totalH = nodes.reduce((s, n) => s + Math.max(scale(n.value), minH), 0)
        + this.options.nodePadding * (nodes.length - 1);
      let y = m.top + (iH - totalH) / 2;
      nodes.forEach(n => {
        const h = Math.max(scale(n.value), minH);
        n.x = colX(parseInt(col)) - nw / 2;
        n.y = y;
        n.h = h;
        n.w = nw;
        n.cx = colX(parseInt(col));
        n.cy = y + h / 2;
        y += h + this.options.nodePadding;
      });
    });

    // Create SVG
    const svg = d3.select(`#${this.containerId}`)
      .append('svg')
      .attr('id', 'sankey-svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('width', '100%');

    const defs = svg.append('defs');
    const tooltip = this.tooltip;

    // ── Draw links ──────────────────────────────────────────────────────
    d.links.forEach((lk, i) => {
      const s = nodeMap[lk.source];
      const t = nodeMap[lk.target];
      if (!s || !t) return;

      const lh = Math.max(scale(lk.value), 2);
      const sy = s.y + s.outOffset + lh / 2;
      const ty = t.y + t.inOffset + lh / 2;
      s.outOffset += lh;
      t.inOffset  += lh;

      const gid = `grad-${i}`;
      const grad = defs.append('linearGradient')
        .attr('id', gid)
        .attr('x1', '0%').attr('x2', '100%');
      grad.append('stop').attr('offset', '0%')
        .attr('stop-color', s.color).attr('stop-opacity', 0.55);
      grad.append('stop').attr('offset', '100%')
        .attr('stop-color', t.color).attr('stop-opacity', 0.55);

      const x1 = s.cx + nw / 2;
      const x2 = t.cx - nw / 2;
      const cp = (x1 + x2) / 2;

      const path = svg.append('path')
        .attr('class', 'sankey-link')
        .attr('fill', `url(#${gid})`)
        .attr('d', `
          M${x1},${sy - lh / 2}
          C${cp},${sy - lh / 2} ${cp},${ty - lh / 2} ${x2},${ty - lh / 2}
          L${x2},${ty + lh / 2}
          C${cp},${ty + lh / 2} ${cp},${sy + lh / 2} ${x1},${sy + lh / 2}
          Z
        `);

      path.on('mouseenter', (event) => {
        const ul = d.unit_label || 'T€';
        const val = new Intl.NumberFormat('de-DE').format(lk.value);
        tooltip.innerHTML = `
          <div class="bc-tooltip__title">${s.label} → ${t.label}</div>
          ${val} ${ul}
        `;
        tooltip.classList.add('visible');
      });
      path.on('mousemove', (event) => {
        tooltip.style.left = (event.clientX + 14) + 'px';
        tooltip.style.top  = (event.clientY - 10) + 'px';
      });
      path.on('mouseleave', () => tooltip.classList.remove('visible'));
    });

    // ── Draw nodes ──────────────────────────────────────────────────────
    Object.values(nodeMap).forEach(n => {
      const g = svg.append('g').attr('class', 'sankey-node');

      g.append('rect')
        .attr('x', n.x).attr('y', n.y)
        .attr('width', n.w).attr('height', n.h)
        .attr('rx', 4).attr('fill', n.color).attr('opacity', 0.93);

      // Label — truncate if needed
      const maxLen = 15;
      const label = n.label.length > maxLen ? n.label.slice(0, maxLen) + '…' : n.label;
      const ul = d.unit_label || 'T€';
      const valStr = new Intl.NumberFormat('de-DE').format(n.value) + ' ' + ul;

      const midY = n.y + n.h / 2;
      const fontSize = n.h < 38 ? 9 : 11;

      if (n.h >= 26) {
        g.append('text')
          .attr('x', n.cx).attr('y', midY - (n.h >= 38 ? 6 : 0))
          .attr('text-anchor', 'middle')
          .attr('font-size', fontSize + 'px')
          .attr('font-weight', '600')
          .attr('font-family', '"Segoe UI", Tahoma, sans-serif')
          .attr('fill', '#fff')
          .text(label);
      }

      if (n.h >= 38) {
        g.append('text')
          .attr('x', n.cx).attr('y', midY + 9)
          .attr('text-anchor', 'middle')
          .attr('font-size', '9px')
          .attr('font-family', '"Segoe UI", Tahoma, sans-serif')
          .attr('fill', 'rgba(255,255,255,0.85)')
          .text(valStr);
      }

      // Tooltip on node
      g.on('mouseenter', (event) => {
        const pct = n.group !== 'total'
          ? (() => {
              const total = Object.values(nodeMap).find(x => x.group === 'total');
              return total ? ` (${(n.value / total.value * 100).toFixed(1).replace('.', ',')} %)` : '';
            })()
          : '';
        tooltip.innerHTML = `
          <div class="bc-tooltip__title">${n.label}</div>
          ${new Intl.NumberFormat('de-DE').format(n.value)} ${d.unit_label || 'T€'}${pct}
        `;
        tooltip.classList.add('visible');
      });
      g.on('mousemove', (event) => {
        tooltip.style.left = (event.clientX + 14) + 'px';
        tooltip.style.top  = (event.clientY - 10) + 'px';
      });
      g.on('mouseleave', () => tooltip.classList.remove('visible'));
    });
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const sankey = new BCSankey('sankey-container');
  window.bcSankey = sankey;

  // Load sample data on start
  sankey.loadUrl('./data/sample.json').catch(() => {
    console.warn('Could not load sample.json — use file upload instead.');
  });

  // File upload handler
  const fileInput = document.getElementById('file-input');
  const uploadBtn = document.getElementById('upload-btn');
  const dropZone  = document.getElementById('drop-zone');

  if (uploadBtn) uploadBtn.addEventListener('click', () => fileInput?.click());

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) sankey.loadFile(file);
    });
  }

  // Drag & drop
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--bc-primary)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.json')) sankey.loadFile(file);
    });
  }

  // Resize handler
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (sankey.data) sankey.render();
    }, 250);
  });
});
