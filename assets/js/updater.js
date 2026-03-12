#!/usr/bin/env node
/**
 * Claude Code Guide — Daily Updater
 * Runs via Windows Task Scheduler at 7 AM daily.
 *
 * What it does:
 *   1. Fetches latest Claude Code news from Reddit + Anthropic RSS + arXiv
 *   2. Deduplicates and merges into updates.json (enforcing 5+5+5 structure)
 *   3. Deploys the full site to Netlify via the Files API
 *
 * Setup: Run setup-daily-updater.ps1 once to install the Task Scheduler job.
 */

'use strict';

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ─── Configuration ────────────────────────────────────────────────────────────
const CONFIG = {
  netlifyToken:  process.env.NETLIFY_TOKEN  || 'nfp_56dxLWFD7tdFEKsaxHg82W8e9ePaFUPCd609',
  netlifySiteId: process.env.NETLIFY_SITE   || 'fde02b9f-c2f9-4a05-a6b7-22fb8044a47b',
  siteRoot: path.join(__dirname, '..', '..'),
  updatesJson: path.join(__dirname, '..', 'data', 'updates.json'),
  logFile: path.join(
    process.env.USERPROFILE || process.env.HOME || '.',
    'Desktop',
    'claude-updater.log'
  ),
  redditUrl:    'https://www.reddit.com/r/ClaudeAI/search.json?q=claude+code&sort=new&t=day&limit=10',
  anthropicRss: 'https://www.anthropic.com/rss.xml',
  arxivUrl:     'https://export.arxiv.org/api/query?search_query=ti:llm+agent+OR+ti:claude+OR+ti:language+model+tool&sortBy=submittedDate&sortOrder=descending&max_results=5',
  maxPerCategory: 5,
  deployExts: new Set(['.html', '.css', '.js', '.json', '.txt', '.toml', '.ico', '.png', '.jpg', '.svg', '.webp']),
};
// ──────────────────────────────────────────────────────────────────────────────

function fetchUrl(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'claude-code-guide-updater/1.0',
        'Accept':     'application/json, application/atom+xml, application/rss+xml, text/xml, */*',
        ...extraHeaders,
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, extraHeaders).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function request(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body || '', 'utf8');
    const opts = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method,
      headers: { 'Content-Length': buf.length, ...headers },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end(buf);
  });
}

function sha1(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}

function walkDir(dir, base = dir, results = []) {
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const abs  = path.join(dir, entry);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      walkDir(abs, base, results);
    } else {
      const ext = path.extname(entry).toLowerCase();
      if (CONFIG.deployExts.has(ext) || ext === '') {
        const rel = '/' + path.relative(base, abs).replace(/\\/g, '/');
        results.push({ absPath: abs, relPath: rel, ext });
      }
    }
  }
  return results;
}

async function deployToNetlify() {
  const token  = CONFIG.netlifyToken;
  const siteId = CONFIG.netlifySiteId;
  const authH  = { Authorization: `Bearer ${token}` };

  log('Scanning site files\u2026');
  const files    = walkDir(CONFIG.siteRoot);
  const fileMap  = {};
  const filesReq = {};

  for (const f of files) {
    const buf    = fs.readFileSync(f.absPath);
    const digest = sha1(buf);
    fileMap[f.relPath]  = { digest, absPath: f.absPath, buf };
    filesReq[f.relPath] = digest;
  }
  log(`Found ${files.length} files to deploy`);

  log('Creating Netlify deploy\u2026');
  const createRes = await request(
    'POST',
    `https://api.netlify.com/api/v1/sites/${siteId}/deploys`,
    JSON.stringify({ files: filesReq, draft: false }),
    { ...authH, 'Content-Type': 'application/json' }
  );

  if (createRes.status !== 200 && createRes.status !== 201) {
    throw new Error(`Deploy create failed: HTTP ${createRes.status} \u2014 ${createRes.body.slice(0, 300)}`);
  }

  const deploy   = JSON.parse(createRes.body);
  const deployId = deploy.id;
  const required = deploy.required || [];
  log(`Deploy ID: ${deployId} \u2014 Netlify needs ${required.length} file(s) uploaded`);

  const digestToFile = {};
  for (const [relPath, info] of Object.entries(fileMap)) {
    digestToFile[info.digest] = { relPath, buf: info.buf };
  }

  for (const neededDigest of required) {
    const fileInfo = digestToFile[neededDigest];
    if (!fileInfo) {
      log(`WARN: Netlify requested digest ${neededDigest} but no matching file found`);
      continue;
    }
    log(`Uploading ${fileInfo.relPath} (${fileInfo.buf.length} bytes)\u2026`);
    const uploadRes = await request(
      'PUT',
      `https://api.netlify.com/api/v1/deploys/${deployId}/files${fileInfo.relPath}`,
      fileInfo.buf,
      { ...authH, 'Content-Type': 'application/octet-stream' }
    );
    if (uploadRes.status !== 200 && uploadRes.status !== 204) {
      log(`WARN: Upload of ${fileInfo.relPath} returned HTTP ${uploadRes.status}`);
    }
  }

  log(`Deploy complete \u2192 https://profound-nougat-7e25e0.netlify.app`);
  return deployId;
}

