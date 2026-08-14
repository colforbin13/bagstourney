<?php
// api/scripts/send_notifications.php
//
// Worker for FEATURE_TRACKER.md item 1 (score-update notifications) and, as of the
// scheduled_jobs table, any due once-daily job too (currently just the organizer
// pending-approval digest). Run on a schedule — in production, /etc/cron.d/bags-notifications
// invokes this every 3 minutes. Not wired into api/index.php; CLI only.
//
//   php api/scripts/send_notifications.php
//
// Two independent jobs share this one process/cron entry:
// 1. Processes pending rows in notification_queue, one of four event types: confirmation
//    (double opt-in), match_completed, round_completed, tournament_finalized. Enqueueing
//    is done elsewhere (ParticipantController::setNotificationEmail(), MatchController's
//    three enqueue*Notifications() helpers) — this script only sends what's already queued.
// 2. Checks scheduled_jobs for anything due and runs it (see runDueScheduledJobs() below)
//    — deliberately piggybacked on this same cron entry rather than adding a new one;
//    crontab setup has bitten us before (missing username field, a missing trailing
//    newline silently disabling the whole file).

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("This script may only be run from the command line.\n");
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/BrevoClient.php';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

// Email visual layer constants — pulled up here (rather than staying next to the
// emailWordmark()/emailLayout()/etc. helper functions that use them, further down) since
// plain top-level `const` statements execute in file position, not hoisted like function
// declarations. Placed after those functions, they'd still be undefined the first time a
// scheduled job (which can run before any of the per-row email building below) needs them.
// Colors/type below are pulled straight from frontend/src/assets/styles/global.scss so
// notification emails read as the same product as the web app rather than a generic
// transactional template.
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

$db = getDB();

// Bulk mail goes through Brevo; auth mail (AuthController::register) stays on Postmark so
// exhausting this quota can never block account registration.
$mailer = new BrevoClient(BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME);

if (!$mailer->isConfigured()) {
    fwrite(STDERR, "Brevo is not configured (BREVO_API_KEY/BREVO_FROM_EMAIL); nothing to do.\n");
    exit(0);
}

