#!/usr/bin/env node
/**
 * Claude Code Guide — Daily Updater
 * Runs via Windows Task Scheduler at 7 AM daily.
 *
 * What it does:
 *   1. Fetches latest Claude Code news from Reddit + Anthropic RSS
 *   2. Deduplicates and merges into updates.json
 *   3. Deploys the full site to Netlify via the Files API
 *      (works for drag-and-drop sites — no git required)
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
  // Netlify credentials — pre-configured
  netlifyToken:  process.env.NETLIFY_TOKEN  || 'nfp_56dxLWFD7tdFEKsaxHg82W8e9ePaFUPCd609',
  netlifySiteId: process.env.NETLIFY_SITE   || 'fde02b9f-c2f9-4a05-a6b7-22fb8044a47b',

  // Site root (two levels up from assets/js/)
  siteRoot: path.join(__dirname, '..', '..'),

  // Path to updates.json
  updatesJson: path.join(__dirname, '..', 'data', 'updates.json'),

  // Log file on the Desktop
  logFile: path.join(
    process.env.USERPROFILE || process.env.HOME || '.',
    'Desktop',
    'claude-updater.log'
  ),

  // Reddit JSON API (no auth needed for public subreddits)
  redditUrl: 'https://www.reddit.com/r/ClaudeAI/search.json?q=claude+code&sort=new&t=day&limit=5',

  // Anthropic RSS feed
  anthropicRss: 'https://www.anthropic.com/rss.xml',

  // Max entries to keep in updates.json
  maxEntries: 50,

  // File extensions to include in Netlify deploy
  deployExts: new Set(['.html', '.css', '.js', '.json', '.txt', '.toml', '.ico', '.png', '.jpg', '.svg', '.webp']),
};
// ──────────────────────────────────────────────────────────────────────────────

/** HTTPS/HTTP GET returning raw body string. Follows one redirect. */
function fetchUrl(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'claude-code-guide-updater/1.0',
        'Accept':     'application/json, application/rss+xml, text/xml, */*',
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

/** HTTPS request with body (for POST/PUT). Returns { status, body }. */
function request(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body || '', 'utf8');
    const opts = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method,
      headers: {
        'Content-Length': buf.length,
        ...headers,
      },
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

/** SHA1 hex of a Buffer or string (Netlify uses SHA1 for file digests). */
function sha1(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}

/** Walk a directory recursively, returning [{ absPath, relPath, ext }]. */
function walkDir(dir, base = dir, results = []) {
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith('.')) continue;          // skip hidden
    const abs = path.join(dir, entry);
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

/** Deploy all site files to Netlify using the File Digest API. */
async function deployToNetlify() {
  const token  = CONFIG.netlifyToken;
  const siteId = CONFIG.netlifySiteId;
  const authH  = { Authorization: `Bearer ${token}` };

  log('Scanning site files…');
  const files    = walkDir(CONFIG.siteRoot);
  const fileMap  = {};      // relPath → { digest, absPath, buf }
  const filesReq = {};      // for deploy request: { relPath: digest }

  for (const f of files) {
    const buf    = fs.readFileSync(f.absPath);
    const digest = sha1(buf);
    fileMap[f.relPath]  = { digest, absPath: f.absPath, buf };
    filesReq[f.relPath] = digest;
  }
  log(`Found ${files.length} files to deploy`);

  // Step 1 — Create a new deploy (returns list of files Netlify needs uploaded)
  log('Creating Netlify deploy…');
  const createRes = await request(
    'POST',
    `https://api.netlify.com/api/v1/sites/${siteId}/deploys`,
    JSON.stringify({ files: filesReq, draft: false }),
    { ...authH, 'Content-Type': 'application/json' }
  );

  if (createRes.status !== 200 && createRes.status !== 201) {
    throw new Error(`Deploy create failed: HTTP ${createRes.status} — ${createRes.body.slice(0, 300)}`);
  }

  const deploy = JSON.parse(createRes.body);
  const deployId = deploy.id;
  const required = deploy.required || [];   // SHA1s of files Netlify needs
  log(`Deploy ID: ${deployId} — Netlify needs ${required.length} file(s) uploaded`);

  // Build a reverse map: digest → file info (for files Netlify requires)
  const digestToFile = {};
  for (const [relPath, info] of Object.entries(fileMap)) {
    digestToFile[info.digest] = { relPath, buf: info.buf };
  }

  // Step 2 — Upload only the files Netlify says it doesn't have yet
  for (const neededDigest of required) {
    const fileInfo = digestToFile[neededDigest];
    if (!fileInfo) {
      log(`WARN: Netlify requested digest ${neededDigest} but no matching file found`);
      continue;
    }
    log(`Uploading ${fileInfo.relPath} (${fileInfo.buf.length} bytes)…`);
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

  log(`Deploy complete → https://profound-nougat-7e25e0.netlify.app`);
  return deployId;
}

/** Parse Reddit JSON API response into update entries. */
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
      icon:      '💬',
      excerpt:   p.selftext
        ? truncate(p.selftext.replace(/\n/g, ' '), 180)
        : `Reddit post — "${truncate(p.title, 60)}"`,
      content:   null,
    }));
  } catch (e) {
    log(`WARN: Failed to parse Reddit — ${e.message}`);
    return [];
  }
}

