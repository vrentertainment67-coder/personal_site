import { getCollection } from 'astro:content';

// ── Editorial strands (categories) ──────────────────────────────────────
export const CATEGORIES = [
  { key: 'behind-the-decks',      label: 'Behind the Decks',      desc: 'The DJs.' },
  { key: 'room-makers',           label: 'The Room Makers',       desc: 'The venue owners.' },
  { key: 'architects',            label: 'The Architects',        desc: 'The founders & builders.' },
  { key: 'other-side-of-the-bar', label: 'Other Side of the Bar', desc: 'The bartenders.' },
  { key: 'bigger-picture',        label: 'The Bigger Picture',    desc: 'Industry, scene & culture.' },
];
export const catLabel = (k) => (CATEGORIES.find((c) => c.key === k) || {}).label || k;

// Until guest_type is backfilled, derive a rough person-type from the strand.
export const TYPE_FROM_CAT = { 'behind-the-decks': 'dj', 'room-makers': 'venue', 'architects': 'founder', 'other-side-of-the-bar': 'bartender', 'bigger-picture': 'voice' };
export const PERSON = [
  { key: 'dj', label: 'DJs', sub: 'Selectors, residents & headliners.' },
  { key: 'founder', label: 'Founders', sub: 'The ones who started it.' },
  { key: 'venue', label: 'Venue Owners', sub: 'The room makers.' },
  { key: 'bartender', label: 'Bartenders', sub: 'The other side of the bar.' },
  { key: 'voice', label: 'Voices & Artists', sub: 'Hosts, artists, the wider scene.' },
];

export const slugifyTopic = (t) => t.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const initials = (name) => name.split(/[\s&.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const dueto = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; const a = 20 + (h % 14), b = 28 + ((h >> 4) % 18); return `background:radial-gradient(120% 130% at 78% 18%, hsl(42,40%,${10 + (h % 5)}%), transparent 55%),linear-gradient(150deg,hsl(${a},22%,9%),hsl(${b},30%,15%))`; };

// ── Single source of truth for the episode catalogue ─────────────────────
export async function getEpisodes() {
  const all = (await getCollection('vicfixEpisodes')).sort((a, b) => (a.data.season !== b.data.season ? b.data.season - a.data.season : b.data.episode - a.data.episode));
  return all.map((e) => ({
    n: e.data.episode, s: e.data.season,
    name: e.data.guestName, role: e.data.guestTitle,
    slug: `/thevicfix/${e.id}/`,
    cat: e.data.category, catLabel: e.data.categoryLabel || catLabel(e.data.category),
    topics: e.data.topics || [],
    hook: e.data.tagline || '',
    pop: parseInt(e.data.viewCount, 10) || 0,
    type: TYPE_FROM_CAT[e.data.category] || 'voice',
    thumb: e.data.guestPhoto || (e.data.youtubeId ? `https://img.youtube.com/vi/${e.data.youtubeId}/hqdefault.jpg` : ''),
    duration: e.data.duration || '',
    featured: !!e.data.featured,
    yt: e.data.youtubeId || '',
  }));
}

// Topic threads, most-populated first.
export function buildTopicSet(eps) {
  return [...new Set(eps.flatMap((e) => e.topics))]
    .map((t) => ({ key: slugifyTopic(t), label: t, count: eps.filter((e) => e.topics.includes(t)).length }))
    .sort((a, b) => b.count - a.count);
}

// A tight, curated set of flagship threads — NOT all 164. Keeps collection
// tiles a real shortlist (and avoids thin-content facet pages). Threshold
// relaxes only if too few qualify, and the set is hard-capped.
export function getFlagshipTopics(topicSet) {
  let flag = topicSet.filter((t) => t.count >= 3);
  if (flag.length < 4) flag = topicSet.filter((t) => t.count >= 2);
  return flag.slice(0, 8);
}
