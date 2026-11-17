// src/app/shared/examples.spec.ts
import { EXAMPLE_BRACKETS, exampleOrder, exampleShows, isExampleTournament } from './examples';

describe('examples', () => {
  const shape = (overrides: Partial<Parameters<typeof exampleShows>[0]> = {}): Parameters<typeof exampleShows>[0] => ({
    format: 'single',
    seeding_mode: 'automatic',
    team_entry_mode: 'auto_draft',
    draw_mode: 'random',
    status: 'complete',
    ...overrides,
  });

  it('should count a tournament as an example by who created it', () => {
    expect(isExampleTournament({ created_by_user_id: 5 })).toBeTrue();
    expect(isExampleTournament({ created_by_user_id: 1 })).toBeFalse();
    expect(isExampleTournament(null)).toBeFalse();
  });

  // The five seeded examples, by their settings.
  it('should say what each kind of example shows', () => {
    expect(exampleShows(shape())).toBe('Blind draw');
    expect(exampleShows(shape({ team_entry_mode: 'direct', seeding_mode: 'manual' }))).toBe('Set teams, seeded by hand');
    expect(exampleShows(shape({ team_entry_mode: 'direct', seeding_mode: 'pool_play' }))).toBe('Pool play into a bracket');
    expect(exampleShows(shape({ format: 'double', draw_mode: 'balanced' }))).toBe('Double elimination, balanced draw');
    expect(exampleShows(shape({ format: 'double', team_entry_mode: 'direct', status: 'active' })))
      .toBe('Double elimination, in progress');
  });

  it('should fall back to plain set teams for a direct-entry bracket with nothing special', () => {
    expect(exampleShows(shape({ team_entry_mode: 'direct' }))).toBe('Set teams');
  });

  it('should order the simplest format first, and a finished bracket before a running one', () => {
    const ordered = [
      shape({ format: 'double', status: 'active' }),
      shape({ seeding_mode: 'pool_play' }),
      shape({ format: 'double' }),
      shape({ team_entry_mode: 'direct', seeding_mode: 'manual' }),
      shape(),
    ].sort((a, b) => exampleOrder(a) - exampleOrder(b)).map(exampleShows);

    expect(ordered).toEqual([
      'Blind draw',
      'Set teams, seeded by hand',
      'Pool play into a bracket',
      'Double elimination',
      'Double elimination, in progress',
    ]);
  });

  it('should link the paid-feature examples by their public bracket address', () => {
    Object.values(EXAMPLE_BRACKETS).forEach(link => expect(link).toMatch(/^\/bracket\/[0-9a-f-]{36}$/));
  });
});
