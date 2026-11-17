<?php
// api/lib/SoloTeam.php

/**
 * Odd player handling (FEATURE_TRACKER item 19): a team of one, whose partner is a "ghost".
 *
 * A blind draw with an odd number of players pairs the odd one out with nobody
 * (teams.participant2_id NULL, migration 023) instead of refusing the draw. The bracket shows
 * the team as "Sam (solo)", and the tournament's ghost rule tells players how it plays. The
 * organizer can swap a latecomer into the empty slot until the team's first game is scored.
 *
 * Pure: names and rule validation only. TeamController and ParticipantController persist.
 * The frontend mirrors defaultName() in shared/bracket-labels.ts teamParticipants() and the
 * rule wording in shared/solo-team.ts. Keep them in step.
 *
 * Targets PHP 8.1+, as does the rest of `api/` (see AGENTS.md).
 */
final class SoloTeam
{
    /** The free rule: the solo player throws both turns, walking between ends. */
    const FREE_RULE = 'walk';
    const RULES = ['walk', 'four_bags', 'sub', 'custom'];
    const MAX_TEXT = 120;
    const PAID_MESSAGE = 'Choosing how a solo player plays is a Pro feature. Upgrade, or keep the walk rule.';

    /**
     * The name a team gets until the organizer renames it: "Ann & Bob", or "Sam (solo)" for a
     * team whose partner is a ghost. Renaming a player refreshes a team still carrying this.
     */
    public static function defaultName(string $player1, ?string $player2): string
    {
        return $player2 === null ? "$player1 (solo)" : "$player1 & $player2";
    }

    public static function requiresPaidPlan(string $rule): bool
    {
        return $rule !== self::FREE_RULE;
    }

    /**
     * Validates a rule and its text, returning the pair to store, or an error message.
     * Only `custom` keeps text; any other rule clears it, so a stale house rule can't
     * resurface if the organizer later switches back to custom without retyping it.
     *
     * @return array{rule: string, text: ?string}|string
     */
    public static function normalizeRule(mixed $rule, mixed $text): array|string
    {
        if (!is_string($rule) || !in_array($rule, self::RULES, true)) {
            return 'Unknown rule for a solo player';
        }
        if ($rule !== 'custom') {
            return ['rule' => $rule, 'text' => null];
        }
        $text = is_string($text) ? trim(preg_replace('/\s+/', ' ', $text)) : '';
        if ($text === '') {
            return 'Write the house rule for a solo player';
        }
        if (mb_strlen($text) > self::MAX_TEXT) {
            return 'Keep the house rule to ' . self::MAX_TEXT . ' characters';
        }
        return ['rule' => 'custom', 'text' => $text];
    }
}