// next_attempt_at is set when a send is parked against a rate/quota limit — those rows are
// passed over until the limit is due to have reset, without having spent an attempt.
$stmt = $db->prepare('
    SELECT * FROM notification_queue
    WHERE status = "pending" AND attempts < ?
      AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
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
$parked = 0;

foreach ($rows as $row) {
    $result = processRow($db, $mailer, $row);
    if ($result === 'sent') {
        $sent++;
    } elseif ($result === 'rate_limited') {
        // Every remaining row in this batch would hit the same limit, so stop here rather
        // than spending an API call (and Brevo's daily request budget) to park each one.
        // They keep next_attempt_at NULL and are simply retried on the next cron run.
        $parked++;
        fwrite(STDERR, "Brevo rate/quota limit reached; deferring the rest of this batch.\n");
        break;
    } elseif ($result === 'skipped') {
        $skipped++;
    } else {
        $failed++;
    }
}

echo "Processed " . count($rows) . " queued notification(s): {$sent} sent, {$skipped} skipped, {$failed} failed, {$parked} parked.\n";

runDueScheduledJobs($db, $mailer);

function processRow(PDO $db, BrevoClient $mailer, array $row): string {
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

    $result = $mailer->send($row['email'], $content['subject'], $content['html'], $content['text'], $row['event_type']);

    if ($result['success']) {
        $db->prepare('
            UPDATE notification_queue
            SET status = "sent", sent_at = NOW(), provider = "brevo", provider_message_id = ?,
                token_plaintext = NULL, last_error = NULL, next_attempt_at = NULL
            WHERE id = ?
        ')->execute([$result['message_id'], $id]);
        return 'sent';
    }

    // A rate/quota limit is not this row's fault and clears on its own, so park the row
    // until it lifts instead of spending one of its finite attempts. Without this, Brevo's
    // 300/day free-tier cap would burn all MAX_ATTEMPTS within ~15 minutes of a 3-minute
    // cron and drop the email permanently, hours before the quota actually reset.
    if (!empty($result['retry_after'])) {
        // Bound as an explicit int, not through execute()'s array: this connection runs
        // with EMULATE_PREPARES off, so INTERVAL needs an unambiguously numeric parameter
        // for the same reason the LIMIT above does. Computed with MySQL's NOW() rather
        // than PHP's clock so it stays comparable to the SELECT that reads it back.
        $park = $db->prepare('
            UPDATE notification_queue
            SET next_attempt_at = DATE_ADD(NOW(), INTERVAL ? SECOND), last_error = ?
            WHERE id = ?
        ');
        $park->bindValue(1, (int)$result['retry_after'], PDO::PARAM_INT);
        $park->bindValue(2, $result['error']);
        $park->bindValue(3, $id, PDO::PARAM_INT);
        $park->execute();
        return 'rate_limited';
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

// Checks scheduled_jobs for anything due and runs it, then advances that job's
// next_run_at. Not a generic worker-type framework — job_name is matched directly
// against the one job that exists today. Generalize this if/when a second one shows up.
function runDueScheduledJobs(PDO $db, BrevoClient $mailer): void {
    $due = $db->query('SELECT * FROM scheduled_jobs WHERE next_run_at <= NOW()')->fetchAll();

    foreach ($due as $job) {
        if ($job['job_name'] === 'organizer_pending_digest') {
            sendOrganizerPendingDigest($db, $mailer);
        } else {
            fwrite(STDERR, "Unknown scheduled job '{$job['job_name']}', skipping.\n");
            continue;
        }

        $db->prepare('
            UPDATE scheduled_jobs
            SET last_run_at = NOW(), next_run_at = DATE_ADD(NOW(), INTERVAL interval_hours HOUR)
            WHERE job_name = ?
        ')->execute([$job['job_name']]);
    }
}

// Reminds every owner/manager of a tournament with at least one unapproved
// self-registration (participants.registration_status = 'pending') — sent as a running
// reminder of *current* state, not a delta since the last digest, so an organizer who
// ignores it keeps hearing about it daily until they act. One email per recipient,
// batched across all of that recipient's tournaments with pending rows.
function sendOrganizerPendingDigest(PDO $db, BrevoClient $mailer): void {
    $stmt = $db->query('
        SELECT t.id AS tournament_id, t.name AS tournament_name, COUNT(p.id) AS pending_count
        FROM tournaments t
        JOIN participants p ON p.tournament_id = t.id AND p.registration_status = "pending"
        WHERE t.deleted_at IS NULL
        GROUP BY t.id
    ');
    $pendingTournaments = $stmt->fetchAll();
    if (!$pendingTournaments) return;

    // recipientEmail => ['username' => ..., 'tournaments' => [[name, id, pending_count], ...]]
    $recipients = [];
    $recipientStmt = $db->prepare('
        SELECT u.email, u.username
        FROM tournament_members tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.tournament_id = ? AND tm.role IN ("owner", "manager") AND u.status = "active"
    ');
    foreach ($pendingTournaments as $t) {
        $recipientStmt->execute([$t['tournament_id']]);
        foreach ($recipientStmt->fetchAll() as $r) {
            if (!$r['email']) continue;
            $recipients[$r['email']]['username'] = $r['username'];
            $recipients[$r['email']]['tournaments'][] = $t;
        }
    }

    foreach ($recipients as $email => $data) {
        $suppressed = $db->prepare('SELECT 1 FROM notification_suppressions WHERE email = ?');
        $suppressed->execute([$email]);
        if ($suppressed->fetchColumn()) continue;

        $content = buildOrganizerDigestEmail($data['username'], $data['tournaments']);
        $mailer->send($email, $content['subject'], $content['html'], $content['text'], 'organizer_pending_digest');
    }
}

function buildOrganizerDigestEmail(string $username, array $tournaments): array {
    $count = count($tournaments);
    $subject = $count === 1
        ? "1 tournament has registrations awaiting approval"
        : "{$count} tournaments have registrations awaiting approval";

    $rows = '';
    $lines = [];
    foreach ($tournaments as $t) {
        $url = rtrim(APP_PUBLIC_URL, '/') . '/admin/tournament/' . $t['tournament_id'];
        $label = $t['pending_count'] == 1 ? '1 pending registration' : "{$t['pending_count']} pending registrations";
        $rows .= '<div style="padding:10px 0;border-top:1px solid ' . EMAIL_COLOR_BORDER . ';font-family:' . EMAIL_FONT_SANS . ';font-size:14px;color:' . EMAIL_COLOR_TEXT . ';">' .
            '<a href="' . htmlspecialchars($url) . '" style="color:' . EMAIL_COLOR_ACCENT . ';text-decoration:none;font-weight:700;">' . htmlspecialchars($t['tournament_name']) . '</a>' .
            ' &mdash; ' . htmlspecialchars($label) . '</div>';
        $lines[] = "{$t['tournament_name']} — {$label}: {$url}";
    }

    $inner = emailEyebrow('Pending Approvals') .
        emailHeading('Hi ' . $username) .
        '<p style="margin:0 0 16px;">The following tournaments have self-registered participants waiting for your approval:</p>' .
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . EMAIL_COLOR_SURFACE_2 . ';border:1px solid ' . EMAIL_COLOR_BORDER . ';border-radius:4px;"><tr><td style="padding:0 16px;">' . $rows . '</td></tr></table>';
    $html = emailLayout($inner, 'Bracketway · This is a daily reminder while approvals remain pending.');
    $text = "Hi {$username},\n\nThe following tournaments have self-registered participants waiting for your approval:\n\n" .
        implode("\n", $lines) . "\n\nThis is a daily reminder while approvals remain pending.\n\n— Bracketway";

    return ['subject' => $subject, 'html' => $html, 'text' => $text];
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
