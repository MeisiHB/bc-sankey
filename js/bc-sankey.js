/**
 * bc-sankey.js  v1.1  — fixed clipping + 3D ribbon flows
 */
'use strict';

const GROUP_COLORS = {
  'revenue-2': '#75B5E7',
  'revenue-1': '#378ADD',
  'total':     '#00B7C3',
  'cost-1':    '#E89E63',
  'cost-2':    '#C9C472',
  'result':    '#35AB22',
};
const GROUP_COLORS_UNFAV = { 'result': '#EB6965' };
const GROUP_COLUMNS = { 'revenue-2':0,'revenue-1':1,'total':2,'cost-1':3,'cost-2':4,'result':3 };

// ── Utilities ────────────────────────────────────────────────────────────
function fmt(v, ul) {
  ul = ul || 'T\u20AC';
  return new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(v) + ' ' + ul;
}

// ── BCSankey class ───────────────────────────────────────────────────────
class BCSankey {
  constructor(containerId) {
    this.containerId = containerId;
    this.data = null;
    this.tooltip = document.getElementById('bc-tooltip');
  }

  load(data) { this.data = data; this.render(); this.updateKPIs(); }

  async loadFile(file) {
    const text = await file.text();
    this.load(JSON.parse(text));
  }

  async loadUrl(url) {
    const resp = await fetch(url);
    this.load(await resp.json());
  }

  updateKPIs() {
    const d = this.data;
    if (!d) return;
    const totalNode  = d.nodes.find(n => n.group === 'total');
    const resultNode = d.nodes.find(n => n.group === 'result');
    const totalRevenue = d.links.filter(l => l.target === totalNode.id).reduce((s,l) => s+l.value, 0);
    const result       = d.links.filter(l => l.target === resultNode.id).reduce((s,l) => s+l.value, 0);
    const totalCosts   = totalRevenue - result;
    const resultPct    = totalRevenue !== 0 ? Math.round((result/totalRevenue)*10000)/100 : 0;
    const ul = d.unit_label || 'T\u20AC';
    const set = (id, val, sub, type) => {
      const el = document.getElementById(id); if (!el) return;
      el.querySelector('.bc-kpi__value').textContent = val;
      el.querySelector('.bc-kpi__value').className = 'bc-kpi__value' +
        (type==='pos' ? ' bc-kpi__value--favorable' : type==='neg' ? ' bc-kpi__value--unfavorable' : '');
      if (sub) el.querySelector('.bc-kpi__sub').textContent = sub;
    };
    set('kpi-revenue', fmt(totalRevenue,ul), d.period, '');
    set('kpi-costs',   fmt(totalCosts,ul),   'Gesamtkosten', '');
    set('kpi-ebit',    fmt(result,ul), resultPct.toFixed(1).replace('.',',') + ' % vom Umsatz', result>=0?'pos':'neg');
    const t = document.getElementById('diagram-title');
    if (t) t.textContent = d.title || 'Sankey P&L';
  }