/** Parse Anthropic RSS XML into update entries. */
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
        icon:      '📰',
        excerpt:   truncate((desc || '').replace(/<[^>]+>/g, '').replace(/\n/g, ' '), 200),
        content:   null,
      });
    }
    return items;
  } catch (e) {
    log(`WARN: Failed to parse RSS — ${e.message}`);
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
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function loadExisting() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.updatesJson, 'utf8'));
  } catch (e) {
    log(`WARN: Could not read updates.json — starting fresh. (${e.message})`);
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

function save(data) {
  fs.writeFileSync(CONFIG.updatesJson, JSON.stringify(data, null, 2), 'utf8');
  log(`Saved ${data.updates.length} entries to updates.json`);
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(CONFIG.logFile, line); } catch (_) {}
}

/** Main */
async function main() {
  log('=== Claude Code Guide Updater starting ===');

  const existing = loadExisting();
  const newItems = [];

  // Fetch Reddit posts
  log('Fetching Reddit r/ClaudeAI posts…');
  try {
    const body  = await fetchUrl(CONFIG.redditUrl);
    const posts = parseRedditPosts(body);
    log(`Reddit: found ${posts.length} posts`);
    newItems.push(...posts);
  } catch (e) {
    log(`ERROR: Reddit fetch failed — ${e.message}`);
  }

  // Fetch Anthropic RSS
  log('Fetching Anthropic RSS feed…');
  try {
    const body  = await fetchUrl(CONFIG.anthropicRss);
    const posts = parseRssFeed(body);
    log(`RSS: found ${posts.length} items`);
    newItems.push(...posts);
  } catch (e) {
    log(`ERROR: RSS fetch failed — ${e.message}`);
  }

  // Merge + save
  if (newItems.length > 0) {
    const combined = deduplicate([...newItems, ...existing.updates]);
    const trimmed  = combined
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, CONFIG.maxEntries);
    log(`Merged: ${trimmed.length - existing.updates.length > 0 ? '+' + (trimmed.length - existing.updates.length) : 'no'} new entries`);
    save({ updates: trimmed });
  } else {
    log('No new items — updates.json unchanged');
  }

  // Deploy to Netlify
  log('Deploying to Netlify…');
  try {
    await deployToNetlify();
  } catch (e) {
    log(`ERROR: Netlify deploy failed — ${e.message}`);
  }

  log('=== Done ===');
}

main().catch(e => {
  log(`FATAL: ${e.message}\n${e.stack}`);
  process.exit(1);
});
