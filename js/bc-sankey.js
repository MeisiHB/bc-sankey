/**
 * bc-sankey.js  v2.0  — time series animation
 */
'use strict';

const GROUP_COLORS = {
  'revenue-2': '#75B5E7','revenue-1': '#378ADD','total': '#00B7C3',
  'cost-1': '#E89E63','cost-2': '#C9C472','result': '#35AB22',
};
const GROUP_COLORS_UNFAV = { 'result': '#EB6965' };
const GROUP_COLUMNS = {
  'revenue-2':0,'revenue-1':1,'total':2,'cost-1':3,'cost-2':4,'result':3
};

function fmt(v, ul) {
  ul = ul || 'T\u20AC';
  return new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(v)+'\u00A0'+ul;
}
function mixColors(hex1, hex2) {
  const p = c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
  const a=p(hex1),b=p(hex2);
  return '#'+a.map((v,i)=>Math.round((v+b[i])/2).toString(16).padStart(2,'0')).join('');
}

class BCSankey {
  constructor(containerId) {
    this.containerId = containerId;
    this.multiData   = null;
    this.interval    = 'month';
    this.periods     = [];
    this.currentIdx  = 0;
    this.animTimer   = null;
    this.animSpeed   = 1200;
    this.tooltip     = document.getElementById('bc-tooltip');
    this._fading     = false;
  }

  async loadFile(file) { this._init(JSON.parse(await file.text())); }

  async loadUrl(url) { this._init(await (await fetch(url)).json()); }

  _init(data) {
    if (data.periods) {
      this.multiData = data;
    } else {
      this.multiData = { ...data, periods: [{ label: data.title||'P&L', date:'', links: data.links }] };
    }
    const bar = document.getElementById('bc-anim-bar');
    if (bar) bar.style.display = 'flex';
    this._bindControls();
    this._setInterval('month');
  }

  _setInterval(interval) {
    this.stop();
    this.interval = interval;
    this.periods  = this._computePeriods(interval);
    this._populateSelectors();
    this._gotoIdx(0, false);
  }

  _computePeriods(interval) {
    const raw = this.multiData.periods;
    if (interval === 'month') return raw.map((p,i)=>({label:p.label,date:p.date,indices:[i]}));
    if (interval === 'quarter') {
      const out=[];
      for (let i=0;i<raw.length;i+=3) {
        const sl=raw.slice(i,i+3); if(!sl.length) break;
        const yr=sl[0].date.split('-')[0], q=Math.floor(i/3)%4+1;
        out.push({label:'Q'+q+'\u00A0'+yr,date:yr+'-Q'+q,indices:sl.map((_,j)=>i+j)});
      }
      return out;
    }
    if (interval === 'year') {
      const out=[];
      for (let i=0;i<raw.length;i+=12) {
        const sl=raw.slice(i,i+12); if(!sl.length) break;
        const yr=sl[0].date.split('-')[0];
        out.push({label:yr,date:yr,indices:sl.map((_,j)=>i+j)});
      }
      return out;
    }
    return [];
  }

  _populateSelectors() {
    const fs=document.getElementById('sel-from'), ts=document.getElementById('sel-to');
    if(!fs||!ts) return;
    fs.innerHTML=''; ts.innerHTML='';
    this.periods.forEach((p,i)=>{ fs.add(new Option(p.label,i)); ts.add(new Option(p.label,i)); });
    ts.selectedIndex = this.periods.length-1;
    fs.onchange = ()=>{ if(parseInt(fs.value)>parseInt(ts.value)) ts.value=fs.value; this._gotoIdx(parseInt(fs.value),false); };
    ts.onchange = ()=>{ if(parseInt(ts.value)<parseInt(fs.value)) fs.value=ts.value; };
  }

