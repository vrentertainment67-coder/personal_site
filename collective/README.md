# Bengaluru DJs Collective — bengalurudjscollective.com

The Collective's own site. It used to live at `djvicofficial.com/djcollective/`;
that URL is now a redirect stub (`src/pages/djcollective.astro` in the parent
project) pointing here.

This is a **separate Astro project inside the same repo**, because GitHub Pages
serves only one custom domain per repository — `djvicofficial.com` already owns
that slot, so this site needs its own host.

## Local

```bash
cd collective
npm install
npm run dev      # http://localhost:4321
npm run build    # → collective/dist
```

## Deploy (Cloudflare Workers — "Connect to Git")

`wrangler.jsonc` in this folder configures a **static-assets Worker**: no Worker
script, `assets.directory` alone serves the built Astro output. Set up once in
the Cloudflare dashboard:

| Field | Value |
|---|---|
| Project name | `bengaluru-djs-collective` |
| Build command | `npm install && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Path / Root directory | `collective` |
| Production branch | `master` |

> The project name defaults to the repo name (`personal_site`), which Cloudflare
> rejects — underscores aren't allowed, only lowercase letters, numbers and
> dashes. Change it before deploying.

Then **Settings → Domains & Routes → Add → Custom domain →**
`bengalurudjscollective.com`. Cloudflare adds the DNS itself since the domain is
in the same account. Add `www` too if you want it to resolve.

After that, every push to `master` redeploys automatically. The parent DJ VIC
site keeps deploying to GitHub Pages exactly as before — the two are
independent.

Verify the config locally before pushing:

```bash
cd collective && npm run build && npx wrangler deploy --dry-run
```

(Cloudflare Pages also still works if you prefer it — same build command, with
output directory `collective/dist`. `wrangler.jsonc` is simply ignored there.)

## Making the old URL a real 301 (optional)

The `/djcollective/` stub uses `rel=canonical` + meta-refresh, because GitHub
Pages can't issue real redirects. If `djvicofficial.com`'s DNS is also on
Cloudflare, a proper 301 is better for SEO:

> Rules → Redirect Rules → Create → match `/djcollective*` →
> static redirect to `https://bengalurudjscollective.com/`, status **301**.

Then `src/pages/djcollective.astro` can be deleted.

## What lives where

| Thing | Where |
|---|---|
| The page | `src/pages/index.astro` (root `/`) |
| Live stats island | `src/components/CollectiveStats.jsx` |
| RSVP popup | `src/components/DJCollectivePopup.jsx` |
| Logo / OG image | `public/images/` |
| Page shell, meta, schema | `src/layouts/Base.astro` |

These components were **moved** out of the parent project, not copied — there
is only one copy, so there's nothing to keep in sync.

## Backend — unchanged

Still the same Supabase project (`jftnhuutttmccmqnnybf`), same tables, same
RPCs: `djc_rsvp`, `dj_collective_attendees`, `dj_collective_stats`,
`dj_collective_subscribe`. Supabase's data API allows any origin, so the domain
change needed no database work — verified against the live API from this origin.

RSVPs continue to appear in **/admin → Collective** exactly as before, since
they write to the same `dj_collective_rsvps` table.

## Editing an edition

Same as before: the `EDITION` object at the top of `src/pages/index.astro` is
the only monthly swap (date, venue, deal). `SESSION` in
`src/components/DJCollectivePopup.jsx` tags RSVPs per edition — bump it for a
new edition so the admin can tell them apart.
