<?php
// api/lib/BracketBuilder.php

/**
 * Pure bracket construction — single and double elimination.
 *
 * This class does no I/O: it takes a seed -> team-id map and returns a plain array of
 * match descriptors. Persisting them is the caller's job (TeamController::generateBracket()).
 * The split exists so the bracket *shape* — who plays whom, where winners advance, where
 * losers drop, which slots are byes — can be unit-tested without a database, which is the
 * only practical way to trust it (see FEATURE_TRACKER.md item 16).
 *
 * Forward pointers are returned as *indexes into the returned array*, not database ids,
 * since the ids do not exist until the caller inserts the rows. The array is ordered so
 * that every match appears after the matches that feed it — including losers-bracket
 * feeds — so a single forward pass is enough to simulate or persist a whole bracket.
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

    const SIDE_WINNERS = 'winners';
    const SIDE_LOSERS = 'losers';
    const SIDE_GRAND_FINAL = 'grand_final';

    /**
     * Build a single-elimination bracket.
     *
     * @param array $seedToTeamId Map of seed (1-based, contiguous) => team id.
     * @return array List of match descriptors.
     * @throws InvalidArgumentException when the field is too small or the seeds are gapped.
     */
    public static function singleElimination(array $seedToTeamId): array
    {
        self::validateSeeds($seedToTeamId);

        $numTeams = count($seedToTeamId);
        $bracketSize = self::bracketSizeFor($numTeams);
        $numRounds = self::roundsFor($bracketSize);
        $order = self::seedOrder($bracketSize);

        $matches = array();
        $indexByRound = array();

        // Round 1 carries the actual entrants; every later round starts empty.
        for ($i = 0; $i < $bracketSize; $i += 2) {
            $matchNumber = intdiv($i, 2) + 1;
            $seed1 = $order[$i];
            $seed2 = $order[$i + 1];
            $index = count($matches);
            $matches[$index] = self::descriptor(1, $matchNumber, self::SIDE_WINNERS);
            $matches[$index]['team1_id'] = isset($seedToTeamId[$seed1]) ? (int)$seedToTeamId[$seed1] : null;
            $matches[$index]['team2_id'] = isset($seedToTeamId[$seed2]) ? (int)$seedToTeamId[$seed2] : null;
            $indexByRound[1][$matchNumber] = $index;
        }

        for ($round = 2; $round <= $numRounds; $round++) {
            $count = intdiv($bracketSize, 1 << $round);
            for ($matchNumber = 1; $matchNumber <= $count; $matchNumber++) {
                $index = count($matches);
                $matches[$index] = self::descriptor($round, $matchNumber, self::SIDE_WINNERS);
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
     * Build a double-elimination bracket.
     *
     * Structure for a field rounded up to $bracketSize = 2^k:
     *
     * - Winners bracket: k rounds, identical to single elimination.
     * - Losers bracket: 2k-2 rounds, alternating *minor* rounds (losers-bracket survivors
     *   play each other) and *major* rounds (survivors meet a team just dropped from the
     *   winners bracket). Each major round takes its winners-bracket drops in reversed
     *   order, so a dropped team cannot immediately replay the match that dropped it.
     * - Grand final, plus a reset match. The reset exists structurally but is only played
     *   when the losers-bracket side wins the grand final — at that point both teams have
     *   one loss. Both grand-final participants carry into it: the winner into slot 1, the
     *   loser into slot 2, which is exactly the normal winner/loser edge pair.
     *
     * Byes reach less far into the losers bracket than one might expect. Because seeds are
     * contiguous, every winners round-1 match has at least one entrant, so every later
     * winners match is a real game with a real loser. Only winners round 1 produces byes,
     * and a bye has no loser to drop — so the shortfall touches only the first two losers
     * rounds. Rather than leave walkovers to be resolved at run time, a losers match that
     * can only ever receive one team is removed and its live feeder is routed straight to
     * that match's own target. A losers match that can receive none is removed outright.
     *
     * @param array $seedToTeamId Map of seed (1-based, contiguous) => team id.
     * @return array List of match descriptors.
     * @throws InvalidArgumentException when the field is too small or the seeds are gapped.
     */
    public static function doubleElimination(array $seedToTeamId): array
    {
        self::validateSeeds($seedToTeamId);

        $numTeams = count($seedToTeamId);
        $bracketSize = self::bracketSizeFor($numTeams);
        $numRounds = self::roundsFor($bracketSize);
        $order = self::seedOrder($bracketSize);

        $nodes = array();
        $incoming = array();

        // ------------------------------------------------------------- winners bracket
        $wb = array();
        for ($i = 0; $i < $bracketSize; $i += 2) {
            $matchNumber = intdiv($i, 2) + 1;
            $index = self::addNode($nodes, 1, $matchNumber, self::SIDE_WINNERS, false);
            $seed1 = $order[$i];
            $seed2 = $order[$i + 1];
            $nodes[$index]['team1_id'] = isset($seedToTeamId[$seed1]) ? (int)$seedToTeamId[$seed1] : null;
            $nodes[$index]['team2_id'] = isset($seedToTeamId[$seed2]) ? (int)$seedToTeamId[$seed2] : null;
            $wb[1][$matchNumber] = $index;
        }
        for ($round = 2; $round <= $numRounds; $round++) {
            $count = intdiv($bracketSize, 1 << $round);
            for ($matchNumber = 1; $matchNumber <= $count; $matchNumber++) {
                $wb[$round][$matchNumber] = self::addNode($nodes, $round, $matchNumber, self::SIDE_WINNERS, false);
            }
        }
        for ($round = 1; $round < $numRounds; $round++) {
            foreach ($wb[$round] as $matchNumber => $index) {
                self::link(
                    $nodes, $incoming, $index, 'next',
                    $wb[$round + 1][(int)ceil($matchNumber / 2)],
                    ($matchNumber % 2 === 1) ? 1 : 2
                );
            }
        }

        // -------------------------------------------------------------- losers bracket
        $lb = array();
        $lbRounds = 2 * $numRounds - 2;
        for ($j = 1; $j <= $lbRounds; $j++) {
            $count = intdiv($bracketSize, 1 << ((int)ceil($j / 2) + 1));
            for ($matchNumber = 1; $matchNumber <= $count; $matchNumber++) {
                $lb[$j][$matchNumber] = self::addNode($nodes, $j, $matchNumber, self::SIDE_LOSERS, false);
            }
        }

        if ($lbRounds >= 1) {
            // Winners round 1 supplies both entrants of every losers round 1 match.
            foreach ($wb[1] as $matchNumber => $index) {
                self::link(
                    $nodes, $incoming, $index, 'loser',
                    $lb[1][(int)ceil($matchNumber / 2)],
                    ($matchNumber % 2 === 1) ? 1 : 2
                );
            }

            // Every major (even) losers round absorbs one winners round's losers, taken in
            // reverse order. Without the reversal, the loser of winners match i would drop
            // straight onto the survivor of the very match its own two feeders fell into.
            for ($j = 2; $j <= $lbRounds; $j += 2) {
                $wbRound = intdiv($j, 2) + 1;
                $size = count($lb[$j]);
                foreach ($wb[$wbRound] as $matchNumber => $index) {
                    self::link($nodes, $incoming, $index, 'loser', $lb[$j][$size - $matchNumber + 1], 2);
                }
            }

            for ($j = 1; $j < $lbRounds; $j++) {
                foreach ($lb[$j] as $matchNumber => $index) {
                    if ($j % 2 === 1) {
                        // Minor -> major: same position; slot 2 is reserved for the drop.
                        self::link($nodes, $incoming, $index, 'next', $lb[$j + 1][$matchNumber], 1);
                    } else {
                        // Major -> minor: adjacent pairs converge, as in the winners tree.
                        self::link(
                            $nodes, $incoming, $index, 'next',
                            $lb[$j + 1][(int)ceil($matchNumber / 2)],
                            ($matchNumber % 2 === 1) ? 1 : 2
                        );
                    }
                }
            }
        }

        // ----------------------------------------------------- grand final and its reset
        $grandFinal = self::addNode($nodes, 1, 1, self::SIDE_GRAND_FINAL, false);
        $reset = self::addNode($nodes, 2, 1, self::SIDE_GRAND_FINAL, true);

        self::link($nodes, $incoming, $wb[$numRounds][1], 'next', $grandFinal, 1);
        if ($lbRounds >= 1) {
            self::link($nodes, $incoming, $lb[$lbRounds][1], 'next', $grandFinal, 2);
        } else {
            // Two-team field: there is no losers bracket at all, so the single loss drops
            // directly into the grand final.
            self::link($nodes, $incoming, $wb[$numRounds][1], 'loser', $grandFinal, 2);
        }
        self::link($nodes, $incoming, $grandFinal, 'next', $reset, 1);
        self::link($nodes, $incoming, $grandFinal, 'loser', $reset, 2);

        self::resolve($nodes, $incoming);

        return self::compact($nodes);
    }

    // ------------------------------------------------------------------ shared internals

    /**
     * Walk every node in creation order — which is topological, since a match is always
     * created before anything it feeds — deciding how many entrants it can ever receive
     * and what that makes it.
     */
    private static function resolve(array &$nodes, array &$incoming): void
    {
        $producesWinner = array();
        $producesLoser = array();

        foreach (array_keys($nodes) as $index) {
            $known = 0;
            $possible = 0;
            $liveSlot = null;

            foreach (array(1, 2) as $slot) {
                $column = 'team' . $slot . '_id';
                if ($nodes[$index][$column] !== null) {
                    $known++;
                    $possible++;
                    $liveSlot = $slot;
                    continue;
                }
                if (!isset($incoming[$index][$slot])) {
                    continue;
                }
                $source = $incoming[$index][$slot];
                $delivers = $source['edge'] === 'next'
                    ? !empty($producesWinner[$source['from']])
                    : !empty($producesLoser[$source['from']]);
                if ($delivers) {
                    $possible++;
                    $liveSlot = $slot;
                }
            }

            if ($possible === 0) {
                // Nothing can ever arrive here — every feeder was itself a bye or vacant.
                $nodes[$index]['alive'] = false;
                $producesWinner[$index] = false;
                $producesLoser[$index] = false;
                continue;
            }

            if ($possible === 1 && $known === 1) {
                // A bye: the lone entrant is already known, so it advances without playing.
                if ($nodes[$index]['next'] === null) {
                    throw new LogicException('Refusing to build a bracket whose final is a bye.');
                }
                $winnerId = $nodes[$index]['team1_id'] !== null
                    ? $nodes[$index]['team1_id']
                    : $nodes[$index]['team2_id'];
                $nodes[$index]['status'] = self::STATUS_BYE;
                $nodes[$index]['winner_id'] = $winnerId;

                list($targetIndex, $targetSlot) = $nodes[$index]['next'];
                $nodes[$targetIndex]['team' . $targetSlot . '_id'] = $winnerId;

                $producesWinner[$index] = true;
                $producesLoser[$index] = false;
                continue;
            }

            if ($possible === 1) {
                // A pass-through: exactly one team will ever arrive, but not until an
                // upstream match is played. Drop it and route its one live feeder straight
                // to this match's own target, so no walkover has to be resolved at run time.
                if ($nodes[$index]['next'] === null) {
                    throw new LogicException('Refusing to remove a terminal match.');
                }
                $source = $incoming[$index][$liveSlot];
                list($targetIndex, $targetSlot) = $nodes[$index]['next'];

                $nodes[$index]['alive'] = false;
                unset($incoming[$index]);
                self::link($nodes, $incoming, $source['from'], $source['edge'], $targetIndex, $targetSlot);

                $producesWinner[$index] = false;
                $producesLoser[$index] = false;
                continue;
            }

            $nodes[$index]['status'] = $known === 2 ? self::STATUS_READY : self::STATUS_PENDING;
            $producesWinner[$index] = true;
            $producesLoser[$index] = true;
        }
    }

    /**
     * Drop the removed nodes, renumber the losers bracket so its match numbers stay
     * contiguous within a round, and rewrite node indexes into array indexes.
     */
    private static function compact(array $nodes): array
    {
        $remap = array();
        $kept = array();
        foreach ($nodes as $index => $node) {
            if (!$node['alive']) {
                continue;
            }
            $remap[$index] = count($kept);
            $kept[] = $node;
        }

        $seen = array();
        $matches = array();
        foreach ($kept as $node) {
            // Winners-bracket numbering is positional and never gets holes; the losers
            // bracket can, once pass-through matches are removed.
            $key = $node['bracket_side'] . '|' . $node['round'];
            $seen[$key] = isset($seen[$key]) ? $seen[$key] + 1 : 1;

            $match = self::descriptor($node['round'], $node['match_number'], $node['bracket_side']);
            if ($node['bracket_side'] === self::SIDE_LOSERS) {
                $match['match_number'] = $seen[$key];
            }
            $match['is_reset'] = $node['is_reset'];
            $match['team1_id'] = $node['team1_id'];
            $match['team2_id'] = $node['team2_id'];
            $match['winner_id'] = $node['winner_id'];
            $match['status'] = $node['status'];

            if ($node['next'] !== null && isset($remap[$node['next'][0]])) {
                $match['next_match'] = $remap[$node['next'][0]];
                $match['next_match_slot'] = $node['next'][1];
            }
            if ($node['loser'] !== null && isset($remap[$node['loser'][0]])) {
                $match['loser_match'] = $remap[$node['loser'][0]];
                $match['loser_match_slot'] = $node['loser'][1];
            }

            $matches[] = $match;
        }

        return $matches;
    }

    private static function descriptor(int $round, int $matchNumber, string $side): array
    {
        return array(
            'round' => $round,
            'match_number' => $matchNumber,
            'bracket_side' => $side,
            'is_reset' => false,
            'team1_id' => null,
            'team2_id' => null,
            'winner_id' => null,
            'status' => self::STATUS_PENDING,
            'next_match' => null,
            'next_match_slot' => null,
            'loser_match' => null,
            'loser_match_slot' => null,
        );
    }

    private static function addNode(array &$nodes, int $round, int $matchNumber, string $side, bool $isReset): int
    {
        $index = count($nodes);
        $nodes[$index] = array(
            'round' => $round,
            'match_number' => $matchNumber,
            'bracket_side' => $side,
            'is_reset' => $isReset,
            'team1_id' => null,
            'team2_id' => null,
            'winner_id' => null,
            'status' => self::STATUS_PENDING,
            'next' => null,
            'loser' => null,
            'alive' => true,
        );
        return $index;
    }

    /** Point one of $from's two outgoing edges at a slot of $to, keeping the reverse map in step. */
    private static function link(array &$nodes, array &$incoming, int $from, string $edge, int $to, int $slot): void
    {
        $nodes[$from][$edge] = array($to, $slot);
        $incoming[$to][$slot] = array('from' => $from, 'edge' => $edge);
    }

    private static function validateSeeds(array $seedToTeamId): void
    {
        $numTeams = count($seedToTeamId);
        if ($numTeams < 2) {
            throw new InvalidArgumentException(
                'A bracket needs at least 2 teams; got ' . $numTeams . '.'
            );
        }

        // Seeds must be a contiguous 1..N run. A gap would be read as an empty bracket
        // position — an implicit extra bye — which silently reshuffles who plays whom
        // rather than just shrinking the field. TeamController::delete() renumbers seeds to
        // preserve this; anything that does not is a bug worth surfacing loudly.
        for ($seed = 1; $seed <= $numTeams; $seed++) {
            if (!isset($seedToTeamId[$seed])) {
                throw new InvalidArgumentException(
                    'Team seeds must be contiguous starting at 1; seed ' . $seed . ' is missing.'
                );
            }
        }
    }

    private static function bracketSizeFor(int $numTeams): int
    {
        $size = 1;
        while ($size < $numTeams) {
            $size *= 2;
        }
        return $size;
    }

    private static function roundsFor(int $bracketSize): int
    {
        $rounds = 0;
        while ((1 << $rounds) < $bracketSize) {
            $rounds++;
        }
        return $rounds;
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
