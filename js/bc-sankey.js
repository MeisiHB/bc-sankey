/**
 * bc-sankey.js  v2.0  — multi-period animation
 */
'use strict';

const GROUP_COLORS = {
  'revenue-2': '#75B5E7','revenue-1': '#378ADD','total': '#00B7C3',
  'cost-1': '#E89E63','cost-2': '#C9C472','result': '#35AB22'
};
const GROUP_COLORS_UNFAV = { 'result': '#EB6965' };
const GROUP_COLUMNS = { 'revenue-2':0,'revenue-1':1,'total':2,'cost-1':3,'cost-2':4,'result':3 };

function fmt(v, ul) {
  ul = ul || 'T€';
  return new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(v)+' '+ul;
}
function mixColors(h1,h2){
  const p=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
  const a=p(h1),b=p(h2);
  return '#'+a.map((v,i)=>Math.round((v+b[i])/2).toString(16).padStart(2,'0')).join('');
}
function easeInOut(t){ return t<0.5?2*t*t:-1+(4-2*t)*t; }
function averageLinks(sets){
  if(!sets.length)return[];
  return sets[0].map((lk,i)=>({...lk,value:Math.round(sets.reduce((s,ls)=>s+ls[i].value,0)/sets.length)}));
}

class BCSankey {
  constructor(id){
    this.containerId=id; this.data=null; this.periods=[]; this.currentIndex=0;
    this.intervalMode='month'; this.animating=false; this.animTimer=null; this.animReq=null;
    this.stepDelay=600; this.transitionMs=900;
    this.tooltip=document.getElementById('bc-tooltip');
  }

  async loadUrl(url){ this.load(await(await fetch(url)).json()); }
  async loadFile(file){ this.load(JSON.parse(await file.text())); }

  load(data){
    this.stop(); this.data=data;
    if(!data.periods) data.periods=[{label:data.period||'Periode 1',key:'p1',links:data.links}];
    this.buildPeriods(); this.currentIndex=0; this.renderCurrentPeriod(); this.rebuildSelectors();
  }

  buildPeriods(){
    const raw=this.data.periods;
    if(this.intervalMode==='month') this.periods=raw;
    else if(this.intervalMode==='quarter') this.periods=this.buildQuarters(raw);
    else this.periods=this.buildYears(raw);
  }

  buildQuarters(raw){
    const r=[];
    for(let i=0;i<raw.length;i+=3){
      const g=raw.slice(i,i+3); if(!g.length)continue;
      const [yr,mo]=g[0].key.split('-').map(Number), q=Math.ceil(mo/3);
      r.push({label:'Q'+q+' '+yr,key:yr+'-Q'+q,links:averageLinks(g.map(p=>p.links))});
    }
    return r;
  }

  buildYears(raw){
    const map={};
    raw.forEach(p=>{const yr=p.key.split('-')[0]; if(!map[yr])map[yr]=[]; map[yr].push(p.links);});
    return Object.entries(map).map(([yr,sets])=>({label:yr,key:yr,links:averageLinks(sets)}));
  }

  periodData(i){ const p=this.periods[i]; return{...this.data,links:p.links,period:p.label}; }

  renderCurrentPeriod(){
    const pd=this.periodData(this.currentIndex);
    this.render(pd); this.updateKPIs(pd); this.updatePeriodLabel();
  }

