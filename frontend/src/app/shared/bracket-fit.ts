// src/app/shared/bracket-fit.ts
//
// Whether a TV should show a halving tree (single elimination, or the winners bracket of
// double elimination) mirrored or stacked. Mirroring halves the height and roughly doubles
// the width, so which one comes out bigger depends on the field size, the screen, and how
// much of the screen the boards column takes. Rather than guess with a team-count cutoff,
// measure the layout on screen, work out what the other one would measure, and keep the
// one that scales larger. Pure, so the arithmetic can be tested without a browser.

export interface Box { width: number; height: number; }

export interface TreeGeometry {
  /** Rounds in the tree, the final included. */
  rounds: number;
  rowUnit: number;
  gutter: number;
}

/** How much a box can be scaled to fit the space, capped so a small bracket isn't blown up. */
export function fitScale(box: Box, avail: Box, max: number): number {
  if (!box.width || !box.height || avail.width <= 0 || avail.height <= 0) return 1;
  return Math.min(max, Math.max(0.1, Math.min(avail.width / box.width, avail.height / box.height)));
}

// Columns, gutters and grid rows each layout has. Mirrored: n-1 rounds down each side plus
// the final in the middle, each side half the height. Stacked: one column per round.
function shape(n: number, mirrored: boolean) {
  return mirrored
    ? { columns: 2 * n - 1, gutters: 2 * n - 2, rows: Math.pow(2, n - 2) }
    : { columns: n, gutters: n - 1, rows: Math.pow(2, n - 1) };
}

/**
 * Natural sizes of both layouts, extrapolated from the one measured on screen. Column width
 * and the height spent outside the grid (round labels, the champion line) are recovered
 * from the measurement, so long team names widen both estimates alike.
 */
export function estimateLayouts(measured: Box, mirroredNow: boolean, g: TreeGeometry): { stacked: Box; mirrored: Box } {
  const now = shape(g.rounds, mirroredNow);
  const column = Math.max(0, (measured.width - now.gutters * g.gutter) / now.columns);
  const extraHeight = Math.max(0, measured.height - now.rows * g.rowUnit);

  const size = (mirrored: boolean): Box => {
    const s = shape(g.rounds, mirrored);
    return { width: s.columns * column + s.gutters * g.gutter, height: s.rows * g.rowUnit + extraHeight };
  };
  return { stacked: size(false), mirrored: size(true) };
}

/**
 * Whether to show the tree mirrored. Switches away from what is on screen only for a
 * clearly bigger picture, so an estimate that is slightly off can't flip the TV back and
 * forth between the two.
 */
export function preferMirrored(measured: Box, mirroredNow: boolean, g: TreeGeometry, avail: Box, max: number): boolean {
  if (g.rounds < 2) return false;
  const { stacked, mirrored } = estimateLayouts(measured, mirroredNow, g);
  const mirroredScale = fitScale(mirrored, avail, max);
  const stackedScale = fitScale(stacked, avail, max);
  const margin = 1.05;
  return mirroredNow ? !(stackedScale > mirroredScale * margin) : mirroredScale > stackedScale * margin;
}