function parseRedditPosts(jsonStr) {
  try {
    const data  = JSON.parse(jsonStr);
    const posts = data?.data?.children || [];
    return posts.map(({ data: p }) => ({
      date:      new Date(p.created_utc * 1000).toISOString().slice(0, 10),
      category:  'community',
      source:    'reddit',
      sourceUrl: `https://reddit.com${p.permalink}`,
      readTime:  '3 min',
      title:     truncate(p.title, 90),
      icon:      '\ud83d\udcac',
      excerpt:   p.selftext
        ? truncate(p.selftext.replace(/\n/g, ' '), 180)
        : `Reddit post \u2014 "${truncate(p.title, 60)}"`,
      content: null,
    }));
  } catch (e) {
    log(`WARN: Failed to parse Reddit \u2014 ${e.message}`);
    return [];
  }
}

function parseRssFeed(xmlStr) {
  try {
    const items = [];
    const itemRx = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRx.exec(xmlStr)) !== null) {
      const block   = m[1];
      const title   = extractTag(block, 'title');
      const desc    = extractTag(block, 'description');
      const pubDate = extractTag(block, 'pubDate');
      const link    = extractTag(block, 'link');
      if (!title) continue;
      let isoDate = new Date().toISOString().slice(0, 10);
      try { isoDate = new Date(pubDate).toISOString().slice(0, 10); } catch (_) {}
      items.push({
        date:      isoDate,
        category:  'update',
        source:    'official',
        sourceUrl: link || 'https://www.anthropic.com/news',
        readTime:  '3 min',
        title:     truncate(title.replace(/<[^>]+>/g, ''), 90),
        icon:      '\ud83d\udcf0',
        excerpt:   truncate((desc || '').replace(/<[^>]+>/g, '').replace(/\n/g, ' '), 200),
        content:   null,
      });
    }
    return items;
  } catch (e) {
    log(`WARN: Failed to parse RSS \u2014 ${e.message}`);
    return [];
  }
}

/** Parse arXiv Atom XML into research entries. */
function parseArxivFeed(xmlStr) {
  try {
    const entries = [];
    const entryRx = /<entry>([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = entryRx.exec(xmlStr)) !== null) {
      const block    = m[1];
      const title    = extractTag(block, 'title').replace(/\s+/g, ' ').trim();
      const summary  = extractTag(block, 'summary').replace(/\s+/g, ' ').trim();
      const pubDate  = extractTag(block, 'published');
      const idTag    = extractTag(block, 'id');

      // Extract arXiv ID from URL like http://arxiv.org/abs/2407.01489v1
      const idMatch  = idTag.match(/abs\/([\d.]+)/);
      const arxivId  = idMatch ? idMatch[1] : '';
      const arxivUrl = arxivId ? `https://arxiv.org/abs/${arxivId}` : idTag;

      // Extract authors
      const authorRx = /<name>([\s\S]*?)<\/name>/g;
      const authors  = [];
      let am;
      while ((am = authorRx.exec(block)) !== null && authors.length < 3) {
        authors.push(am[1].trim());
      }
      const authorsStr = authors.length > 0
        ? authors.slice(0, 2).join(', ') + (authors.length > 2 ? ' et al.' : '')
        : 'Unknown authors';

      let isoDate = new Date().toISOString().slice(0, 10);
      try { isoDate = new Date(pubDate).toISOString().slice(0, 10); } catch (_) {}

      if (!title) continue;
      entries.push({
        date:      isoDate,
        category:  'research',
        source:    'arxiv',
        sourceUrl: arxivUrl,
        arxivUrl:  arxivUrl,
        readTime:  '12 min',
        title:     truncate(title, 100),
        icon:      '\ud83d\udcc4',
        authors:   authorsStr,
        abstract:  truncate(summary, 400),
        excerpt:   truncate(summary, 180),
        content:   null,
      });
    }
    return entries;
  } catch (e) {
    log(`WARN: Failed to parse arXiv \u2014 ${e.message}`);
    return [];
  }
}

