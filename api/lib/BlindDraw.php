<?php
// api/lib/BlindDraw.php

/**
 * Pairs a tournament's players into two-player teams, for TeamController::draw().
 *
 * Pure: takes participant rows, returns pairs. Persisting the teams is the controller's job.
 *
 * Two modes, chosen by tournaments.draw_mode (migration 021):
 *
 * - 'random' (the default): a plain blind draw. Shuffle everyone, pair them in order.
 * - 'balanced': the A/B, or "50/50", draw. The organizer tags their stronger half as A
 *   (participants.draw_group; everyone else is B) and every A is paired with a random B,
 *   so the weakest players can't land on the same team. Organizers ask for it because a
 *   small field's skill is lopsided, and a fully random draw there regularly produces one
 *   stacked team and one hopeless one.
 *
 * A balanced draw with unequal groups doesn't fail. It pairs as many A-with-B teams as it
 * can, then pairs whoever is left over within their group. A night with 14 strong players
 * and 12 others still gets drawn (12 mixed teams, one A-A team) instead of turning the
 * organizer away at the door; the page shows the counts so they can even them out first.
 *
 * Either way the team order is random, and that order is the seed order, as it always was.
 *
 * An odd field doesn't fail either (FEATURE_TRACKER item 19). The odd player out gets a ghost
 * partner: their pair's second entry is null, and the controller stores a team of one. In a
 * balanced draw the ghost joins the smaller group, which is the same as pairing one leftover
 * player from the larger group with nobody, so every other team stays A-with-B. The solo team
 * lands at a random seed, like any other.
 *
 * The free generator (frontend shared/blind-draw.ts) mirrors this pairing. Keep them in step.
 *
 * Targets PHP 8.1+, as does the rest of `api/` (see AGENTS.md).
 */
final class BlindDraw
{
    const MODES = ['random', 'balanced'];
    const GROUPS = ['A', 'B'];

    /**
     * @param array<int, array<string, mixed>> $players participant rows; 'balanced' reads each
     *        row's 'draw_group' ('A' or 'B', anything else counts as B)
     * @param callable(int): int|null $randomInt returns an integer in [0, $max]; defaults to
     *        random_int, a CSPRNG, so nobody can predict or reproduce the draw
     * @return array<int, array{0: array<string, mixed>, 1: array<string, mixed>|null}> pairs in
     *         seed order. With an odd field exactly one pair is [player, null]: a solo team.
     */
    public static function pair(array $players, string $mode = 'random', ?callable $randomInt = null): array
    {
        $randomInt ??= static fn(int $max): int => random_int(0, $max);
        $players = array_values($players);

        if ($mode !== 'balanced') {
            $pairs = self::chunk(self::shuffle($players, $randomInt));
            // Pairing in shuffled order leaves the solo team last, which is always the bottom
            // seed and never gets a bye. Shuffle the teams too, only when there is one, so an
            // even draw comes out exactly as it always has.
            return count($players) % 2 === 1 ? self::shuffle($pairs, $randomInt) : $pairs;
        }

        $a = [];
        $b = [];
        foreach ($players as $player) {
            if (($player['draw_group'] ?? 'B') === 'A') {
                $a[] = $player;
            } else {
                $b[] = $player;
            }
        }
        $a = self::shuffle($a, $randomInt);
        $b = self::shuffle($b, $randomInt);

        $mixed = min(count($a), count($b));
        $pairs = [];
        for ($i = 0; $i < $mixed; $i++) {
            $pairs[] = [$a[$i], $b[$i]];
        }
        // Whoever is left is all one group: pair them with each other.
        $leftover = count($a) > $mixed ? array_slice($a, $mixed) : array_slice($b, $mixed);
        $pairs = array_merge($pairs, self::chunk($leftover));

        return self::shuffle($pairs, $randomInt);
    }

    /** Fisher-Yates, on a copy. */
    private static function shuffle(array $items, callable $randomInt): array
    {
        for ($i = count($items) - 1; $i > 0; $i--) {
            $j = $randomInt($i);
            [$items[$i], $items[$j]] = [$items[$j], $items[$i]];
        }
        return $items;
    }

    /** Pairs in order; an odd one out at the end is paired with a ghost (null). */
    private static function chunk(array $players): array
    {
        $pairs = [];
        for ($i = 0; $i < count($players); $i += 2) {
            $pairs[] = [$players[$i], $players[$i + 1] ?? null];
        }
        return $pairs;
    }
}
