import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'assets'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'index.html') files.push(full);
  }
}
walk(root);

const problems = [];
const titles = new Map();
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  const expected = [
    ['canonical', /rel="canonical"/g],
    ['H1', /<h1\b/g],
    ['hreflang ru', /hreflang="ru"/g],
    ['hreflang en', /hreflang="en"/g],
    ['hreflang zh-CN', /hreflang="zh-CN"/g],
    ['hreflang x-default', /hreflang="x-default"/g],
  ];
  for (const [label, pattern] of expected) {
    const count = (source.match(pattern) || []).length;
    if (count !== 1) problems.push(rel + ': ' + label + '=' + count);
  }
  for (const match of source.matchAll(/href="(\/(?!\/|#)[^"]*)"/g)) {
    const pathname = match[1].split(/[?#]/)[0];
    if (/\.[a-z0-9]+$/i.test(pathname)) continue;
    const target = path.join(root, pathname.replace(/^\//, ''), 'index.html');
    if (!fs.existsSync(target)) problems.push(rel + ': missing ' + pathname);
  }
  const title = source.match(/<title>([^<]+)<\/title>/)?.[1]?.trim();
  const language = rel.startsWith('en' + path.sep) ? 'en' : rel.startsWith('zh' + path.sep) ? 'zh' : 'ru';
  const titleKey = language + ':' + title;
  if (!title) problems.push(rel + ': missing title');
  else if (titles.has(titleKey)) problems.push(rel + ': duplicate title with ' + titles.get(titleKey));
  else titles.set(titleKey, rel);
  const description = source.match(/<meta name="description" content="([^"]+)"/)?.[1]?.trim();
  if (!description) problems.push(rel + ': missing description');
  for (const match of source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(match[1]); }
    catch (error) { problems.push(rel + ': invalid JSON-LD: ' + error.message); }
  }
}

const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const sitemapUrls = (sitemap.match(/<loc>/g) || []).length;
if (sitemapUrls !== files.length) problems.push('sitemap URLs=' + sitemapUrls + ', HTML pages=' + files.length);

console.log('HTML pages: ' + files.length + '; sitemap URLs: ' + sitemapUrls + '; problems: ' + problems.length);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
