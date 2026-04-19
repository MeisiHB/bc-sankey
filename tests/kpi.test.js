import { describe, it, expect } from 'vitest';
import { calculateKPIs } from '../src/sankey-core.js';
import { SAMPLE_DATA, LOSS_DATA, MINIMAL_DATA } from './fixtures.js';

describe('calculateKPIs', () => {

  describe('standard P&L (sample data)', () => {
    const kpis = calculateKPIs(SAMPLE_DATA);

    it('calculates total revenue correctly', () => {
      expect(kpis.totalRevenue).toBe(800);
    });

    it('calculates result correctly', () => {
      expect(kpis.result).toBe(240);
    });

    it('calculates total costs correctly', () => {
      expect(kpis.totalCosts).toBe(560);
    });

    it('calculates result percentage', () => {
      expect(kpis.resultPct).toBe(30);
    });

    it('currency', () => expect(kpis.currency).toBe('EUR'));
    it('unitLabel', () => expect(kpis.unitLabel).toBe('T\u20AC'));
  });

  describe('loss', () => {
    const kpis = calculateKPIs(LOSS_DATA);
    it('negative result', () => expect(kpis.result).toBeLessThan(0));
    it('negative result %', () => expect(kpis.resultPct).toBeLessThan(0));
    it('costs > revenue', () => expect(kpis.totalCosts).toBeGreaterThan(kpis.totalRevenue));
  });

  it('result + costs = revenue', () => {
    const k = calculateKPIs(SAMPLE_DATA);
    expect(k.result + k.totalCosts).toBe(k.totalRevenue);
  });

  it('zero revenue => 0%', () => {
    const d = { ...MINIMAL_DATA, links: [{ source: 'rev', target: 'result', value: 0 }] };
    expect(calculateKPIs(d).resultPct).toBe(0);
  });

});
