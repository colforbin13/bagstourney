<?php
// tests/BlindDrawTest.php

use PHPUnit\Framework\TestCase;

/**
 * Covers the team pairing behind TeamController::draw().
 *
 * The balanced (A/B) draw's whole promise is "every A gets a B". A slip doesn't error, it
 * quietly puts two strong players together, which is exactly what the organizer turned the
 * option on to prevent. So most of these run many draws and check every team.
 */
final class BlindDrawTest extends TestCase
{
    private static function players(int $a, int $b): array
    {
        $rows = [];
        for ($i = 1; $i <= $a; $i++) $rows[] = ['id' => $i, 'name' => "A$i", 'draw_group' => 'A'];
        for ($i = 1; $i <= $b; $i++) $rows[] = ['id' => 100 + $i, 'name' => "B$i", 'draw_group' => 'B'];
        return $rows;
    }

    private static function ids(array $pairs): array
    {
        $ids = [];
        foreach ($pairs as [$p, $q]) { $ids[] = $p['id']; $ids[] = $q['id']; }
        sort($ids);
        return $ids;
    }

    public function testRandomDrawPairsEveryoneExactlyOnce(): void
    {
        $players = self::players(5, 7);
        $pairs = BlindDraw::pair($players);
        $this->assertCount(6, $pairs);
        $this->assertSame(array_column($players, 'id'), self::ids($pairs));
    }

    public function testRandomDrawIgnoresGroups(): void
    {
        // A fixed "random" that never swaps leaves the input order, so pairs are A1+A2 etc.
        $pairs = BlindDraw::pair(self::players(2, 2), 'random', fn(int $max) => $max);
        $this->assertSame(['A1', 'A2'], [$pairs[0][0]['name'], $pairs[0][1]['name']]);
    }

    public function testAnUnknownModeIsAPlainDraw(): void
    {
        $pairs = BlindDraw::pair(self::players(2, 2), 'nonsense', fn(int $max) => $max);
        $this->assertSame(['A1', 'A2'], [$pairs[0][0]['name'], $pairs[0][1]['name']]);
    }

    public function testBalancedDrawPairsEveryAWithAB(): void
    {
        for ($run = 0; $run < 200; $run++) {
            $pairs = BlindDraw::pair(self::players(8, 8), 'balanced');
            $this->assertCount(8, $pairs);
            foreach ($pairs as [$first, $second]) {
                $this->assertSame('A', $first['draw_group']);
                $this->assertSame('B', $second['draw_group']);
            }
        }
    }

    public function testBalancedDrawWithMoreAsPairsTheExtraAsTogether(): void
    {
        // The Reddit case: 14 strong players, 12 others.
        $players = self::players(14, 12);
        for ($run = 0; $run < 100; $run++) {
            $pairs = BlindDraw::pair($players, 'balanced');
            $this->assertCount(13, $pairs);
            $this->assertSame(array_column($players, 'id'), self::ids($pairs));
            $kinds = array_map(fn($p) => $p[0]['draw_group'] . $p[1]['draw_group'], $pairs);
            $this->assertSame(['AA' => 1, 'AB' => 12], self::tally($kinds));
        }
    }

    public function testBalancedDrawWithMoreBsPairsTheExtraBsTogether(): void
    {
        $pairs = BlindDraw::pair(self::players(3, 7), 'balanced');
        $kinds = array_map(fn($p) => $p[0]['draw_group'] . $p[1]['draw_group'], $pairs);
        $this->assertSame(['AB' => 3, 'BB' => 2], self::tally($kinds));
    }

    public function testUntaggedPlayersCountAsB(): void
    {
        // Three As and three players who aren't tagged A in various ways: missing, null, junk.
        $players = [
            ['id' => 1, 'draw_group' => 'A'], ['id' => 2], ['id' => 3, 'draw_group' => 'A'],
            ['id' => 4, 'draw_group' => null], ['id' => 5, 'draw_group' => 'C'], ['id' => 6, 'draw_group' => 'A'],
        ];
        for ($run = 0; $run < 50; $run++) {
            foreach (BlindDraw::pair($players, 'balanced') as $pair) {
                $as = count(array_filter($pair, fn($p) => ($p['draw_group'] ?? null) === 'A'));
                $this->assertSame(1, $as);
            }
        }
    }

    public function testNobodyTaggedIsStillAFullDraw(): void
    {
        $pairs = BlindDraw::pair(self::players(0, 6), 'balanced');
        $this->assertCount(3, $pairs);
    }

    public function testBalancedDrawVariesPartnersAndSeeds(): void
    {
        // Not a statistics test, just a guard against a draw that stopped shuffling a side
        // or the team order: across many draws A1 should meet several Bs and hold several seeds.
        $partners = [];
        $seeds = [];
        for ($run = 0; $run < 200; $run++) {
            foreach (BlindDraw::pair(self::players(4, 4), 'balanced') as $seed => [$a, $b]) {
                if ($a['name'] === 'A1') { $partners[$b['name']] = true; $seeds[$seed] = true; }
            }
        }
        $this->assertCount(4, $partners);
        $this->assertCount(4, $seeds);
    }

    public function testTheLeftoverTeamIsNotAlwaysTheBottomSeed(): void
    {
        // Same-group leftovers are paired last; the team order still has to be shuffled
        // afterwards, or the A-A team would always be seeded at the bottom.
        $seeds = [];
        $leftoverBs = [];
        for ($run = 0; $run < 200; $run++) {
            foreach (BlindDraw::pair(self::players(3, 7), 'balanced') as $seed => [$p, $q]) {
                if ($p['draw_group'] === 'B') {
                    $seeds[$seed] = true;
                    $leftoverBs[$p['name']] = $leftoverBs[$q['name']] = true;
                }
            }
        }
        $this->assertGreaterThan(2, count($seeds));
        // And which Bs are left over must be random too, not always the last ones listed.
        $this->assertCount(7, $leftoverBs);
    }

    public function testAnOddPlayerOutIsLeftUnpaired(): void
    {
        $this->assertCount(2, BlindDraw::pair(self::players(0, 5)));
        $this->assertCount(2, BlindDraw::pair(self::players(1, 4), 'balanced'));
    }

    private static function tally(array $kinds): array
    {
        $counts = array_count_values($kinds);
        ksort($counts);
        return $counts;
    }
}
