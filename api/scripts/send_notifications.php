<?php
// api/scripts/send_notifications.php
//
// Worker for FEATURE_TRACKER.md item 1 (score-update notifications). Run on a schedule
// (Windows Scheduled Task hitting the deployed host — see FEATURE_TRACKER.md, this repo
// has no persistent worker process or cron). Not wired into api/index.php; CLI only.
// Recommended interval: every 2-5 minutes, since the double opt-in confirmation email
// goes through this same queue rather than sending synchronously.
//
//   php api/scripts/send_notifications.php
//
// Processes pending rows in notification_queue, one of four event types: confirmation
// (double opt-in), match_completed, round_completed, tournament_finalized. Enqueueing is
// done elsewhere (ParticipantController::setNotificationEmail(), MatchController's three
// enqueue*Notifications() helpers) — this script only sends what's already queued.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("This script may only be run from the command line.\n");
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/PostmarkClient.php';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

$db = getDB();
$postmark = new PostmarkClient(POSTMARK_API_TOKEN, POSTMARK_FROM_EMAIL, POSTMARK_MESSAGE_STREAM);

if (!$postmark->isConfigured()) {
    fwrite(STDERR, "Postmark is not configured (POSTMARK_API_TOKEN/POSTMARK_FROM_EMAIL); nothing to do.\n");
    exit(0);
}

