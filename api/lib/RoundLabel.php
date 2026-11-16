<?php
// api/lib/RoundLabel.php
//
// Round names for server-rendered text (notification emails). Mirrors roundLabel() in
// frontend/src/app/shared/bracket-labels.ts — keep the two in step, so an email never
// names a round differently from the bracket it links to.
//
// Pure: callers pass in the stored round numbers of one bracket side and get text back.

final class RoundLabel
{
    /**
     * Name of a round by its 1-based position within its side, counted back from the end.
     *
     * Position, not the stored `round` column: a losers bracket whose first round collapsed
     * away (whenever the field has byes) starts at round 2, and labelling by position hides
     * that gap.
     */
    public static function label(int $pos, int $total, string $side = 'winners', string $format = 'single'): string
    {
        if ($side === 'grand_final') {
            return $pos === 1 ? 'Grand final' : 'Deciding match';
        }

        $fromEnd = $total - $pos;

        if ($format !== 'double') {
            if ($fromEnd === 0) return 'Final';
            if ($fromEnd === 1) return 'Semifinal';
            if ($fromEnd === 2) return 'Quarterfinal';
            return "Round {$pos}";
        }

        $prefix = $side === 'losers' ? 'Losers' : 'Winners';
        if ($fromEnd === 0) return "{$prefix} final";
        if ($fromEnd === 1) return "{$prefix} semifinal";
        return "{$prefix} round {$pos}";
    }

    /**
     * Name of a stored round number, given every stored round number on the same side.
     *
     * @param int[] $roundsInSide
     */
    public static function forRound(int $round, array $roundsInSide, string $side = 'winners', string $format = 'single'): string
    {
        $rounds = self::normalise($roundsInSide);
        $index = array_search($round, $rounds, true);
        if ($index === false) {
            // Not a round this side has; say what is stored rather than guess a name.
            return "Round {$round}";
        }
        return self::label($index + 1, count($rounds), $side, $format);
    }

    /**
     * The stored round number that follows $round on the same side, or null after the last.
     * Not simply $round + 1: a collapsed losers round leaves a gap in the numbering.
     *
     * @param int[] $roundsInSide
     */
    public static function nextRound(int $round, array $roundsInSide): ?int
    {
        foreach (self::normalise($roundsInSide) as $r) {
            if ($r > $round) return $r;
        }
        return null;
    }

    /** @param int[] $rounds */
    private static function normalise(array $rounds): array
    {
        $rounds = array_values(array_unique(array_map('intval', $rounds)));
        sort($rounds);
        return $rounds;
    }
}
