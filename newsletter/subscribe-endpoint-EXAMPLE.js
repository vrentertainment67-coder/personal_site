// subscribe-endpoint-EXAMPLE.js
//
// STARTER for wiring your site's signup forms to Resend. ADAPT to your setup:
//  - In Astro, this can live at src/pages/api/subscribe.js (server output / SSR or an adapter).
//  - Your footer form (DJ VIC monthly) should POST here with list="monthly".
//  - Your Vic Fix episode-page form should POST here with list="weekly".
//
// What it does: adds the contact to the right Resend audience AND sends the matching welcome.
// (Newer Resend SDKs manage contacts via the /contacts endpoint; the method name/params
//  may be `resend.contacts.create({ email, audienceId })` — confirm against your installed SDK.)

import { Resend } from 'resend';
import { readFileSync } from 'node:fs';

const resend = new Resend(process.env.RESEND_API_KEY);

const LISTS = {
  monthly: {
    audienceId: process.env.RESEND_SEGMENT_ID_MONTHLY,
    from: 'DJ VIC <bookings@djvicofficial.com>',
    subject: 'Welcome in.',
    welcomeFile: './djvic-welcome.html',
  },
  weekly: {
    audienceId: process.env.RESEND_SEGMENT_ID_WEEKLY,
    from: 'The Vic Fix <bookings@djvicofficial.com>',
    subject: "You're on the list.",
    welcomeFile: './vicfix-welcome.html',
  },
};

export async function POST({ request }) {
  try {
    const { email, list = 'monthly' } = await request.json();
    const cfg = LISTS[list] || LISTS.monthly;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400 });
    }

    // 1. Add to the audience (single opt-in)
    await resend.contacts.create({ email, audienceId: cfg.audienceId, unsubscribed: false });

    // 2. Send the matching welcome
    const html = readFileSync(new URL(cfg.welcomeFile, import.meta.url), 'utf8');
    await resend.emails.send({ from: cfg.from, to: email, subject: cfg.subject, html });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), { status: 500 });
  }
}