$stmt = $db->prepare('
    SELECT * FROM notification_queue
    WHERE status = "pending" AND attempts < ?
    ORDER BY created_at ASC
    LIMIT ?
');
$stmt->bindValue(1, MAX_ATTEMPTS, PDO::PARAM_INT);
$stmt->bindValue(2, BATCH_SIZE, PDO::PARAM_INT);
$stmt->execute();
$rows = $stmt->fetchAll();

$sent = 0;
$skipped = 0;
$failed = 0;

foreach ($rows as $row) {
    $result = processRow($db, $postmark, $row);
    if ($result === 'sent') $sent++;
    elseif ($result === 'skipped') $skipped++;
    else $failed++;
}

echo "Processed " . count($rows) . " queued notification(s): {$sent} sent, {$skipped} skipped, {$failed} failed.\n";

function processRow(PDO $db, PostmarkClient $postmark, array $row): string {
    $id = (int)$row['id'];

    $suppressed = $db->prepare('SELECT 1 FROM notification_suppressions WHERE email = ?');
    $suppressed->execute([$row['email']]);
    if ($suppressed->fetchColumn()) {
        markTerminal($db, $row, 'skipped', 'Address is suppressed');
        return 'skipped';
    }

    $participantStmt = $db->prepare('
        SELECT id, notification_lifecycle, notification_manage_token_version,
               notify_match_completed, notify_round_completed, notify_tournament_finalized
        FROM participants WHERE id = ?
    ');
    $participantStmt->execute([$row['participant_id']]);
    $participant = $participantStmt->fetch();

    if (!$participant) {
        markTerminal($db, $row, 'skipped', 'Participant no longer exists');
        return 'skipped';
    }

    if ($row['event_type'] === 'confirmation') {
        if ($participant['notification_lifecycle'] !== 'pending') {
            markTerminal($db, $row, 'skipped', 'Participant is no longer pending confirmation');
            return 'skipped';
        }
    } else {
        // Re-checked here too (not just at enqueue time in MatchController) in case a
        // category was disabled after this row was already queued.
        $categoryEnabled = [
            'match_completed' => NOTIFY_MATCH_COMPLETED_ENABLED,
            'round_completed' => NOTIFY_ROUND_COMPLETED_ENABLED,
            'tournament_finalized' => NOTIFY_TOURNAMENT_FINALIZED_ENABLED,
        ];
        if (empty($categoryEnabled[$row['event_type']])) {
            markTerminal($db, $row, 'skipped', 'This notification category is currently disabled');
            return 'skipped';
        }

        $categoryColumn = NOTIFICATION_CATEGORY_COLUMNS[$row['event_type']] ?? null;
        if ($participant['notification_lifecycle'] !== 'confirmed') {
            markTerminal($db, $row, 'skipped', 'Participant is not a confirmed subscriber');
            return 'skipped';
        }
        // Re-checked at send time (not just at enqueue time) since the participant may
        // have unsubscribed from this specific category in between.
        if ($categoryColumn && !$participant[$categoryColumn]) {
            markTerminal($db, $row, 'skipped', 'Participant has unsubscribed from this category');
            return 'skipped';
        }
    }

    $content = buildEmailContent($db, $row, $participant);
    if ($content === null) {
        markTerminal($db, $row, 'skipped', 'Referenced match/tournament no longer exists');
        return 'skipped';
    }

    $result = $postmark->send($row['email'], $content['subject'], $content['html'], $content['text'], $row['event_type']);

    if ($result['success']) {
        $db->prepare('
            UPDATE notification_queue
            SET status = "sent", sent_at = NOW(), postmark_message_id = ?,
                token_plaintext = NULL, last_error = NULL
            WHERE id = ?
        ')->execute([$result['message_id'], $id]);
        return 'sent';
    }

    $attempts = (int)$row['attempts'] + 1;
    if ($attempts >= MAX_ATTEMPTS) {
        markTerminal($db, $row, 'failed', $result['error'], $attempts);
        return 'failed';
    }

    $db->prepare('UPDATE notification_queue SET attempts = ?, last_error = ? WHERE id = ?')
        ->execute([$attempts, $result['error'], $id]);
    return 'skipped';
}

// Moves a row to a terminal state (skipped or failed) and clears any plaintext
// confirmation token — never leave it lingering once this row will not be retried again.
function markTerminal(PDO $db, array $row, string $status, string $reason, ?int $attempts = null): void {
    $db->prepare('
        UPDATE notification_queue
        SET status = ?, last_error = ?, attempts = COALESCE(?, attempts), token_plaintext = NULL
        WHERE id = ?
    ')->execute([$status, $reason, $attempts, (int)$row['id']]);
}

function buildEmailContent(PDO $db, array $row, array $participant): ?array {
    switch ($row['event_type']) {
        case 'confirmation':
            return buildConfirmationEmail($db, $row);
        case 'match_completed':
            return buildMatchCompletedEmail($db, $row, $participant);
        case 'round_completed':
            return buildRoundCompletedEmail($db, $row, $participant);
        case 'tournament_finalized':
            return buildTournamentFinalizedEmail($db, $row, $participant);
        default:
            return null;
    }
}

// ---------------------------------------------------------------------------
// Email visual layer. Inline styles only — Gmail strips <style> blocks and most
// clients ignore linked/@imported fonts, so this can't lean on the app's actual
// stylesheet. Colors/type below are pulled straight from
// frontend/src/assets/styles/global.scss so notification emails read as the same
// product as the web app rather than a generic transactional template.
// ---------------------------------------------------------------------------

const EMAIL_COLOR_BG         = '#EAE3D3';
const EMAIL_COLOR_SURFACE    = '#FAF7F0';
const EMAIL_COLOR_SURFACE_2  = '#F1ECDF';
const EMAIL_COLOR_BORDER     = '#D9D0BC';
const EMAIL_COLOR_MUTED      = '#8A8371';
const EMAIL_COLOR_TEXT       = '#22261F';
const EMAIL_COLOR_TEXT_DIM   = '#5B5A4E';
const EMAIL_COLOR_ACCENT     = '#BC3A1C';
const EMAIL_COLOR_ACCENT_INK = '#FFF8EF';
const EMAIL_COLOR_MARKER     = '#3F7A52';
const EMAIL_FONT_SANS = "Arial,Helvetica,sans-serif";
const EMAIL_FONT_MONO = "Consolas,'Courier New',monospace";

function emailWordmark(): string {
    return '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' . EMAIL_COLOR_ACCENT . ';margin-right:7px;"></span>' .
        '<span style="font-family:' . EMAIL_FONT_SANS . ';font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:' . EMAIL_COLOR_TEXT . ';">Bracketway</span>';
}

// Small uppercase mono label, matching the app's status-badge styling (e.g. the
// "SETUP"/"ACTIVE" tournament badges in tournament-manage.component.ts).
function emailEyebrow(string $label): string {
    return '<div style="font-family:' . EMAIL_FONT_MONO . ';font-size:11px;letter-spacing:1px;text-transform:uppercase;color:' . EMAIL_COLOR_MUTED . ';margin:0 0 6px;">' . htmlspecialchars($label) . '</div>';
}

function emailHeading(string $text): string {
    return '<div style="font-family:' . EMAIL_FONT_SANS . ';font-size:19px;font-weight:700;color:' . EMAIL_COLOR_TEXT . ';margin:0 0 16px;">' . htmlspecialchars($text) . '</div>';
}

function emailButton(string $url, string $label): string {
    return '<a href="' . htmlspecialchars($url) . '" style="display:inline-block;background:' . EMAIL_COLOR_ACCENT . ';color:' . EMAIL_COLOR_ACCENT_INK . ';font-family:' . EMAIL_FONT_SANS . ';font-size:14px;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:4px;">' . htmlspecialchars($label) . '</a>';
}

// A boxed "Team A 12 – 8 Team B" line, with an optional winner call-out below in the
// app's "win" color (marker green).
function emailScoreBox(string $team1, int $score1, string $team2, int $score2, ?string $winner = null): string {
    $winnerLine = $winner
        ? '<div style="margin-top:8px;font-family:' . EMAIL_FONT_SANS . ';font-size:13px;font-weight:700;color:' . EMAIL_COLOR_MARKER . ';">' . htmlspecialchars($winner) . ' wins</div>'
        : '';
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . EMAIL_COLOR_SURFACE_2 . ';border:1px solid ' . EMAIL_COLOR_BORDER . ';border-radius:4px;margin:0 0 20px;">' .
        '<tr><td style="padding:16px 18px;font-family:' . EMAIL_FONT_SANS . ';font-size:15px;color:' . EMAIL_COLOR_TEXT . ';">' .
        htmlspecialchars($team1) . ' <strong>' . $score1 . '</strong> &ndash; <strong>' . $score2 . '</strong> ' . htmlspecialchars($team2) .
        $winnerLine . '</td></tr></table>';
}

// Wraps inner content in the branded card shared by every notification email:
// wordmark header, content area, muted footer.
function emailLayout(string $innerHtml, string $footerHtml): string {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . EMAIL_COLOR_BG . ';padding:32px 16px;">' .
        '<tr><td align="center">' .
        '<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:' . EMAIL_COLOR_SURFACE . ';border:1px solid ' . EMAIL_COLOR_BORDER . ';border-radius:6px;">' .
        '<tr><td style="padding:22px 28px;border-bottom:1px solid ' . EMAIL_COLOR_BORDER . ';">' . emailWordmark() . '</td></tr>' .
        '<tr><td style="padding:28px;font-family:' . EMAIL_FONT_SANS . ';font-size:15px;line-height:1.6;color:' . EMAIL_COLOR_TEXT . ';">' . $innerHtml . '</td></tr>' .
        '<tr><td style="padding:16px 28px 22px;border-top:1px solid ' . EMAIL_COLOR_BORDER . ';font-family:' . EMAIL_FONT_SANS . ';font-size:12px;line-height:1.6;color:' . EMAIL_COLOR_MUTED . ';">' . $footerHtml . '</td></tr>' .
        '</table>' .
        '</td></tr>' .
        '</table>';
}

function buildConfirmationEmail(PDO $db, array $row): ?array {
    $stmt = $db->prepare('SELECT name FROM tournaments WHERE id = ?');
    $stmt->execute([$row['tournament_id']]);
    $tournament = $stmt->fetch();
    if (!$tournament || !$row['token_plaintext']) {
        return null;
    }

    $confirmUrl = rtrim(APP_PUBLIC_URL, '/') . '/notifications/confirm?pid=' . $row['participant_id'] . '&token=' . $row['token_plaintext'];
    $subject = "Confirm your {$tournament['name']} match update emails";

    $inner = emailEyebrow('Confirm Subscription') .
        emailHeading($tournament['name']) .
        '<p style="margin:0 0 20px;">Confirm you want match update emails for this tournament.</p>' .
        '<p style="margin:0 0 20px;">' . emailButton($confirmUrl, 'Confirm subscription') . '</p>' .
        '<p style="margin:0;font-size:13px;color:' . EMAIL_COLOR_TEXT_DIM . ';">If you did not request this, you can ignore this email.</p>';
    $html = emailLayout($inner, 'Bracketway');
    $text = "Confirm you want match update emails for {$tournament['name']}:\n{$confirmUrl}\n\nIf you did not request this, you can ignore this email.\n\n— Bracketway";

    return ['subject' => $subject, 'html' => $html, 'text' => $text];
}

function buildMatchCompletedEmail(PDO $db, array $row, array $participant): ?array {
    $stmt = $db->prepare('
        SELECT
            m.round, m.team1_score, m.team2_score,
            t.name AS tournament_name,
            team1.name AS team1_name, team2.name AS team2_name, winner.name AS winner_name
        FROM matches m
        JOIN tournaments t ON m.tournament_id = t.id
        LEFT JOIN teams team1 ON m.team1_id = team1.id
        LEFT JOIN teams team2 ON m.team2_id = team2.id
        LEFT JOIN teams winner ON m.winner_id = winner.id
        WHERE m.id = ?
    ');
    $stmt->execute([$row['match_id']]);
    $m = $stmt->fetch();
    if (!$m) return null;

    $subject = "{$m['tournament_name']}: Round {$m['round']} match complete — {$m['winner_name']} wins";
    $summary = "{$m['team1_name']} {$m['team1_score']} – {$m['team2_score']} {$m['team2_name']} ({$m['winner_name']} wins)";

    $body = emailEyebrow('Round ' . (int)$m['round'] . ' · Match Complete') .
        emailHeading($m['tournament_name']) .
        emailScoreBox($m['team1_name'], (int)$m['team1_score'], $m['team2_name'], (int)$m['team2_score'], $m['winner_name']);
    $text = "Round {$m['round']} match complete in {$m['tournament_name']}:\n{$summary}";

    return withFooter($body, $text, $subject, $row, $participant);
}

function buildRoundCompletedEmail(PDO $db, array $row, array $participant): ?array {
    $stmt = $db->prepare('SELECT name FROM tournaments WHERE id = ?');
    $stmt->execute([$row['tournament_id']]);
    $tournament = $stmt->fetch();
    if (!$tournament) return null;

    $round = (int)$row['round'];
    $nextRound = $round + 1;

    $stmt = $db->prepare('
        SELECT team1.name AS team1_name, team2.name AS team2_name
        FROM matches m
        LEFT JOIN teams team1 ON m.team1_id = team1.id
        LEFT JOIN teams team2 ON m.team2_id = team2.id
        WHERE m.tournament_id = ? AND m.round = ?
        ORDER BY m.match_number ASC
    ');
    $stmt->execute([$row['tournament_id'], $nextRound]);
    $nextMatches = $stmt->fetchAll();

    $subject = "{$tournament['name']}: Round {$round} complete";
    $body = emailEyebrow('Round ' . $round . ' · Complete') . emailHeading($tournament['name']);
    $text = "Round {$round} is complete in {$tournament['name']}.";

    if ($nextMatches) {
        $matchupRows = '';
        $matchupLines = [];
        foreach ($nextMatches as $nm) {
            if (!$nm['team1_name'] || !$nm['team2_name']) continue;
            $line = "{$nm['team1_name']} vs {$nm['team2_name']}";
            $border = $matchupRows === '' ? '' : 'border-top:1px solid ' . EMAIL_COLOR_BORDER . ';';
            $matchupRows .= '<div style="padding:10px 0;' . $border . 'font-family:' . EMAIL_FONT_SANS . ';font-size:14px;color:' . EMAIL_COLOR_TEXT . ';">' . htmlspecialchars($line) . '</div>';
            $matchupLines[] = $line;
        }
        if ($matchupRows !== '') {
            $body .= emailEyebrow('Round ' . $nextRound . ' Matchups') .
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . EMAIL_COLOR_SURFACE_2 . ';border:1px solid ' . EMAIL_COLOR_BORDER . ';border-radius:4px;"><tr><td style="padding:0 16px;">' . $matchupRows . '</td></tr></table>';
            $text .= "\n\nRound {$nextRound} matchups:\n- " . implode("\n- ", $matchupLines);
        }
    }

    return withFooter($body, $text, $subject, $row, $participant);
}

function buildTournamentFinalizedEmail(PDO $db, array $row, array $participant): ?array {
    $stmt = $db->prepare('
        SELECT t.name AS tournament_name, t.uuid AS tournament_uuid,
               team1.name AS team1_name, team2.name AS team2_name, winner.name AS winner_name,
               m.team1_score, m.team2_score
        FROM matches m
        JOIN tournaments t ON m.tournament_id = t.id
        LEFT JOIN teams team1 ON m.team1_id = team1.id
        LEFT JOIN teams team2 ON m.team2_id = team2.id
        LEFT JOIN teams winner ON m.winner_id = winner.id
        WHERE m.id = ?
    ');
    $stmt->execute([$row['match_id']]);
    $m = $stmt->fetch();
    if (!$m) return null;

    $bracketUrl = rtrim(APP_PUBLIC_URL, '/') . '/bracket/' . $m['tournament_uuid'];
    $subject = "{$m['tournament_name']} is complete — {$m['winner_name']} wins!";
    $summary = "{$m['team1_name']} {$m['team1_score']} – {$m['team2_score']} {$m['team2_name']}";

    $body = emailEyebrow('Tournament Complete') .
        emailHeading($m['tournament_name']) .
        '<p style="margin:0 0 16px;">Champion: <strong style="color:' . EMAIL_COLOR_MARKER . ';">' . htmlspecialchars($m['winner_name']) . '</strong></p>' .
        emailScoreBox($m['team1_name'], (int)$m['team1_score'], $m['team2_name'], (int)$m['team2_score']) .
        '<p style="margin:20px 0 0;">' . emailButton($bracketUrl, 'View the final bracket') . '</p>';
    $text = "{$m['tournament_name']} is complete. Champion: {$m['winner_name']}.\n{$summary}\n\nView the final bracket: {$bracketUrl}";

    return withFooter($body, $text, $subject, $row, $participant);
}

// Wraps a built email body in the shared branded layout (emailLayout), appending a
// category-scoped one-click unsubscribe link plus a link to the full preferences page
// in the footer — common to all three post-confirmation email types.
function withFooter(string $bodyHtml, string $bodyText, string $subject, array $row, array $participant): array {
    $token = notificationManageToken((int)$participant['id'], (int)$participant['notification_manage_token_version']);
    $base = rtrim(APP_PUBLIC_URL, '/');
    $unsubscribeUrl = $base . '/notifications/unsubscribe?pid=' . $participant['id'] . '&token=' . $token . '&category=' . $row['event_type'];
    $preferencesUrl = $base . '/notifications/preferences?pid=' . $participant['id'] . '&token=' . $token;

    $footer = 'Bracketway · ' .
        '<a href="' . htmlspecialchars($unsubscribeUrl) . '" style="color:' . EMAIL_COLOR_TEXT_DIM . ';">Stop these emails</a> · ' .
        '<a href="' . htmlspecialchars($preferencesUrl) . '" style="color:' . EMAIL_COLOR_TEXT_DIM . ';">Manage preferences</a>';
    $html = emailLayout($bodyHtml, $footer);
    $text = $bodyText . "\n\nStop these emails: {$unsubscribeUrl}\nManage preferences: {$preferencesUrl}\n\n— Bracketway";

    return ['subject' => $subject, 'html' => $html, 'text' => $text];
}

?>
