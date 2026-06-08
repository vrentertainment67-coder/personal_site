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
import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import { parse } from 'csv-parse/sync';

const { RESEND_API_KEY, RESEND_SEGMENT_ID_MONTHLY, AFTERDARK_CSV_URL, BLOG_RSS_URL,
        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
for (const [k, v] of Object.entries({ RESEND_API_KEY, RESEND_SEGMENT_ID_MONTHLY, AFTERDARK_CSV_URL, BLOG_RSS_URL })) {
  if (!v) { console.error(`Missing ${k} in .env`); process.exit(1); }
}
const sb = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// ===== EDIT THESE EACH MONTH (the curated bits) =====
const MONTH = 'JUNE 2026';
const INTRO = 'New episodes, a mashup that shouldn\u2019t work but absolutely does, and three more After Dark truths about the rooms we love.';
const BLOG_COUNT = 2;        // how many latest blog posts to feature
const AFTERDARK_COUNT = 3;   // how many recent After Dark parts to feature
const REMIX_TITLE = 'Ranjha x Qulma \u2014 Diljit Dosanjh x Shamka (Punjabi Afro House Mashup)';
const REMIX_LINE  = 'Diljit\u2019s heartbreak from Ranjha meets Shamka\u2019s Qulma \u2014 two worlds, one frequency. Punjabi soul flipped for the dancefloor.';
const VICFIX_TITLE = 'Sahil Madaan \u2014 S2E15';
const VICFIX_HOOK  = 'The DJ who brought a live saxophone to the dancefloor \u2014 and changed how the room felt music.';
const VICFIX_URL   = 'https://djvicofficial.com/thevicfix/sahil-madaan/';
// Guest thumbnail \u2014 use the episode's YouTube-style card from public/images/vicfix/guests/
// If no guest image exists yet, fall back to the hero shot of Vic.
const VICFIX_IMG   = 'https://djvicofficial.com/images/vicfix/guests/sahil-madaan.jpg';
// ====================================================

const resend = new Resend(RESEND_API_KEY);
const shouldSend = process.argv.includes('--send');
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- 1. Blog posts from RSS ---
const feed = await new Parser().parseURL(BLOG_RSS_URL);
const posts = (feed.items || []).slice(0, BLOG_COUNT);
const blogHtml = posts.map((p, i) => `
      <p style="margin:0 0 5px 0;font-family:'Bebas Neue',Impact,'Arial Narrow',sans-serif;font-weight:400;font-size:22px;letter-spacing:1.5px;color:#E8E8E0;line-height:1.15;">${esc(p.title)}</p>
      <p style="margin:0 0 10px 0;font-family:Georgia,serif;font-style:italic;font-size:13px;line-height:1.65;color:#9a9a92;">${esc((p.contentSnippet || p.content || '').slice(0, 160))}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-bottom:2px solid #C9A84C;padding-bottom:3px;"><a href="${p.link}" style="font-family:Arial,sans-serif;font-weight:600;font-size:10px;letter-spacing:3px;color:#C9A84C;text-decoration:none;text-transform:uppercase;">Read &rarr;</a></td></tr></table>
      ${i < posts.length - 1 ? `<div style="height:24px;font-size:0;line-height:24px;">&nbsp;</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;background-color:#1e1e1a;font-size:0;line-height:0;">&nbsp;</td></tr></table><div style="height:24px;font-size:0;line-height:24px;">&nbsp;</div>` : ''}`
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

const afterDarkHtml = picked.map((it, i) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="width:56px;vertical-align:top;padding-right:16px;">
      <p style="margin:2px 0 0 0;font-family:Arial,sans-serif;font-weight:600;font-size:8px;letter-spacing:3px;color:#C9A84C;text-transform:uppercase;white-space:nowrap;">PART ${String(it.num).padStart(2,'0')}</p>
    </td>
    <td style="vertical-align:top;border-left:1px solid #2a2a22;padding-left:16px;">
      <p style="margin:0 0 6px 0;font-family:'Bebas Neue',Impact,'Arial Narrow',sans-serif;font-weight:400;font-size:19px;letter-spacing:1px;color:#E8E8E0;line-height:1.2;">${esc(it.headline)}</p>
      <a href="${it.link}" style="font-family:Arial,sans-serif;font-weight:600;font-size:9px;letter-spacing:3px;color:#C9A84C;text-decoration:none;text-transform:uppercase;">Read &rarr;</a>
    </td>
  </tr>
  </table>
  ${i < picked.length - 1 ? `<div style="height:20px;font-size:0;line-height:20px;">&nbsp;</div>` : ''}
`).join('') || '<p style="color:#9a9a92;font-family:Arial,sans-serif;font-size:13px;">No After Dark parts found.</p>';

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
  '{{VICFIX_IMG}}': VICFIX_IMG,
};
for (const [token, value] of Object.entries(fills)) html = html.split(token).join(value);
// note: {{{RESEND_UNSUBSCRIBE_URL}}} is left intact for Resend to handle.

// --- 4. Send ---
const { data, error } = await resend.broadcasts.create({
  audienceId: RESEND_SEGMENT_ID_MONTHLY,
  name: `DJ VIC Monthly — ${MONTH}`,
  from: 'DJ VIC <bookings@djvicofficial.com>',
  replyTo: 'bookings@djvicofficial.com',
  subject: `The Monthly — ${MONTH}`,
  html,
  send: shouldSend,
});

if (error) { console.error('Resend error:', error); process.exit(1); }

// --- 5. Log to Supabase newsletter_drafts (powers admin History tab) ---
if (sb && data?.id) {
  const { error: dbErr } = await sb.from('newsletter_drafts').upsert({
    subject: `The Monthly — ${MONTH}`,
    html,
    audience: 'monthly',
    status: shouldSend ? 'sent' : 'draft',
    resend_broadcast_id: data.id,
    recipient_count: 0,
    ...(shouldSend ? { sent_at: new Date().toISOString() } : {}),
  }, { onConflict: 'resend_broadcast_id' });
  if (dbErr) console.warn('Supabase log warning:', dbErr.message);
  else console.log('Logged to admin History tab ✓');
}

console.log(shouldSend
  ? `Sent. Broadcast ID: ${data?.id}`
  : `Draft created (not sent). Review in Resend, then re-run with --send.\nBroadcast ID: ${data?.id}`);
console.log(`Featured ${posts.length} blog post(s) and After Dark parts: ${picked.map((p) => p.num).join(', ') || 'none'}`);
