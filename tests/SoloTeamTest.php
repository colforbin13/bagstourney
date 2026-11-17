<?php
// tests/SoloTeamTest.php

use PHPUnit\Framework\TestCase;

/**
 * Covers api/lib/SoloTeam.php: the name a team of one gets, and the ghost rule an organizer
 * can choose. The default name matters beyond display: ParticipantController only refreshes a
 * team's name on a player rename while it still equals this, so a mismatch would strand
 * "Sam (solo)" after Sam's name is corrected.
 */
final class SoloTeamTest extends TestCase
{
    public function testAPairIsNamedForBothPlayers(): void
    {
        $this->assertSame('Ann & Bob', SoloTeam::defaultName('Ann', 'Bob'));
    }

    public function testATeamOfOneIsMarkedSolo(): void
    {
        $this->assertSame('Sam (solo)', SoloTeam::defaultName('Sam', null));
    }

    public function testOnlyWalkingIsFree(): void
    {
        $this->assertFalse(SoloTeam::requiresPaidPlan('walk'));
        foreach (['four_bags', 'sub', 'custom'] as $rule) {
            $this->assertTrue(SoloTeam::requiresPaidPlan($rule), $rule);
        }
    }

    public function testEveryRuleButCustomDropsText(): void
    {
        foreach (['walk', 'four_bags', 'sub'] as $rule) {
            $this->assertSame(['rule' => $rule, 'text' => null], SoloTeam::normalizeRule($rule, 'left over'));
        }
    }

    public function testACustomRuleKeepsTidiedText(): void
    {
        $this->assertSame(
            ['rule' => 'custom', 'text' => 'Solo throws 6 bags'],
            SoloTeam::normalizeRule('custom', "  Solo   throws\n6 bags "),
        );
    }

    public function testACustomRuleNeedsText(): void
    {
        $this->assertIsString(SoloTeam::normalizeRule('custom', '   '));
        $this->assertIsString(SoloTeam::normalizeRule('custom', null));
    }

    public function testACustomRuleIsKeptShort(): void
    {
        $this->assertIsArray(SoloTeam::normalizeRule('custom', str_repeat('x', SoloTeam::MAX_TEXT)));
        $this->assertIsString(SoloTeam::normalizeRule('custom', str_repeat('x', SoloTeam::MAX_TEXT + 1)));
    }

    public function testAnUnknownRuleIsRefused(): void
    {
        $this->assertIsString(SoloTeam::normalizeRule('forfeit', null));
        $this->assertIsString(SoloTeam::normalizeRule(null, null));
    }
}