  render() {
    const container = document.getElementById(this.containerId);
    if (!container || !this.data) return;
    container.innerHTML = '';
    const d = this.data;

    // ── Dimensionen ──────────────────────────────────────────────────────
    const W   = container.clientWidth || 960;
    const H   = Math.max(440, Math.min(W * 0.58, 620));
    const nw  = 114;          // Knotenbreite
    const pad = 10;           // kleiner Rand zum SVG-Rand
    const mt  = 24; const mb = 24;   // vertikaler Rand
    const iH  = H - mt - mb;
    const numCols = 5;
    // FIX 1: Spalten-X so berechnen dass halbe Knotenbreite immer ins SVG passt
    const usableW = W - 2 * pad - nw;   // verfügbare Breite nach Abzug der Knoten-Halbbreiten
    const colX = col => pad + nw/2 + (col / (numCols-1)) * usableW;

    // ── Knoten-Map aufbauen ───────────────────────────────────────────────
    const nodeMap = {};
    d.nodes.forEach(n => {
      nodeMap[n.id] = { ...n,
        col:   GROUP_COLUMNS[n.group] ?? 2,
        color: GROUP_COLORS[n.group] || '#505C6D',
        inValue:0, outValue:0, inOffset:0, outOffset:0
      };
    });
    d.links.forEach(l => {
      if (nodeMap[l.source]) nodeMap[l.source].outValue += l.value;
      if (nodeMap[l.target]) nodeMap[l.target].inValue  += l.value;
    });
    Object.values(nodeMap).forEach(n => {
      n.value = Math.max(n.inValue, n.outValue);
      if (n.group === 'result' && n.value < 0) n.color = GROUP_COLORS_UNFAV['result'];
    });

    // ── Knotenpositionierung ─────────────────────────────────────────────
    const maxVal  = Math.max(...Object.values(nodeMap).map(n => n.value));
    const scale   = v => (v / maxVal) * iH * 0.82;
    const minH    = 26;
    const nodeGap = 12;
    const colGroups = {};
    Object.values(nodeMap).forEach(n => {
      if (!colGroups[n.col]) colGroups[n.col] = [];
      colGroups[n.col].push(n);
    });
    Object.entries(colGroups).forEach(([col, nodes]) => {
      const totalH = nodes.reduce((s,n) => s + Math.max(scale(n.value),minH), 0)
        + nodeGap * (nodes.length - 1);
      let y = mt + (iH - totalH) / 2;
      nodes.forEach(n => {
        const h = Math.max(scale(n.value), minH);
        n.x  = colX(parseInt(col)) - nw/2;
        n.y  = y;
        n.h  = h;
        n.cx = colX(parseInt(col));
        n.cy = y + h/2;
        y += h + nodeGap;
      });
    });

    // ── SVG erstellen ────────────────────────────────────────────────────
    const svg = d3.select('#' + this.containerId)
      .append('svg')
      .attr('id','sankey-svg')
      .attr('viewBox','0 0 ' + W + ' ' + H)
      .attr('width','100%');

    const defs = svg.append('defs');

    // Schatten-Filter für 3D-Tiefenwirkung
    const shadowId = 'ribbon-shadow';
    const filt = defs.append('filter')
      .attr('id', shadowId)
      .attr('x','-5%').attr('y','-5%')
      .attr('width','110%').attr('height','110%');
    filt.append('feDropShadow')
      .attr('dx','0').attr('dy','1')
      .attr('stdDeviation','2')
      .attr('flood-color','rgba(0,0,0,0.18)');

    const tooltip = this.tooltip;

    // ── FIX 2: Sankey-Bänder als 3D-Ribbons ─────────────────────────────
    d.links.forEach((lk, i) => {
      const s = nodeMap[lk.source];
      const t = nodeMap[lk.target];
      if (!s || !t) return;

      const lh = Math.max(scale(lk.value), 2);

      // Vertikale Start-/Endpositionen am Knoten-Rand
      const sy0 = s.y + s.outOffset;          // Oberkante am Quellknoten
      const sy1 = sy0 + lh;                   // Unterkante am Quellknoten
      const ty0 = t.y + t.inOffset;           // Oberkante am Zielknoten
      const ty1 = ty0 + lh;                   // Unterkante am Zielknoten
      s.outOffset += lh;
      t.inOffset  += lh;

      // X-Koordinaten: rechter Rand des Quell-, linker Rand des Zielknotens
      const x1 = s.cx + nw/2;
      const x2 = t.cx - nw/2;
      const cp = (x1 + x2) / 2;   // Kontrollpunkt in der Mitte

      // Ribbon-Pfad: obere Kurve + rechte Kante + untere Kurve (zurück) + linke Kante
      const path =
        'M' + x1 + ',' + sy0 +
        ' C' + cp + ',' + sy0 + ' ' + cp + ',' + ty0 + ' ' + x2 + ',' + ty0 +
        ' L' + x2 + ',' + ty1 +
        ' C' + cp + ',' + ty1 + ' ' + cp + ',' + sy1 + ' ' + x1 + ',' + sy1 +
        ' Z';

      // Vertikaler Gradient für 3D-Tiefenwirkung (heller oben, dunkler unten)
      const gid = 'g' + i;
      const grad = defs.append('linearGradient')
        .attr('id', gid)
        .attr('x1','0%').attr('x2','100%');
      grad.append('stop').attr('offset','0%')
        .attr('stop-color', s.color).attr('stop-opacity', 0.72);
      grad.append('stop').attr('offset','50%')
        .attr('stop-color', mixColors(s.color, t.color)).attr('stop-opacity', 0.58);
      grad.append('stop').attr('offset','100%')
        .attr('stop-color', t.color).attr('stop-opacity', 0.72);

      // Inneres Highlight-Gradient für 3D-Glanz (von oben nach unten)
      const hid = 'h' + i;
      const hgrad = defs.append('linearGradient')
        .attr('id', hid)
        .attr('x1','0%').attr('x2','0%').attr('y1','0%').attr('y2','100%');
      hgrad.append('stop').attr('offset','0%').attr('stop-color','#fff').attr('stop-opacity',0.22);
      hgrad.append('stop').attr('offset','40%').attr('stop-color','#fff').attr('stop-opacity',0.0);
      hgrad.append('stop').attr('offset','100%').attr('stop-color','#000').attr('stop-opacity',0.12);

      // Haupt-Ribbon (Farbe)
      const ribbon = svg.append('path')
        .attr('d', path)
        .attr('fill', 'url(#' + gid + ')')
        .attr('stroke', 'none')
        .style('filter','url(#' + shadowId + ')');

      // Glanz-Overlay (3D-Effekt)
      svg.append('path')
        .attr('d', path)
        .attr('fill', 'url(#' + hid + ')')
        .attr('stroke', 'none')
        .style('pointer-events','none');

      // Tooltip
      ribbon.on('mouseenter', function(event) {
        d3.select(this).style('filter','none').attr('fill', 'url(#' + gid + ')');
        tooltip.innerHTML = '<div class="bc-tooltip__title">' + s.label + ' \u2192 ' + t.label + '</div>' +
          fmt(lk.value, d.unit_label);
        tooltip.classList.add('visible');
      });
      ribbon.on('mousemove', function(event) {
        tooltip.style.left = (event.clientX+14)+'px';
        tooltip.style.top  = (event.clientY-10)+'px';
      });
      ribbon.on('mouseleave', function() {
        d3.select(this).style('filter','url(#' + shadowId + ')');
        tooltip.classList.remove('visible');
      });
    });

    // ── Knoten zeichnen ───────────────────────────────────────────────────
    Object.values(nodeMap).forEach(n => {
      const g = svg.append('g');

      // Knoten-Rechteck mit abgerundeten Ecken
      g.append('rect')
        .attr('x',n.x).attr('y',n.y).attr('width',nw).attr('height',n.h)
        .attr('rx',5)
        .attr('fill',n.color)
        .attr('opacity',0.94);

      // Highlight (obere helle Kante für 3D-Optik)
      g.append('rect')
        .attr('x',n.x).attr('y',n.y).attr('width',nw).attr('height',Math.min(4,n.h))
        .attr('rx',5)
        .attr('fill','rgba(255,255,255,0.30)')
        .style('pointer-events','none');

      const mx = n.cx;
      const my = n.y + n.h/2;
      const fs = n.h < 40 ? 9 : 11;
      const lbl = n.label.length > 14 ? n.label.slice(0,13)+'\u2026' : n.label;

      if (n.h >= 26) {
        g.append('text').attr('x',mx).attr('y', n.h>=42 ? my-7 : my+4)
          .attr('text-anchor','middle').attr('font-size',fs+'px')
          .attr('font-weight','600').attr('font-family','"Segoe UI",Tahoma,sans-serif')
          .attr('fill','#fff').text(lbl);
      }
      if (n.h >= 42) {
        g.append('text').attr('x',mx).attr('y',my+9)
          .attr('text-anchor','middle').attr('font-size','9px')
          .attr('font-family','"Segoe UI",Tahoma,sans-serif')
          .attr('fill','rgba(255,255,255,0.88)')
          .text(fmt(n.value, d.unit_label));
      }

      // Tooltip am Knoten
      g.style('cursor','pointer')
        .on('mouseenter', function(event) {
          const total = Object.values(nodeMap).find(x => x.group==='total');
          const pct = total && total.value ? ' (' + (n.value/total.value*100).toFixed(1).replace('.',',') + ' %)' : '';
          tooltip.innerHTML = '<div class="bc-tooltip__title">' + n.label + '</div>' +
            fmt(n.value, d.unit_label) + pct;
          tooltip.classList.add('visible');
        })
        .on('mousemove', function(event) {
          tooltip.style.left=(event.clientX+14)+'px'; tooltip.style.top=(event.clientY-10)+'px';
        })
        .on('mouseleave', () => tooltip.classList.remove('visible'));
    });
  }
}

// ── Farb-Misch-Hilfsfunktion ──────────────────────────────────────────────
function mixColors(hex1, hex2) {
  const p = c => [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
  const a = p(hex1); const b = p(hex2);
  const m = a.map((v,i) => Math.round((v+b[i])/2));
  return '#' + m.map(v => v.toString(16).padStart(2,'0')).join('');
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const sankey = new BCSankey('sankey-container');
  window.bcSankey = sankey;

  sankey.loadUrl('./data/sample.json').catch(() => {
    console.warn('sample.json not found — use file upload');
  });

  const fileInput = document.getElementById('file-input');
  const uploadBtn = document.getElementById('upload-btn');
  if (uploadBtn) uploadBtn.addEventListener('click', () => fileInput && fileInput.click());
  if (fileInput) fileInput.addEventListener('change', e => {
    const f = e.target.files[0]; if (f) sankey.loadFile(f);
  });

  const dropZone = document.getElementById('drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor='var(--bc-primary)'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor=''; });
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.style.borderColor='';
      const f = e.dataTransfer.files[0];
      if (f && f.name.endsWith('.json')) sankey.loadFile(f);
    });
  }

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if(sankey.data) sankey.render(); }, 250); });
});
