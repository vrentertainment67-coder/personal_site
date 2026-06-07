// send-monthly.mjs
// Assembles and sends the DJ VIC monthly mailer.
// Pulls latest blog posts from your RSS feed + recent AFTER DARK parts from the
// published Google Sheet CSV, fills djvic-monthly-template.html, and sends via Resend.
//
// RUN:
//   Draft (safe):  node --env-file=.env send-monthly.mjs
//   Send for real: node --env-file=.env send-monthly.mjs --send
//
// .env needs: RESEND_API_KEY, RESEND_SEGMENT_ID_MONTHLY, AFTERDARK_CSV_URL, BLOG_RSS_URL

import { readFileSync } from 'node:fs';
import { Resend } from 'resend';
import Parser from 'rss-parser';
import { parse } from 'csv-parse/sync';

const { RESEND_API_KEY, RESEND_SEGMENT_ID_MONTHLY, AFTERDARK_CSV_URL, BLOG_RSS_URL } = process.env;
for (const [k, v] of Object.entries({ RESEND_API_KEY, RESEND_SEGMENT_ID_MONTHLY, AFTERDARK_CSV_URL, BLOG_RSS_URL })) {
  if (!v) { console.error(`Missing ${k} in .env`); process.exit(1); }
}

// ===== EDIT THESE EACH MONTH (the curated bits) =====
const MONTH = 'JUNE 2026';
const INTRO = 'Where Vic has been, what dropped, and what\u2019s moving in the rooms that still matter.';
const BLOG_COUNT = 2;        // how many latest blog posts to feature
const AFTERDARK_COUNT = 3;   // how many recent After Dark parts to feature
const REMIX_TITLE = '[ latest mix / mashup title ]';
const REMIX_LINE  = '[ one line \u2014 the blend, the vibe, the moment ]';
const VICFIX_TITLE = 'Sahil Madaan \u2014 S2E15';
const VICFIX_HOOK  = 'The DJ who brought a live saxophone to the dancefloor.';
const VICFIX_URL   = 'https://djvicofficial.com/thevicfix/sahil-madaan/';
// ====================================================

const resend = new Resend(RESEND_API_KEY);
const shouldSend = process.argv.includes('--send');
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- 1. Blog posts from RSS ---
const feed = await new Parser().parseURL(BLOG_RSS_URL);
const posts = (feed.items || []).slice(0, BLOG_COUNT);
const blogHtml = posts.map((p, i) => `
      <p style="margin:0;font-family:'Inter',Arial,sans-serif;font-weight:600;font-size:16px;color:#E8E8E0;">${esc(p.title)}</p>
      <p style="margin:4px 0 6px 0;font-family:'Inter',Arial,sans-serif;font-size:13px;line-height:1.6;color:#9a9a92;">${esc((p.contentSnippet || p.content || '').slice(0, 140))}</p>
      <a href="${p.link}" style="font-family:'Inter',Arial,sans-serif;font-weight:600;font-size:12px;letter-spacing:1px;color:#C9A84C;text-decoration:none;text-transform:uppercase;">Read &rarr;</a>
      ${i < posts.length - 1 ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;background-color:#1c1c1a;font-size:0;line-height:0;padding-top:18px;">&nbsp;</td></tr></table><div style="height:14px;font-size:0;line-height:14px;">&nbsp;</div>` : ''}`
).join('') || '<p style="color:#9a9a92;font-family:Arial,sans-serif;font-size:13px;">No posts found.</p>';

// --- 2. AFTER DARK from the published sheet CSV ---
const csvText = await (await fetch(AFTERDARK_CSV_URL)).text();
const rows = parse(csvText, { relax_column_count: true, skip_empty_lines: true });

const parts = [];
for (const row of rows) {
  const caption = row.find((c) => typeof c === 'string' && /AFTER DARK\s*[\u2014-]\s*Part\s*0?\d+/i.test(c));
  if (!caption) continue;
  const num = (caption.match(/Part\s*0?(\d+)/i) || [])[1];
  const headline = caption.split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
  const linkCell = row.find((c) => c !== caption && typeof c === 'string' && /https?:\/\//.test(c));
  const link = linkCell ? linkCell.match(/https?:\/\/\S+/)[0] : 'https://www.instagram.com/thevicfix';
  parts.push({ num: num ? parseInt(num, 10) : 0, headline, link });
}
parts.sort((a, b) => b.num - a.num);
const picked = parts.slice(0, AFTERDARK_COUNT);

const afterDarkHtml = picked.map((it) =>
  `<p style="margin:0 0 8px 0;font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:1.5;color:#E8E8E0;">&bull;&nbsp; ${esc(it.headline)} &nbsp;<a href="${it.link}" style="color:#C9A84C;text-decoration:none;">&rarr;</a></p>`
).join('') || '<p style="color:#9a9a92;font-family:Arial,sans-serif;font-size:13px;">No After Dark parts found.</p>';

// --- 3. Fill the template ---
let html = readFileSync(new URL('./djvic-monthly-template.html', import.meta.url), 'utf8');
const fills = {
  '{{MONTH}}': MONTH,
  '{{INTRO}}': INTRO,
  '{{BLOG_ITEMS}}': blogHtml,
  '{{AFTERDARK_ITEMS}}': afterDarkHtml,
  '{{REMIX_TITLE}}': REMIX_TITLE,
  '{{REMIX_LINE}}': REMIX_LINE,
  '{{VICFIX_TITLE}}': VICFIX_TITLE,
  '{{VICFIX_HOOK}}': VICFIX_HOOK,
  '{{VICFIX_URL}}': VICFIX_URL,
};
for (const [token, value] of Object.entries(fills)) html = html.split(token).join(value);
// note: {{{RESEND_UNSUBSCRIBE_URL}}} is left intact for Resend to handle.

// --- 4. Send ---
const { data, error } = await resend.broadcasts.create({
  segmentId: RESEND_SEGMENT_ID_MONTHLY,
  name: `DJ VIC Monthly — ${MONTH}`,
  from: 'DJ VIC <bookings@djvicofficial.com>',
  replyTo: 'bookings@djvicofficial.com',
  subject: `The Monthly — ${MONTH}`,
  html,
  send: shouldSend,
});

if (error) { console.error('Resend error:', error); process.exit(1); }
console.log(shouldSend
  ? `Sent. Broadcast ID: ${data?.id}`
  : `Draft created (not sent). Review in Resend, then re-run with --send.\nBroadcast ID: ${data?.id}`);
console.log(`Featured ${posts.length} blog post(s) and After Dark parts: ${picked.map((p) => p.num).join(', ') || 'none'}`);