  render(data){
    const container=document.getElementById(this.containerId); if(!container)return;
    container.innerHTML='';
    const W=container.clientWidth||960, H=Math.max(440,Math.min(W*0.58,620));
    const nw=114,nr=5,ovlap=nr+2,pad=10,mt=24,mb=24,iH=H-mt-mb,numCols=5;
    const usableW=W-2*pad-nw, colX=col=>pad+nw/2+(col/(numCols-1))*usableW;

    const nodeMap={};
    data.nodes.forEach(n=>{
      nodeMap[n.id]={...n,col:GROUP_COLUMNS[n.group]??2,color:GROUP_COLORS[n.group]||'#505C6D',
        inValue:0,outValue:0,inOffset:0,outOffset:0};
    });
    data.links.forEach(l=>{
      if(nodeMap[l.source])nodeMap[l.source].outValue+=l.value;
      if(nodeMap[l.target])nodeMap[l.target].inValue+=l.value;
    });
    Object.values(nodeMap).forEach(n=>{
      n.value=Math.max(n.inValue,n.outValue);
      if(n.group==='result'&&n.value<0)n.color=GROUP_COLORS_UNFAV['result'];
    });

    const maxVal=Math.max(...Object.values(nodeMap).map(n=>n.value));
    const scale=v=>(v/maxVal)*iH*0.82, minH=26, nodeGap=12;
    const colGroups={};
    Object.values(nodeMap).forEach(n=>{ if(!colGroups[n.col])colGroups[n.col]=[]; colGroups[n.col].push(n); });
    Object.entries(colGroups).forEach(([col,nodes])=>{
      const totalH=nodes.reduce((s,n)=>s+Math.max(scale(n.value),minH),0)+nodeGap*(nodes.length-1);
      let y=mt+(iH-totalH)/2;
      nodes.forEach(n=>{ const h=Math.max(scale(n.value),minH); n.x=colX(parseInt(col))-nw/2; n.y=y; n.h=h; n.cx=colX(parseInt(col)); y+=h+nodeGap; });
    });

    const svg=d3.select('#'+this.containerId).append('svg').attr('id','sankey-svg').attr('viewBox','0 0 '+W+' '+H).attr('width','100%');
    const defs=svg.append('defs');
    const filt=defs.append('filter').attr('id','rshadow').attr('x','-5%').attr('y','-5%').attr('width','110%').attr('height','110%');
    filt.append('feDropShadow').attr('dx','0').attr('dy','1').attr('stdDeviation','2').attr('flood-color','rgba(0,0,0,0.16)');
    const tooltip=this.tooltip;

    data.links.forEach((lk,i)=>{
      const s=nodeMap[lk.source],t=nodeMap[lk.target]; if(!s||!t)return;
      const lh=Math.max(scale(lk.value),2);
      const sy0=s.y+s.outOffset,sy1=sy0+lh,ty0=t.y+t.inOffset,ty1=ty0+lh;
      s.outOffset+=lh; t.inOffset+=lh;
      const x1=s.cx+nw/2-ovlap,x2=t.cx-nw/2+ovlap,cp=(x1+x2)/2;
      const path='M'+x1+','+sy0+' C'+cp+','+sy0+' '+cp+','+ty0+' '+x2+','+ty0+' L'+x2+','+ty1+' C'+cp+','+ty1+' '+cp+','+sy1+' '+x1+','+sy1+' Z';
      const gid='g'+i,hid='h'+i;
      const gr=defs.append('linearGradient').attr('id',gid).attr('x1','0%').attr('x2','100%');
      gr.append('stop').attr('offset','0%').attr('stop-color',s.color).attr('stop-opacity',0.72);
      gr.append('stop').attr('offset','50%').attr('stop-color',mixColors(s.color,t.color)).attr('stop-opacity',0.58);
      gr.append('stop').attr('offset','100%').attr('stop-color',t.color).attr('stop-opacity',0.72);
      const hg=defs.append('linearGradient').attr('id',hid).attr('x1','0%').attr('x2','0%').attr('y1','0%').attr('y2','100%');
      hg.append('stop').attr('offset','0%').attr('stop-color','#fff').attr('stop-opacity',0.22);
      hg.append('stop').attr('offset','45%').attr('stop-color','#fff').attr('stop-opacity',0);
      hg.append('stop').attr('offset','100%').attr('stop-color','#000').attr('stop-opacity',0.11);
      const ribbon=svg.append('path').attr('d',path).attr('fill','url(#'+gid+')').attr('stroke','none').style('filter','url(#rshadow)');
      svg.append('path').attr('d',path).attr('fill','url(#'+hid+')').attr('stroke','none').style('pointer-events','none');
      ribbon.on('mouseenter',function(ev){d3.select(this).style('filter','none'); tooltip.innerHTML='<div class="bc-tooltip__title">'+s.label+' → '+t.label+'</div>'+fmt(lk.value,data.unit_label); tooltip.classList.add('visible');})
            .on('mousemove',ev=>{tooltip.style.left=(ev.clientX+14)+'px';tooltip.style.top=(ev.clientY-10)+'px';})
            .on('mouseleave',function(){d3.select(this).style('filter','url(#rshadow)');tooltip.classList.remove('visible');});
    });

    Object.values(nodeMap).forEach(n=>{
      const g=svg.append('g').style('cursor','pointer');
      g.append('rect').attr('x',n.x).attr('y',n.y).attr('width',nw).attr('height',n.h).attr('rx',nr).attr('fill',n.color).attr('opacity',0.95);
      g.append('rect').attr('x',n.x).attr('y',n.y).attr('width',nw).attr('height',Math.min(5,n.h)).attr('rx',nr).attr('fill','rgba(255,255,255,0.28)').style('pointer-events','none');
      const mx=n.cx,my=n.y+n.h/2,fs=n.h<40?9:11;
      const lbl=n.label.length>14?n.label.slice(0,13)+'…':n.label;
      if(n.h>=26) g.append('text').attr('x',mx).attr('y',n.h>=42?my-7:my+4).attr('text-anchor','middle').attr('font-size',fs+'px').attr('font-weight','600').attr('font-family','"Segoe UI",Tahoma,sans-serif').attr('fill','#fff').text(lbl);
      if(n.h>=42) g.append('text').attr('x',mx).attr('y',my+9).attr('text-anchor','middle').attr('font-size','9px').attr('font-family','"Segoe UI",Tahoma,sans-serif').attr('fill','rgba(255,255,255,0.88)').text(fmt(n.value,data.unit_label));
      g.on('mouseenter',function(ev){
          const tn=Object.values(nodeMap).find(x=>x.group==='total');
          const pct=tn&&tn.value?' ('+(n.value/tn.value*100).toFixed(1).replace('.',',')+' %)':'';
          tooltip.innerHTML='<div class="bc-tooltip__title">'+n.label+'</div>'+fmt(n.value,data.unit_label)+pct; tooltip.classList.add('visible');
        })
        .on('mousemove',ev=>{tooltip.style.left=(ev.clientX+14)+'px';tooltip.style.top=(ev.clientY-10)+'px';})
        .on('mouseleave',()=>tooltip.classList.remove('visible'));
    });
  }

