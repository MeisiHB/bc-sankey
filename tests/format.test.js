import { describe, it, expect } from 'vitest';
import { formatValue, formatPercent, resolveNodeColor, GROUP_COLORS, GROUP_COLORS_UNFAV } from '../src/sankey-core.js';

describe('formatValue', () => {
  it('round number', () => expect(formatValue(800, 'T\u20AC')).toBe('800,0 T\u20AC'));
  it('thousands', () => expect(formatValue(1234, 'T\u20AC')).toBe('1.234,0 T\u20AC'));
  it('zero', () => expect(formatValue(0, 'T\u20AC')).toBe('0,0 T\u20AC'));
  it('negative', () => expect(formatValue(-240, 'T\u20AC')).toBe('-240,0 T\u20AC'));
  it('default unit', () => expect(formatValue(100)).toBe('100,0 T\u20AC'));
});

describe('formatPercent', () => {
  it('round', () => expect(formatPercent(30)).toBe('30,0 %'));
  it('decimal', () => expect(formatPercent(12.5)).toBe('12,5 %'));
  it('zero', () => expect(formatPercent(0)).toBe('0,0 %'));
  it('negative', () => expect(formatPercent(-5)).toBe('-5,0 %'));
});

describe('resolveNodeColor', () => {
  it('all groups', () => {
    Object.entries(GROUP_COLORS).forEach(([group, color]) => {
      expect(resolveNodeColor({ group, value: 100 })).toBe(color);
    });
  });
  it('negative result', () => expect(resolveNodeColor({group:'result',value:-50})).toBe(GROUP_COLORS_UNFAV['result']));
  it('unknown group', () => expect(resolveNodeColor({group:'XXX',value:100})).toBe('#505C6D'));
  it('BC Primary', () => expect(GROUP_COLORS['total']).toBe('#00B7C3'));
  it('BC Favorable', () => expect(GROUP_COLORS['result']).toBe('#35AB22'));
  it('BC Unfavorable', () => expect(GROUP_COLORS_UNFAV['result']).toBe('#EB6965'));
});
