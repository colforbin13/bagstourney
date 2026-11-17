// src/app/shared/bracket-fit.spec.ts
import { estimateLayouts, fitScale, preferMirrored, TreeGeometry } from './bracket-fit';

describe('bracket fit', () => {
  const tv = { width: 1860, height: 975 };              // 1080p, no boards column
  const tvWithBoards = { width: 1400, height: 975 };    // 1080p, boards column on the right
  const max = 2.5;

  // A column 200 wide, gutters 32, rows 150, 30px of labels: what a TV card measures.
  const geometry = (rounds: number): TreeGeometry => ({ rounds, rowUnit: 150, gutter: 32 });
  const stackedSize = (n: number) => ({ width: n * 200 + (n - 1) * 32, height: Math.pow(2, n - 1) * 150 + 30 });
  const mirroredSize = (n: number) => ({ width: (2 * n - 1) * 200 + (2 * n - 2) * 32, height: Math.pow(2, n - 2) * 150 + 30 });

  describe('fitScale()', () => {
    it('is limited by whichever side runs out first', () => {
      expect(fitScale({ width: 1000, height: 2000 }, { width: 2000, height: 1000 }, max)).toBe(0.5);
    });

    it('caps enlargement of a small bracket', () => {
      expect(fitScale({ width: 100, height: 100 }, tv, max)).toBe(max);
    });
  });

  describe('estimateLayouts()', () => {
    it('recovers both sizes from the stacked layout', () => {
      const est = estimateLayouts(stackedSize(4), false, geometry(4));
      expect(est.stacked).toEqual(stackedSize(4));
      expect(est.mirrored).toEqual(mirroredSize(4));
    });

    it('recovers both sizes from the mirrored layout', () => {
      const est = estimateLayouts(mirroredSize(5), true, geometry(5));
      expect(est.stacked).toEqual(stackedSize(5));
      expect(est.mirrored).toEqual(mirroredSize(5));
    });
  });

  describe('preferMirrored()', () => {
    it('mirrors a 32-team tree, which stacked is far too tall', () => {
      expect(preferMirrored(stackedSize(5), false, geometry(5), tvWithBoards, max)).toBe(true);
    });

    it('mirrors a 16-team tree on a TV with room to the sides', () => {
      expect(preferMirrored(stackedSize(4), false, geometry(4), tv, max)).toBe(true);
    });

    it('stacks an 8-team tree, which already fits the height', () => {
      expect(preferMirrored(mirroredSize(3), true, geometry(3), tvWithBoards, max)).toBe(false);
    });

    it('stays put when the other layout is only marginally bigger', () => {
      // 16 teams in a space this shape: mirrored is about 1.03x, inside the margin.
      const avail = { width: 1300, height: 975 };
      const { stacked, mirrored } = estimateLayouts(stackedSize(4), false, geometry(4));
      const ratio = fitScale(mirrored, avail, max) / fitScale(stacked, avail, max);
      expect(ratio).toBeGreaterThan(1);
      expect(ratio).toBeLessThan(1.05);
      expect(preferMirrored(stackedSize(4), false, geometry(4), avail, max)).toBe(false);
      expect(preferMirrored(mirroredSize(4), true, geometry(4), avail, max)).toBe(true);
    });

    it('never mirrors a two-team bracket, whose only round is the final', () => {
      expect(preferMirrored({ width: 200, height: 180 }, false, geometry(1), tv, max)).toBe(false);
    });
  });
});