  updateKPIs(data){
    if(!data)data=this.periodData(this.currentIndex);
    const tn=data.nodes.find(n=>n.group==='total'),rn=data.nodes.find(n=>n.group==='result');
    const rev=data.links.filter(l=>l.target===tn.id).reduce((s,l)=>s+l.value,0);
    const res=data.links.filter(l=>l.target===rn.id).reduce((s,l)=>s+l.value,0);
    const pct=rev?Math.round((res/rev)*10000)/100:0;
    const ul=data.unit_label||'T€';
    const set=(id,val,sub,cls)=>{
      const el=document.getElementById(id); if(!el)return;
      const vEl=el.querySelector('.bc-kpi__value'); vEl.textContent=val; vEl.className='bc-kpi__value'+(cls||'');
      const sEl=el.querySelector('.bc-kpi__sub'); if(sEl&&sub)sEl.textContent=sub;
    };
    set('kpi-revenue',fmt(rev,ul),data.period||'','');
    set('kpi-costs',fmt(rev-res,ul),'Gesamtkosten','');
    set('kpi-ebit',fmt(res,ul),pct.toFixed(1).replace('.',',')+' % vom Umsatz',res>=0?' bc-kpi__value--favorable':' bc-kpi__value--unfavorable');
    const t=document.getElementById('diagram-title'); if(t)t.textContent=data.title||'Sankey P&L';
  }

  animateTo(targetIndex,onDone){
    if(targetIndex===this.currentIndex){onDone&&onDone();return;}
    const fromLinks=this.periods[this.currentIndex].links, toLinks=this.periods[targetIndex].links;
    const dur=this.transitionMs, start=performance.now();
    const tick=now=>{
      const t=Math.min((now-start)/dur,1), te=easeInOut(t);
      const interp=fromLinks.map((lk,i)=>({...lk,value:Math.round(lk.value*(1-te)+toLinks[i].value*te)}));
      this.render({...this.data,links:interp,period:this.periods[targetIndex].label});
      if(t<1){ this.animReq=requestAnimationFrame(tick); }
      else { this.currentIndex=targetIndex; this.updateKPIs(); this.updatePeriodLabel(); onDone&&onDone(); }
    };
    this.animReq=requestAnimationFrame(tick);
  }

