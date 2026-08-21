<?php
// api/lib/BracketBuilder.php

/**
 * Pure single-elimination bracket construction.
 *
 * This class does no I/O: it takes a seed -> team-id map and returns a plain array of
 * match descriptors. Persisting them is the caller's job (TeamController::generateBracket()).
 * The split exists so the bracket *shape* — who plays whom, where winners advance, which
 * first-round slots are byes — can be unit-tested without a database, which is the only
 * practical way to trust it once double elimination adds a second forward edge per match
 * (see FEATURE_TRACKER.md item 16).
 *
 * Forward pointers are returned as *indexes into the returned array*, not database ids,
 * since the ids do not exist until the caller inserts the rows. The array is ordered by
 * round then match number, so every match appears after the matches that feed it.
 *
 * PHP 7.2-compatible: production still runs 7.2 (see AGENTS.md).
 */
final class BracketBuilder
{
    /** Both entrants known — the match can be played. */
    const STATUS_READY = 'ready';
    /** Waiting on at least one earlier match to produce an entrant. */
    const STATUS_PENDING = 'pending';
    /** One entrant and no opponent possible — auto-advances without being played. */
    const STATUS_BYE = 'bye';

    /**
     * Build a single-elimination bracket.
     *
     * @param array $seedToTeamId Map of seed (1-based, contiguous) => team id.
     * @return array List of match descriptors with keys: round, match_number, team1_id,
     *               team2_id, winner_id, status, next_match (index or null),
     *               next_match_slot (1, 2, or null).
     * @throws InvalidArgumentException when the field is too small or the seeds are gapped.
     */
    public static function singleElimination(array $seedToTeamId): array
    {
        $numTeams = count($seedToTeamId);
        if ($numTeams < 2) {
            throw new InvalidArgumentException(
                'A bracket needs at least 2 teams; got ' . $numTeams . '.'
            );
        }

        // Seeds must be a contiguous 1..N run. A gap would be read below as an empty
        // bracket position — an implicit extra bye — which silently reshuffles who plays
        // whom rather than just shrinking the field. TeamController::delete() renumbers
        // seeds to preserve this; anything that does not is a bug worth surfacing loudly.
        for ($seed = 1; $seed <= $numTeams; $seed++) {
            if (!isset($seedToTeamId[$seed])) {
                throw new InvalidArgumentException(
                    'Team seeds must be contiguous starting at 1; seed ' . $seed . ' is missing.'
                );
            }
        }

        // Round the field up to a power of two; the unfilled positions become first-round byes.
        $bracketSize = 1;
        while ($bracketSize < $numTeams) {
            $bracketSize *= 2;
        }
        $numRounds = 0;
        while ((1 << $numRounds) < $bracketSize) {
            $numRounds++;
        }

        $order = self::seedOrder($bracketSize);

        $matches = array();
        $indexByRound = array();

        // Round 1 carries the actual entrants; every later round starts empty.
        for ($i = 0; $i < $bracketSize; $i += 2) {
            $matchNumber = intdiv($i, 2) + 1;
            $seed1 = $order[$i];
            $seed2 = $order[$i + 1];
            $index = count($matches);
            $matches[$index] = array(
                'round' => 1,
                'match_number' => $matchNumber,
                'team1_id' => isset($seedToTeamId[$seed1]) ? (int)$seedToTeamId[$seed1] : null,
                'team2_id' => isset($seedToTeamId[$seed2]) ? (int)$seedToTeamId[$seed2] : null,
                'winner_id' => null,
                'status' => self::STATUS_PENDING,
                'next_match' => null,
                'next_match_slot' => null,
            );
            $indexByRound[1][$matchNumber] = $index;
        }

        for ($round = 2; $round <= $numRounds; $round++) {
            $count = intdiv($bracketSize, 1 << $round);
            for ($matchNumber = 1; $matchNumber <= $count; $matchNumber++) {
                $index = count($matches);
                $matches[$index] = array(
                    'round' => $round,
                    'match_number' => $matchNumber,
                    'team1_id' => null,
                    'team2_id' => null,
                    'winner_id' => null,
                    'status' => self::STATUS_PENDING,
                    'next_match' => null,
                    'next_match_slot' => null,
                );
                $indexByRound[$round][$matchNumber] = $index;
            }
        }

        // Winner of match N drops into slot 1 or 2 of match ceil(N/2) in the next round,
        // so adjacent pairs converge and the tree collapses to a single final.
        for ($round = 1; $round < $numRounds; $round++) {
            foreach ($indexByRound[$round] as $matchNumber => $index) {
                $matches[$index]['next_match'] = $indexByRound[$round + 1][(int)ceil($matchNumber / 2)];
                $matches[$index]['next_match_slot'] = ($matchNumber % 2 === 1) ? 1 : 2;
            }
        }

        // Resolve statuses in round order so a bye's winner is already in place by the
        // time the round it advances into is examined.
        for ($round = 1; $round <= $numRounds; $round++) {
            foreach ($indexByRound[$round] as $matchNumber => $index) {
                $team1 = $matches[$index]['team1_id'];
                $team2 = $matches[$index]['team2_id'];
                $filled = ($team1 !== null ? 1 : 0) + ($team2 !== null ? 1 : 0);

                if ($filled === 2) {
                    $matches[$index]['status'] = self::STATUS_READY;
                    continue;
                }
                if ($filled === 0) {
                    continue; // Both entrants still to be decided upstream.
                }

                // Exactly one entrant. That is only a bye if no feeder can still deliver an
                // opponent; otherwise the empty slot is simply waiting on an earlier round.
                if (self::openFeederCount($matches, $indexByRound, $round, $matchNumber) > 0) {
                    continue;
                }

                if ($matches[$index]['next_match'] === null) {
                    // Unreachable with >= 2 contiguous seeds: a bye needs one feeder decided
                    // and the other still open, which is never true of the final. Guarding
                    // rather than silently crowning a champion who never played.
                    throw new LogicException('Refusing to build a bracket whose final is a bye.');
                }

                $winnerId = $team1 !== null ? $team1 : $team2;
                $matches[$index]['status'] = self::STATUS_BYE;
                $matches[$index]['winner_id'] = $winnerId;

                $nextIndex = $matches[$index]['next_match'];
                $slotColumn = $matches[$index]['next_match_slot'] === 1 ? 'team1_id' : 'team2_id';
                $matches[$nextIndex][$slotColumn] = $winnerId;
            }
        }

        return $matches;
    }

