// send-newsletter.mjs
// Sends the Vic Fix newsletter to your Resend audience.
//
// SETUP (once):
//   1. npm install resend
//   2. Verify djvicofficial.com in Resend (Domains -> add the DNS records they give you).
//   3. In Resend, create an Audience and import contacts.csv. Copy its ID.
//   4. Create a .env file in this folder:
//        RESEND_API_KEY=re_your_key_here
//        RESEND_SEGMENT_ID_WEEKLY=your_audience_id_here
//
// RUN:
//   Draft only (safe — review in Resend dashboard first):
//     node --env-file=.env send-newsletter.mjs
//   Actually send to everyone:
//     node --env-file=.env send-newsletter.mjs --send
//
// (Requires Node 20.6+ for --env-file. Otherwise: npm i dotenv and add `import 'dotenv/config'` up top.)

import { readFileSync } from 'node:fs';
import { Resend } from 'resend';

const { RESEND_API_KEY, RESEND_SEGMENT_ID_WEEKLY } = process.env;

if (!RESEND_API_KEY || !RESEND_SEGMENT_ID_WEEKLY) {
  console.error('Missing RESEND_API_KEY or RESEND_SEGMENT_ID_WEEKLY. Set them in .env first.');
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);
const shouldSend = process.argv.includes('--send');

// --- Edit these two lines each week ---
const SUBJECT = 'The DJ who plays live sax on the dancefloor.';
const HTML_FILE = './vicfix-sahil-s2e15.html';
// --------------------------------------

const html = readFileSync(new URL(HTML_FILE, import.meta.url), 'utf8');

const { data, error } = await resend.broadcasts.create({
  audienceId: RESEND_SEGMENT_ID_WEEKLY,
  name: 'Vic Fix — S2E15 Sahil Madaan',
  from: 'The Vic Fix <bookings@djvicofficial.com>',
  replyTo: 'bookings@djvicofficial.com',
  subject: SUBJECT,
  html,
  send: shouldSend, // false = draft you review in Resend; true = sends now
});

if (error) {
  console.error('Resend error:', error);
  process.exit(1);
}

console.log(
  shouldSend
    ? `Sent. Broadcast ID: ${data?.id}`
    : `Draft created (not sent). Review it in Resend, then re-run with --send.\nBroadcast ID: ${data?.id}`
);