  _bindControls() {
    document.querySelectorAll('[data-interval]').forEach(btn => {
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('[data-interval]').forEach(b=>b.classList.remove('bc-btn--active'));
        btn.classList.add('bc-btn--active');
        this._setInterval(btn.dataset.interval);
      });
    });
    const pb=document.getElementById('btn-play'), sb=document.getElementById('btn-stop');
    if(pb) pb.addEventListener('click',()=>this.play());
    if(sb) sb.addEventListener('click',()=>this.stop());
  }

  _aggregateLinks(indices) {
    const raw=this.multiData.periods;
    if(indices.length===1) return raw[indices[0]].links;
    const result=JSON.parse(JSON.stringify(raw[indices[0]].links));
    for(let i=1;i<indices.length;i++) raw[indices[i]].links.forEach((lk,j)=>{ result[j].value+=lk.value; });
    return result;
  }

  _gotoIdx(idx, crossfade) {
    this.currentIdx = idx;
    const period = this.periods[idx]; if(!period) return;
    const links = this._aggregateLinks(period.indices);
    const disp  = document.getElementById('anim-period');
    if(disp) disp.textContent = period.label;
    const fs = document.getElementById('sel-from');
    if(fs && !this.animTimer) fs.value = idx;
    const d = this.multiData;
    const suffix = this.interval==='month' ? '' : this.interval==='quarter' ? ' (Quartal)' : ' (Jahr)';
    const ptitle = period.label + suffix;
    this._updateKPIs(links, d, ptitle);
    if(crossfade) this._crossfade(links, ptitle); else this._render(links, ptitle);
  }

  _crossfade(links, title) {
    if(this._fading) return;
    const c=document.getElementById(this.containerId); if(!c) return;
    this._fading=true;
    c.style.transition='opacity 200ms ease'; c.style.opacity='0';
    setTimeout(()=>{ this._render(links,title); c.style.opacity='1'; setTimeout(()=>{ this._fading=false; },220); },210);
  }

  play() {
    if(this.animTimer) return;
    const fs=document.getElementById('sel-from'), ts=document.getElementById('sel-to');
    const start=fs?parseInt(fs.value):0, end=ts?parseInt(ts.value):this.periods.length-1;
    const pb=document.getElementById('btn-play'), sb=document.getElementById('btn-stop');
    if(pb) pb.disabled=true; if(sb) sb.disabled=false;
    if(this.currentIdx<start||this.currentIdx>=end) this._gotoIdx(start,false);
    this.animTimer=setInterval(()=>{
      const ts2=document.getElementById('sel-to'), endNow=ts2?parseInt(ts2.value):end;
      const next=this.currentIdx+1;
      if(next>endNow){ this.stop(); return; }
      this._gotoIdx(next,true);
    }, this.animSpeed);
  }

  stop() {
    if(this.animTimer){ clearInterval(this.animTimer); this.animTimer=null; }
    const pb=document.getElementById('btn-play'), sb=document.getElementById('btn-stop');
    if(pb) pb.disabled=false; if(sb) sb.disabled=true;
  }

  _updateKPIs(links, d, periodTitle) {
    const tn=d.nodes.find(n=>n.group==='total'), rn=d.nodes.find(n=>n.group==='result');
    const rev=links.filter(l=>l.target===tn.id).reduce((s,l)=>s+l.value,0);
    const res=links.filter(l=>l.target===rn.id).reduce((s,l)=>s+l.value,0);
    const cst=rev-res, pct=rev?Math.round((res/rev)*10000)/100:0, ul=d.unit_label||'T\u20AC';
    const set=(id,val,sub,type)=>{
      const el=document.getElementById(id); if(!el) return;
      el.querySelector('.bc-kpi__value').textContent=val;
      el.querySelector('.bc-kpi__value').className='bc-kpi__value'+(type==='pos'?' bc-kpi__value--favorable':type==='neg'?' bc-kpi__value--unfavorable':'');
      const s=el.querySelector('.bc-kpi__sub'); if(s) s.textContent=sub;
    };
    set('kpi-revenue',fmt(rev,ul),periodTitle,'');
    set('kpi-costs',fmt(cst,ul),'Gesamtkosten','');
    set('kpi-ebit',fmt(res,ul),pct.toFixed(1).replace('.',',')+'\u00A0% vom Umsatz',res>=0?'pos':'neg');
    const t=document.getElementById('diagram-title');
    if(t) t.textContent=(d.title||'P&L')+'\u00A0\u2014\u00A0'+periodTitle;
  }

  _render(links, title) {
    const container=document.getElementById(this.containerId); if(!container) return;
    container.innerHTML='';
    const d=this.multiData;
    const W=container.clientWidth||960, H=Math.max(440,Math.min(W*0.58,620));
    const nw=114,nr=5,ovlap=nr+2,pad=10,mt=24,mb=24,iH=H-mt-mb,numCols=5;
    const usableW=W-2*pad-nw, colX=col=>pad+nw/2+(col/(numCols-1))*usableW;

    const nodeMap={};
    d.nodes.forEach(n=>{ nodeMap[n.id]={...n,col:GROUP_COLUMNS[n.group]??2,color:GROUP_COLORS[n.group]||'#505C6D',inValue:0,outValue:0,inOffset:0,outOffset:0}; });
    links.forEach(l=>{ if(nodeMap[l.source]) nodeMap[l.source].outValue+=l.value; if(nodeMap[l.target]) nodeMap[l.target].inValue+=l.value; });
    Object.values(nodeMap).forEach(n=>{ n.value=Math.max(n.inValue,n.outValue); if(n.group==='result'&&n.value<0) n.color=GROUP_COLORS_UNFAV['result']; });

    const maxVal=Math.max(...Object.values(nodeMap).map(n=>n.value)), scale=v=>(v/maxVal)*iH*0.82, minH=26, nodeGap=12;
    const colGroups={};
    Object.values(nodeMap).forEach(n=>{ if(!colGroups[n.col]) colGroups[n.col]=[]; colGroups[n.col].push(n); });
    Object.entries(colGroups).forEach(([col,nodes])=>{
      const totalH=nodes.reduce((s,n)=>s+Math.max(scale(n.value),minH),0)+nodeGap*(nodes.length-1);
      let y=mt+(iH-totalH)/2;
      nodes.forEach(n=>{ const h=Math.max(scale(n.value),minH); n.x=colX(parseInt(col))-nw/2; n.y=y; n.h=h; n.cx=colX(parseInt(col)); n.cy=y+h/2; y+=h+nodeGap; });
    });

    const svg=d3.select('#'+this.containerId).append('svg').attr('id','sankey-svg').attr('viewBox','0 0 '+W+' '+H).attr('width','100%');
    const defs=svg.append('defs');
    const filt=defs.append('filter').attr('id','rshadow').attr('x','-5%').attr('y','-5%').attr('width','110%').attr('height','110%');
    filt.append('feDropShadow').attr('dx','0').attr('dy','1').attr('stdDeviation','2').attr('flood-color','rgba(0,0,0,0.16)');

    const tooltip=this.tooltip;

    links.forEach((lk,i)=>{
      const s=nodeMap[lk.source],t=nodeMap[lk.target]; if(!s||!t) return;
      const lh=Math.max(scale(lk.value),2);
      const sy0=s.y+s.outOffset,sy1=sy0+lh,ty0=t.y+t.inOffset,ty1=ty0+lh;
      s.outOffset+=lh; t.inOffset+=lh;
      const x1=s.cx+nw/2-ovlap, x2=t.cx-nw/2+ovlap, cp=(x1+x2)/2;
      const path='M'+x1+','+sy0+' C'+cp+','+sy0+' '+cp+','+ty0+' '+x2+','+ty0+' L'+x2+','+ty1+' C'+cp+','+ty1+' '+cp+','+sy1+' '+x1+','+sy1+' Z';
      const gid='g'+i,hid='h'+i;
      const gr=defs.append('linearGradient').attr('id',gid).attr('x1','0%').attr('x2','100%');
      gr.append('stop').attr('offset','0%').attr('stop-color',s.color).attr('stop-opacity',0.72);
      gr.append('stop').attr('offset','50%').attr('stop-color',mixColors(s.color,t.color)).attr('stop-opacity',0.58);
      gr.append('stop').attr('offset','100%').attr('stop-color',t.color).attr('stop-opacity',0.72);
      const hg=defs.append('linearGradient').attr('id',hid).attr('x1','0%').attr('x2','0%').attr('y1','0%').attr('y2','100%');
      hg.append('stop').attr('offset','0%').attr('stop-color','#fff').attr('stop-opacity',0.22);
      hg.append('stop').attr('offset','45%').attr('stop-color','#fff').attr('stop-opacity',0.0);
      hg.append('stop').attr('offset','100%').attr('stop-color','#000').attr('stop-opacity',0.11);
      const ribbon=svg.append('path').attr('d',path).attr('fill','url(#'+gid+')').attr('stroke','none').style('filter','url(#rshadow)');
      svg.append('path').attr('d',path).attr('fill','url(#'+hid+')').attr('stroke','none').style('pointer-events','none');
      ribbon.on('mouseenter',function(ev){ d3.select(this).style('filter','none'); tooltip.innerHTML='<div class="bc-tooltip__title">'+s.label+' \u2192 '+t.label+'</div>'+fmt(lk.value,d.unit_label); tooltip.classList.add('visible'); })
            .on('mousemove',ev=>{ tooltip.style.left=(ev.clientX+14)+'px'; tooltip.style.top=(ev.clientY-10)+'px'; })
            .on('mouseleave',function(){ d3.select(this).style('filter','url(#rshadow)'); tooltip.classList.remove('visible'); });
    });

    Object.values(nodeMap).forEach(n=>{
      const g=svg.append('g').style('cursor','pointer');
      g.append('rect').attr('x',n.x).attr('y',n.y).attr('width',nw).attr('height',n.h).attr('rx',nr).attr('fill',n.color).attr('opacity',0.95);
      g.append('rect').attr('x',n.x).attr('y',n.y).attr('width',nw).attr('height',Math.min(5,n.h)).attr('rx',nr).attr('fill','rgba(255,255,255,0.28)').style('pointer-events','none');
      const mx=n.cx,my=n.y+n.h/2,fs=n.h<40?9:11,lbl=n.label.length>14?n.label.slice(0,13)+'\u2026':n.label;
      if(n.h>=26) g.append('text').attr('x',mx).attr('y',n.h>=42?my-7:my+4).attr('text-anchor','middle').attr('font-size',fs+'px').attr('font-weight','600').attr('font-family','"Segoe UI",Tahoma,sans-serif').attr('fill','#fff').text(lbl);
      if(n.h>=42) g.append('text').attr('x',mx).attr('y',my+9).attr('text-anchor','middle').attr('font-size','9px').attr('font-family','"Segoe UI",Tahoma,sans-serif').attr('fill','rgba(255,255,255,0.88)').text(fmt(n.value,d.unit_label));
      g.on('mouseenter',function(ev){ const tn2=Object.values(nodeMap).find(x=>x.group==='total'); const pct=tn2&&tn2.value?' ('+(n.value/tn2.value*100).toFixed(1).replace('.',',')+'\u00A0%)':''; tooltip.innerHTML='<div class="bc-tooltip__title">'+n.label+'</div>'+fmt(n.value,d.unit_label)+pct; tooltip.classList.add('visible'); })
        .on('mousemove',ev=>{ tooltip.style.left=(ev.clientX+14)+'px'; tooltip.style.top=(ev.clientY-10)+'px'; })
        .on('mouseleave',()=>tooltip.classList.remove('visible'));
    });
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  const sankey=new BCSankey('sankey-container');
  window.bcSankey=sankey;
  sankey.loadUrl('./data/sample-3y.json').catch(()=>sankey.loadUrl('./data/sample.json').catch(()=>console.warn('Keine Daten')));
  const fi=document.getElementById('file-input'),ub=document.getElementById('upload-btn');
  if(ub) ub.addEventListener('click',()=>fi&&fi.click());
  if(fi) fi.addEventListener('change',e=>{ const f=e.target.files[0]; if(f) sankey.loadFile(f); });
  const dz=document.getElementById('drop-zone');
  if(dz){
    dz.addEventListener('dragover',e=>{e.preventDefault();dz.style.borderColor='var(--bc-primary)';});
    dz.addEventListener('dragleave',()=>{dz.style.borderColor='';});
    dz.addEventListener('drop',e=>{e.preventDefault();dz.style.borderColor='';const f=e.dataTransfer.files[0];if(f&&f.name.endsWith('.json'))sankey.loadFile(f);});
  }
  let rt;
  window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{if(sankey.multiData)sankey._gotoIdx(sankey.currentIdx,false);},250);});
});