  play(fromIdx,toIdx){
    if(this.animating){this.stop();return;}
    this.animating=true; this.currentIndex=fromIdx; this.renderCurrentPeriod(); this.updatePlayButton();
    const step=()=>{
      if(!this.animating)return;
      const next=this.currentIndex+1;
      if(next>toIdx){this.stop();return;}
      this.animateTo(next,()=>{ if(this.animating)this.animTimer=setTimeout(step,this.stepDelay); });
    };
    this.animTimer=setTimeout(step,this.stepDelay/2);
  }

  stop(){ this.animating=false; clearTimeout(this.animTimer); if(this.animReq)cancelAnimationFrame(this.animReq); this.updatePlayButton(); }

  setIntervalMode(mode){ this.stop(); this.intervalMode=mode; this.buildPeriods(); this.currentIndex=0; this.renderCurrentPeriod(); this.rebuildSelectors(); }

  rebuildSelectors(){
    const sf=document.getElementById('sel-from'),st=document.getElementById('sel-to');
    if(!sf||!st)return;
    sf.innerHTML=st.innerHTML='';
    this.periods.forEach((p,i)=>{ sf.add(new Option(p.label,i)); st.add(new Option(p.label,i)); });
    sf.value=0; st.value=this.periods.length-1; this.updatePeriodLabel();
  }

  updatePeriodLabel(){
    const el=document.getElementById('current-period');
    if(el&&this.periods[this.currentIndex])el.textContent=this.periods[this.currentIndex].label;
    const sf=document.getElementById('sel-from'); if(sf&&!this.animating)sf.value=this.currentIndex;
  }

  updatePlayButton(){
    const btn=document.getElementById('btn-play');
    if(btn)btn.textContent=this.animating?'⏹ Stop':'▶ Start';
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  const sankey=new BCSankey('sankey-container');
  window.bcSankey=sankey;

  ['month','quarter','year'].forEach(mode=>{
    document.getElementById('btn-'+mode)?.addEventListener('click',()=>{
      document.querySelectorAll('.bc-btn--toggle').forEach(b=>b.classList.remove('active'));
      document.getElementById('btn-'+mode).classList.add('active');
      sankey.setIntervalMode(mode);
    });
  });

  document.getElementById('btn-play')?.addEventListener('click',()=>{
    if(sankey.animating){sankey.stop();}
    else{
      const from=parseInt(document.getElementById('sel-from').value);
      const to=parseInt(document.getElementById('sel-to').value);
      sankey.play(from,to>from?to:sankey.periods.length-1);
    }
  });

  document.getElementById('sel-from')?.addEventListener('change',e=>{
    sankey.stop(); sankey.currentIndex=parseInt(e.target.value); sankey.renderCurrentPeriod();
  });

  const fi=document.getElementById('file-input');
  document.getElementById('upload-btn')?.addEventListener('click',()=>fi?.click());
  fi?.addEventListener('change',e=>{ const f=e.target.files[0]; if(f)sankey.loadFile(f); });

  const dz=document.getElementById('drop-zone');
  if(dz){
    dz.addEventListener('dragover',e=>{e.preventDefault();dz.style.borderColor='var(--bc-primary)';});
    dz.addEventListener('dragleave',()=>{dz.style.borderColor='';});
    dz.addEventListener('drop',e=>{e.preventDefault();dz.style.borderColor=''; const f=e.dataTransfer.files[0]; if(f?.name.endsWith('.json'))sankey.loadFile(f);});
  }

  let rt;
  window.addEventListener('resize',()=>{ clearTimeout(rt); rt=setTimeout(()=>{if(sankey.data)sankey.renderCurrentPeriod();},250); });

  sankey.loadUrl('./data/sample.json').catch(()=>console.warn('sample.json nicht gefunden'));
});