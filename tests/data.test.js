import { describe, it, expect } from 'vitest';
import { validateData, buildNodeMap, GROUP_COLUMNS } from '../src/sankey-core.js';
import { SAMPLE_DATA, MINIMAL_DATA } from './fixtures.js';

describe('validateData', () => {
  it('accepts sample data', () => expect(validateData(SAMPLE_DATA).valid).toBe(true));
  it('accepts minimal data', () => expect(validateData(MINIMAL_DATA).valid).toBe(true));
  it('rejects null', () => expect(validateData(null).valid).toBe(false));
  it('rejects missing nodes', () => { const r=validateData({links:[]}); expect(r.valid).toBe(false); expect(r.errors.some(e=>e.includes('nodes'))).toBe(true); });
  it('rejects missing links', () => { const r=validateData({nodes:[]}); expect(r.valid).toBe(false); });
  it('rejects node without id', () => { const r=validateData({...SAMPLE_DATA,nodes:[{label:'X',group:'total'},...SAMPLE_DATA.nodes]}); expect(r.valid).toBe(false); expect(r.errors.some(e=>e.includes('missing id'))).toBe(true); });
  it('rejects unknown group', () => { const r=validateData({...SAMPLE_DATA,nodes:[...SAMPLE_DATA.nodes,{id:'x',label:'X',group:'BAD'}]}); expect(r.valid).toBe(false); expect(r.errors.some(e=>e.includes('unknown group'))).toBe(true); });
  it('rejects no total node', () => { const r=validateData({...SAMPLE_DATA,nodes:SAMPLE_DATA.nodes.filter(n=>n.group!=='total')}); expect(r.valid).toBe(false); });
  it('rejects negative link value', () => { const r=validateData({...SAMPLE_DATA,links:[{source:'wages',target:'wages',value:-1}]}); expect(r.valid).toBe(false); });
  it('rejects unknown source', () => { const r=validateData({...SAMPLE_DATA,links:[{source:'GHOST',target:'wages',value:100}]}); expect(r.valid).toBe(false); expect(r.errors.some(e=>e.includes('"GHOST"'))).toBe(true); });
  it('rejects self-link', () => { const r=validateData({...SAMPLE_DATA,links:[...SAMPLE_DATA.links,{source:'wages',target:'wages',value:10}]}); expect(r.valid).toBe(false); expect(r.errors.some(e=>e.includes('must differ'))).toBe(true); });
});

describe('buildNodeMap', () => {
  const m = buildNodeMap(SAMPLE_DATA.nodes, SAMPLE_DATA.links);
  it('creates all nodes', () => expect(Object.keys(m)).toHaveLength(SAMPLE_DATA.nodes.length));
  it('total inValue = 800', () => expect(m['total-revenue'].inValue).toBe(800));
  it('total outValue = 800', () => expect(m['total-revenue'].outValue).toBe(800));
  it('total value = 800', () => expect(m['total-revenue'].value).toBe(800));
  it('inland value = 420', () => expect(m['inland'].value).toBe(420));
  it('east favorable color', () => expect(m['ebit'].color).toBe('#35AB22'));
  it('columns assigned', () => {
    expect(m['inland'].col).toBe(GROUP_COLUMNS['revenue-2']);
    expect(m['total-revenue'].col).toBe(GROUP_COLUMNS['total']);
  });
});
