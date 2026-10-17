// scripts/flatten-prerendered.mjs
//
// Runs after `ng build` (see build:prod in package.json). Angular writes each prerendered
// page as a folder, /pricing as pricing/index.html. On Apache that folder makes mod_dir
// answer /pricing with a 301 to /pricing/ before any rewrite runs, and turning that off
// (DirectorySlash Off) needs an AllowOverride the host may not grant, which would take the
// whole site down with a 500. So each page becomes a plain file beside the others,
// pricing.html, which .htaccess serves for /pricing with no redirect and no folder.
//
// The landing page stays as index.html. Reads the route list Angular itself writes.
import { existsSync, readFileSync, renameSync, readdirSync, rmdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
const browser = join(dist, 'browser');
const { routes } = JSON.parse(readFileSync(join(dist, 'prerendered-routes.json'), 'utf8'));

for (const route of Object.keys(routes)) {
  if (route === '/') continue;
  const folder = join(browser, route);
  const page = join(folder, 'index.html');
  if (!existsSync(page)) throw new Error(`Prerendered page missing: ${page}`);
  renameSync(page, `${folder}.html`);
  if (readdirSync(folder).length === 0) rmdirSync(folder);
  console.log(`Flattened ${route}/index.html -> ${route.slice(1)}.html`);
}

// The .htaccess rewrite and the sitemap name these pages by hand. Fail the build, before
// deploy.ps1 copies anything, rather than ship a page that 404s to the app shell or that
// search engines are never told about.
const htaccess = readFileSync(join(browser, '.htaccess'), 'utf8');
const sitemap = readFileSync(join(browser, 'sitemap.xml'), 'utf8');
const pageList = htaccess.match(/RewriteRule \^\(([^)]+)\)\$ \$1\.html/);
const rewritten = new Set(pageList ? pageList[1].split('|') : []);
const problems = [];
for (const route of Object.keys(routes)) {
  if (route !== '/' && !rewritten.has(route.slice(1))) problems.push(`${route} is not in the .htaccess page list`);
  if (!sitemap.includes(`<loc>https://bracketway.com${route}</loc>`)) problems.push(`${route} is not in sitemap.xml`);
}
if (problems.length) throw new Error('Prerendered pages out of step:\n  ' + problems.join('\n  '));
