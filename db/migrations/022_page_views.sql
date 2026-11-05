-- Self-hosted traffic counts for the super-admin Traffic page (api/lib/PageView.php).
--
-- One counter per day, page and source, and nothing else: no cookies, no IP addresses, no
-- per-visitor rows. A visit is the first page a browser tab loads in a session; source is
-- only recorded on that first page (where the visitor came from), so later pages in the same
-- visit add to the '' source row.

CREATE TABLE IF NOT EXISTS page_views (
  day DATE NOT NULL,
  path VARCHAR(100) NOT NULL,
  source VARCHAR(60) NOT NULL DEFAULT '',
  visits INT UNSIGNED NOT NULL DEFAULT 0,
  views INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path, source)
);