    /**
     * How many of a match's feeder matches have not yet produced a winner.
     *
     * Feeders are the two matches in the previous round that converge on this one. Round 1
     * has none. Only called while walking rounds in ascending order, so a feeder's
     * winner_id is already final by the time it is inspected here.
     */
    private static function openFeederCount(array $matches, array $indexByRound, int $round, int $matchNumber): int
    {
        if ($round <= 1 || !isset($indexByRound[$round - 1])) {
            return 0;
        }
        $open = 0;
        foreach (array($matchNumber * 2 - 1, $matchNumber * 2) as $feederNumber) {
            if (!isset($indexByRound[$round - 1][$feederNumber])) {
                continue;
            }
            if ($matches[$indexByRound[$round - 1][$feederNumber]]['winner_id'] === null) {
                $open++;
            }
        }
        return $open;
    }

    /**
     * Standard single-elimination seeding order for a bracket of $size (a power of two),
     * as a permutation of seeds 1..$size in bracket-position order. Built recursively so
     * that seeds 1 and 2 can only meet in the final, {1,2} and {3,4} only in the semifinal,
     * and so on — i.e. top seeds land in opposite halves rather than being paired
     * sequentially. Read in consecutive pairs, it gives the first round's matchups.
     */
    private static function seedOrder(int $size): array
    {
        if ($size <= 1) {
            return array(1);
        }
        $order = array();
        foreach (self::seedOrder(intdiv($size, 2)) as $seed) {
            $order[] = $seed;
            $order[] = $size + 1 - $seed;
        }
        return $order;
    }
}
