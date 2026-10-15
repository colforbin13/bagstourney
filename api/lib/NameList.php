<?php
// api/lib/NameList.php

/**
 * Turns a pasted block of text into a clean list of player names, for blind-draw setup.
 *
 * Pure: takes strings, returns arrays. Persisting the result is
 * ParticipantController::bulkCreate()'s job.
 *
 * Organizers paste from wherever their sign-up sheet lives — a notes app, a spreadsheet
 * column, a group text — so the parser accepts the shapes those produce:
 *
 * - one name per line (the common case),
 * - tab-separated cells (a spreadsheet row),
 * - a single line of comma- or semicolon-separated names ("Ann, Bob, Cara").
 *
 * Commas only split a paste that is a single line. Once there is more than one line, each
 * line is one name, so "Smith, John" pasted one-per-line stays a single person.
 *
 * The frontend mirrors these rules in shared/name-list.ts for its live preview; the server
 * result is what actually gets saved, and the response reports it.
 *
 * Targets PHP 8.1+, as does the rest of `api/` (see AGENTS.md).
 */
final class NameList
{
    /** Matches participants.name VARCHAR(255). */
    const MAX_NAME_LENGTH = 255;

    /**
     * Leading list markers people paste along with the names: "1.", "2)", "-", "*", "•".
     * A digit only counts as a marker when punctuation follows it, so a name that starts
     * with a number is left alone.
     */
    private const MARKER = '/^(?:\d{1,3}[.)]|[-*•·–])\s*/u';

    /**
     * @param string   $text     The pasted text.
     * @param string[] $existing Names already on the roster; matches are skipped, not added.
     * @return array{names: string[], duplicates: string[], too_long: string[]}
     *         `names` in paste order, ready to insert. `duplicates` repeats of a name already
     *         on the roster or earlier in the paste, as pasted. `too_long` names over
     *         MAX_NAME_LENGTH, which are reported rather than silently truncated.
     */
    public static function parse(string $text, array $existing = []): array
    {
        $seen = [];
        foreach ($existing as $name) {
            $seen[self::key((string)$name)] = true;
        }

        $names = [];
        $duplicates = [];
        $tooLong = [];

        foreach (self::split($text) as $raw) {
            $name = self::clean($raw);
            if ($name === '') continue;

            if (mb_strlen($name) > self::MAX_NAME_LENGTH) {
                $tooLong[] = $name;
                continue;
            }

            $key = self::key($name);
            if (isset($seen[$key])) {
                $duplicates[] = $name;
                continue;
            }
            $seen[$key] = true;
            $names[] = $name;
        }

        return ['names' => $names, 'duplicates' => $duplicates, 'too_long' => $tooLong];
    }

    /** @return string[] Raw entries, not yet cleaned. */
    private static function split(string $text): array
    {
        $lines = preg_split('/\r\n|\r|\n|\t/u', $text) ?: [];
        $nonEmpty = array_values(array_filter($lines, fn($l) => trim($l) !== ''));

        if (count($nonEmpty) === 1) {
            return preg_split('/[,;]/u', $nonEmpty[0]) ?: [];
        }
        return $lines;
    }

    private static function clean(string $raw): string
    {
        // Collapse runs of whitespace, including non-breaking spaces that copy out of web
        // pages and spreadsheets, before looking for a list marker.
        $name = trim(preg_replace('/[\s\x{00A0}\x{200B}]+/u', ' ', $raw) ?? '');
        $name = preg_replace(self::MARKER, '', $name) ?? $name;
        return trim($name);
    }

    /** Case- and spacing-insensitive identity, so "ann  smith" repeats "Ann Smith". */
    private static function key(string $name): string
    {
        return mb_strtolower(self::clean($name));
    }
}
