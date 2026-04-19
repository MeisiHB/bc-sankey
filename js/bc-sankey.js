/**
 * bc-sankey.js  v1.2  — flush ribbon connections with rounded nodes
 *
 * Lösung für bündige Anschlüsse:
 * Ribbons werden 6px in die Knoten hinein verlängert (overlap).
 * Da Knoten nach Ribbons gezeichnet werden, decken sie den Überlapp ab.
 * Ergebnis: bündige Verbindung + abgerundete Außenkanten bleiben erhalten.
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
const GROUP_COLUMNS = {
  'revenue-2':0,'revenue-1':1,'total':2,'cost-1':3,'cost-2':4,'result':3
};

function fmt(v, ul) {
  ul = ul || 'T\u20AC';
  return new Intl.NumberFormat('de-DE',{
    minimumFractionDigits:1, maximumFractionDigits:1
  }).format(v) + ' ' + ul;
}

function mixColors(hex1, hex2) {
  const p = c => [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
  const a = p(hex1), b = p(hex2);
  return '#' + a.map((v,i) => Math.round((v+b[i])/2).toString(16).padStart(2,'0')).join('');
}

class BCSankey {
  constructor(containerId) {
    this.containerId = containerId;
    this.data = null;
    this.tooltip = document.getElementById('bc-tooltip');
  }

  load(data) { this.data = data; this.render(); this.updateKPIs(); }

  async loadFile(file) {
    this.load(JSON.parse(await file.text()));
  }

  async loadUrl(url) {
    this.load(await (await fetch(url)).json());
  }

  updateKPIs() {
    const d = this.data;
    if (!d) return;
    const tn = d.nodes.find(n => n.group === 'total');
    const rn = d.nodes.find(n => n.group === 'result');
    const rev   = d.links.filter(l => l.target === tn.id).reduce((s,l)=>s+l.value,0);
    const res   = d.links.filter(l => l.target === rn.id).reduce((s,l)=>s+l.value,0);
    const costs = rev - res;
    const pct   = rev !== 0 ? Math.round((res/rev)*10000)/100 : 0;
    const ul = d.unit_label || 'T\u20AC';
    const set = (id, val, sub, type) => {
      const el = document.getElementById(id); if (!el) return;
      el.querySelector('.bc-kpi__value').textContent = val;
      el.querySelector('.bc-kpi__value').className = 'bc-kpi__value' +
        (type==='pos'?' bc-kpi__value--favorable':type==='neg'?' bc-kpi__value--unfavorable':'');
      if (sub) el.querySelector('.bc-kpi__sub').textContent = sub;
    };
    set('kpi-revenue', fmt(rev,ul),   d.period,'');
    set('kpi-costs',   fmt(costs,ul), 'Gesamtkosten','');
    set('kpi-ebit',    fmt(res,ul),
      pct.toFixed(1).replace('.',',') + ' % vom Umsatz', res>=0?'pos':'neg');
    const t = document.getElementById('diagram-title');
    if (t) t.textContent = d.title || 'Sankey P&L';
  }

  render() {
    const container = document.getElementById(this.containerId);
    if (!container || !this.data) return;
    container.innerHTML = '';
    const d = this.data;

    // ── Dimensionen ──────────────────────────────────────────────────────
    const W      = container.clientWidth || 960;
    const H      = Math.max(440, Math.min(W * 0.58, 620));
    const nw     = 114;   // Knotenbreite
    const nr     = 5;     // border-radius der Knoten
    const ovlap  = nr + 2; // Ribbon-Überlapp in Knoten (muss >= nr sein für bündigen Anschluss)
    const pad    = 10;   // Rand zum SVG-Rand
    const mt = 24, mb = 24;
    const iH     = H - mt - mb;
    const numCols = 5;
    const usableW = W - 2*pad - nw;
    const colX = col => pad + nw/2 + (col/(numCols-1)) * usableW;

    // ── Knoten-Map ────────────────────────────────────────────────────────
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
    const maxVal  = Math.max(...Object.values(nodeMap).map(n=>n.value));
    const scale   = v => (v/maxVal) * iH * 0.82;
    const minH    = 26;
    const nodeGap = 12;
    const colGroups = {};
    Object.values(nodeMap).forEach(n => {
      if (!colGroups[n.col]) colGroups[n.col] = [];
      colGroups[n.col].push(n);
    });
    Object.entries(colGroups).forEach(([col, nodes]) => {
      const totalH = nodes.reduce((s,n)=>s+Math.max(scale(n.value),minH),0) + nodeGap*(nodes.length-1);
      let y = mt + (iH-totalH)/2;
      nodes.forEach(n => {
        const h = Math.max(scale(n.value), minH);
        n.x  = colX(parseInt(col)) - nw/2;
        n.y  = y; n.h = h;
        n.cx = colX(parseInt(col));
        n.cy = y + h/2;
        y += h + nodeGap;
      });
    });

    // ── SVG ───────────────────────────────────────────────────────────────
    const svg = d3.select('#'+this.containerId)
      .append('svg')
      .attr('id','sankey-svg')
      .attr('viewBox','0 0 '+W+' '+H)
      .attr('width','100%');

    const defs = svg.append('defs');

    // Schatten-Filter für Tiefenwirkung
    const filt = defs.append('filter').attr('id','rshadow')
      .attr('x','-5%').attr('y','-5%').attr('width','110%').attr('height','110%');
    filt.append('feDropShadow')
      .attr('dx','0').attr('dy','1').attr('stdDeviation','2')
      .attr('flood-color','rgba(0,0,0,0.16)');

    const tooltip = this.tooltip;

    // ── RIBBONS (vor Knoten gezeichnet) ───────────────────────────────────
    // KERN-FIX: x1 und x2 ragen ovlap px in die Knoten hinein.
    // Die danach gezeichneten Knoten-Rechtecke decken diesen Überlapp ab →
    // sauberer bündiger Anschluss, abgerundete Außenkanten bleiben erhalten.

    d.links.forEach((lk, i) => {
      const s = nodeMap[lk.source];
      const t = nodeMap[lk.target];
      if (!s || !t) return;

      const lh  = Math.max(scale(lk.value), 2);
      const sy0 = s.y + s.outOffset;
      const sy1 = sy0 + lh;
      const ty0 = t.y + t.inOffset;
      const ty1 = ty0 + lh;
      s.outOffset += lh;
      t.inOffset  += lh;

      // X mit Überlapp — Ribbon reicht ovlap px in den Knoten hinein
      const x1 = s.cx + nw/2 + ovlap;   // hinter rechtem Rand des Quellknotens
      const x2 = t.cx - nw/2 - ovlap;   // hinter linkem Rand des Zielknotens
      const cp = (x1 + x2) / 2;

      // Ribbon-Pfad (geschlossene Kurve)
      const path =
        'M'+x1+','+sy0+
        ' C'+cp+','+sy0+' '+cp+','+ty0+' '+x2+','+ty0+
        ' L'+x2+','+ty1+
        ' C'+cp+','+ty1+' '+cp+','+sy1+' '+x1+','+sy1+
        ' Z';

      // Horizontaler Farb-Gradient (Quell → Ziel)
      const gid = 'g'+i;
      const gr = defs.append('linearGradient').attr('id',gid)
        .attr('x1','0%').attr('x2','100%');
      gr.append('stop').attr('offset','0%').attr('stop-color',s.color).attr('stop-opacity',0.72);
      gr.append('stop').attr('offset','50%').attr('stop-color',mixColors(s.color,t.color)).attr('stop-opacity',0.58);
      gr.append('stop').attr('offset','100%').attr('stop-color',t.color).attr('stop-opacity',0.72);

      // Vertikaler Glanz-Gradient (3D-Effekt, oben hell → unten dunkel)
      const hid = 'h'+i;
      const hg = defs.append('linearGradient').attr('id',hid)
        .attr('x1','0%').attr('x2','0%').attr('y1','0%').attr('y2','100%');
      hg.append('stop').attr('offset','0%').attr('stop-color','#fff').attr('stop-opacity',0.22);
      hg.append('stop').attr('offset','45%').attr('stop-color','#fff').attr('stop-opacity',0.0);
      hg.append('stop').attr('offset','100%').attr('stop-color','#000').attr('stop-opacity',0.11);

      // Haupt-Ribbon
      const ribbon = svg.append('path').attr('d',path)
        .attr('fill','url(#'+gid+')')
        .attr('stroke','none')
        .style('filter','url(#rshadow)');

      // Glanz-Overlay
      svg.append('path').attr('d',path)
        .attr('fill','url(#'+hid+')')
        .attr('stroke','none')
        .style('pointer-events','none');

      // Tooltip
      ribbon
        .on('mouseenter', function(ev) {
          d3.select(this).style('filter','none');
          tooltip.innerHTML =
            '<div class="bc-tooltip__title">'+s.label+' \u2192 '+t.label+'</div>'+
            fmt(lk.value, d.unit_label);
          tooltip.classList.add('visible');
        })
        .on('mousemove', ev => {
          tooltip.style.left=(ev.clientX+14)+'px';
          tooltip.style.top =(ev.clientY-10)+'px';
        })
        .on('mouseleave', function() {
          d3.select(this).style('filter','url(#rshadow)');
          tooltip.classList.remove('visible');
        });
    });

    // ── KNOTEN (nach Ribbons — decken Überlapp ab) ────────────────────────
    Object.values(nodeMap).forEach(n => {
      const g = svg.append('g').style('cursor','pointer');

      // Haupt-Rechteck (abgerundete Ecken — nur außen sichtbar, Innenseite unter Ribbon)
      g.append('rect')
        .attr('x',n.x).attr('y',n.y).attr('width',nw).attr('height',n.h)
        .attr('rx',nr)
        .attr('fill',n.color)
        .attr('opacity',0.95);

      // Heller Streifen oben für 3D-Plastik-Optik
      g.append('rect')
        .attr('x',n.x).attr('y',n.y).attr('width',nw).attr('height',Math.min(5,n.h))
        .attr('rx',nr)
        .attr('fill','rgba(255,255,255,0.28)')
        .style('pointer-events','none');

      // Labels
      const mx = n.cx, my = n.y + n.h/2;
      const fs = n.h < 40 ? 9 : 11;
      const lbl = n.label.length > 14 ? n.label.slice(0,13)+'\u2026' : n.label;

      if (n.h >= 26) {
        g.append('text')
          .attr('x',mx).attr('y', n.h>=42 ? my-7 : my+4)
          .attr('text-anchor','middle').attr('font-size',fs+'px')
          .attr('font-weight','600')
          .attr('font-family','"Segoe UI",Tahoma,sans-serif')
          .attr('fill','#fff').text(lbl);
      }
      if (n.h >= 42) {
        g.append('text')
          .attr('x',mx).attr('y',my+9)
          .attr('text-anchor','middle').attr('font-size','9px')
          .attr('font-family','"Segoe UI",Tahoma,sans-serif')
          .attr('fill','rgba(255,255,255,0.88)')
          .text(fmt(n.value, d.unit_label));
      }

      // Tooltip
      g.on('mouseenter', function(ev) {
          const tn2 = Object.values(nodeMap).find(x=>x.group==='total');
          const pct = tn2&&tn2.value
            ? ' (' + (n.value/tn2.value*100).toFixed(1).replace('.',',') + ' %)'
            : '';
          tooltip.innerHTML =
            '<div class="bc-tooltip__title">'+n.label+'</div>'+
            fmt(n.value, d.unit_label)+pct;
          tooltip.classList.add('visible');
        })
        .on('mousemove', ev => {
          tooltip.style.left=(ev.clientX+14)+'px';
          tooltip.style.top =(ev.clientY-10)+'px';
        })
        .on('mouseleave', () => tooltip.classList.remove('visible'));
    });
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const sankey = new BCSankey('sankey-container');
  window.bcSankey = sankey;

  sankey.loadUrl('./data/sample.json')
    .catch(() => console.warn('sample.json not found — use file upload'));

  const fi = document.getElementById('file-input');
  const ub = document.getElementById('upload-btn');
  if (ub) ub.addEventListener('click', () => fi && fi.click());
  if (fi) fi.addEventListener('change', e => {
    const f = e.target.files[0]; if (f) sankey.loadFile(f);
  });

  const dz = document.getElementById('drop-zone');
  if (dz) {
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.style.borderColor='var(--bc-primary)'; });
    dz.addEventListener('dragleave', () => { dz.style.borderColor=''; });
    dz.addEventListener('drop',      e => {
      e.preventDefault(); dz.style.borderColor='';
      const f = e.dataTransfer.files[0];
      if (f && f.name.endsWith('.json')) sankey.loadFile(f);
    });
  }

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (sankey.data) sankey.render(); }, 250);
  });
});