function extractTag(str, tag) {
  const m = str.match(new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`
  ));
  return m ? (m[1] || m[2] || '').trim() : '';
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

function loadExisting() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.updatesJson, 'utf8'));
  } catch (e) {
    log(`WARN: Could not read updates.json \u2014 starting fresh. (${e.message})`);
    return { updates: [] };
  }
}

function deduplicate(all) {
  const seen = new Set();
  return all.filter(item => {
    const key = item.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Enforce 5+5+5 structure:
 * Top 5 research, top 5 official/feature, top 5 community — exactly 15 total.
 * Within each bucket, pinned/existing curated items take precedence.
 */
function enforce5x5x5(all) {
  const byDate = (a, b) => new Date(b.date) - new Date(a.date);

  const research  = all.filter(u => u.category === 'research')
                       .sort(byDate).slice(0, CONFIG.maxPerCategory);
  const official  = all.filter(u => ['release','feature','update','security'].includes(u.category))
                       .sort(byDate).slice(0, CONFIG.maxPerCategory);
  const community = all.filter(u => u.category === 'community')
                       .sort(byDate).slice(0, CONFIG.maxPerCategory);

  return [...research, ...official, ...community];
}

function save(data) {
  fs.writeFileSync(CONFIG.updatesJson, JSON.stringify(data, null, 2), 'utf8');
  log(`Saved ${data.updates.length} entries to updates.json`);
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(CONFIG.logFile, line); } catch (_) {}
}

async function main() {
  log('=== Claude Code Guide Updater starting ===');

  const existing = loadExisting();
  const newItems = [];

  // Fetch Reddit posts
  log('Fetching Reddit r/ClaudeAI posts\u2026');
  try {
    const body  = await fetchUrl(CONFIG.redditUrl);
    const posts = parseRedditPosts(body);
    log(`Reddit: found ${posts.length} posts`);
    newItems.push(...posts);
  } catch (e) {
    log(`ERROR: Reddit fetch failed \u2014 ${e.message}`);
  }

  // Fetch Anthropic RSS
  log('Fetching Anthropic RSS feed\u2026');
  try {
    const body  = await fetchUrl(CONFIG.anthropicRss);
    const posts = parseRssFeed(body);
    log(`RSS: found ${posts.length} items`);
    newItems.push(...posts);
  } catch (e) {
    log(`ERROR: RSS fetch failed \u2014 ${e.message}`);
  }

  // Fetch arXiv papers
  log('Fetching arXiv LLM agent papers\u2026');
  try {
    const body    = await fetchUrl(CONFIG.arxivUrl);
    const papers  = parseArxivFeed(body);
    log(`arXiv: found ${papers.length} papers`);
    newItems.push(...papers);
  } catch (e) {
    log(`ERROR: arXiv fetch failed \u2014 ${e.message}`);
  }

  // Merge, deduplicate, enforce 5+5+5
  if (newItems.length > 0) {
    const combined  = deduplicate([...newItems, ...existing.updates]);
    const enforced  = enforce5x5x5(combined);
    log(`Enforced 5+5+5 structure: ${enforced.length} total entries`);
    save({ updates: enforced });
  } else {
    log('No new items \u2014 updates.json unchanged');
  }

  // Deploy to Netlify
  log('Deploying to Netlify\u2026');
  try {
    await deployToNetlify();
  } catch (e) {
    log(`ERROR: Netlify deploy failed \u2014 ${e.message}`);
  }

  log('=== Done ===');
}

main().catch(e => {
  log(`FATAL: ${e.message}\n${e.stack}`);
  process.exit(1);
});
