const fs = require('fs');
const path = require('path');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = 'UCiVpJtVD3eV7s1hpULI3cYg'; // verified via RSS feed: youtube.com/@thedjvicofficial
const EPISODES_DIR = path.join(__dirname, '../src/content/vicfix');
const VIC_FIX_SEARCH_TERM = 'The Vic Fix';

// Fetch latest videos from the channel matching "The Vic Fix"
async function fetchLatestVicFixVideos() {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', YOUTUBE_API_KEY);
  url.searchParams.set('channelId', CHANNEL_ID);
  url.searchParams.set('q', VIC_FIX_SEARCH_TERM);
  url.searchParams.set('type', 'video');
  url.searchParams.set('order', 'date');
  url.searchParams.set('maxResults', '5');
  url.searchParams.set('part', 'snippet');

  console.log('📡 Calling YouTube API...');
  console.log('Channel ID:', CHANNEL_ID);
  console.log('API Key set:', !!YOUTUBE_API_KEY);

  const res = await fetch(url.toString());
  const data = await res.json();

  // Log the full response so we can see any API errors
  if (data.error) {
    console.error('❌ YouTube API error:', JSON.stringify(data.error, null, 2));
    process.exit(1);
  }

  if (!data.items || data.items.length === 0) {
    console.log('⚠️  No results returned from YouTube API');
    console.log('Full response:', JSON.stringify(data, null, 2));
    return [];
  }

  console.log(`✅ Got ${data.items.length} videos from YouTube`);
  return data.items.map(item => ({
    youtubeId: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    publishDate: item.snippet.publishedAt.split('T')[0],
  }));
}

// Get all existing YouTube IDs from episode markdown files
function getExistingEpisodeIds() {
  const files = fs.readdirSync(EPISODES_DIR);
  const ids = new Set();
  files.forEach(file => {
    if (!file.endsWith('.md')) return;
    const content = fs.readFileSync(path.join(EPISODES_DIR, file), 'utf-8');
    const match = content.match(/youtubeId:\s*"([^"]+)"/);
    if (match) ids.add(match[1]);
  });
  return ids;
}

// Get the current highest episode number across all seasons
function getNextEpisodeInfo() {
  const files = fs.readdirSync(EPISODES_DIR);
  let maxSeason = 1;
  let maxEp = 0;

  files.forEach(file => {
    if (!file.endsWith('.md')) return;
    const content = fs.readFileSync(path.join(EPISODES_DIR, file), 'utf-8');
    const seasonMatch = content.match(/season:\s*(\d+)/);
    const epMatch = content.match(/episode:\s*(\d+)/);
    if (seasonMatch && epMatch) {
      const s = parseInt(seasonMatch[1]);
      const e = parseInt(epMatch[1]);
      if (s > maxSeason || (s === maxSeason && e > maxEp)) {
        maxSeason = s;
        maxEp = e;
      }
    }
  });
  return { season: maxSeason, nextEp: maxEp + 1 };
}

// Extract guest name from YouTube video title
// Handles: "Guest Name | The Vic Fix S2E12" or "The Vic Fix | Guest Name — Topic"
function extractGuestName(title) {
  const cleaned = title
    .replace(/The Vic Fix/gi, '')
    .replace(/S\d+E\d+/gi, '')
    .replace(/[|—\-]/g, ' ')
    .replace(/Inside\s+/i, '')
    .replace(/Bangalore['']s\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Take the first meaningful segment
  const parts = cleaned.split(/[,·]/);
  return parts[0].trim();
}

// Convert guest name to URL slug
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .trim();
}

// Create a new episode markdown file
function createEpisodeFile(video, season, epNumber) {
  const guestName = extractGuestName(video.title);
  const slug = toSlug(guestName);
  const filePath = path.join(EPISODES_DIR, `${slug}.md`);

  if (fs.existsSync(filePath)) {
    console.log(`⏭  File already exists: ${slug}.md — skipping`);
    return false;
  }

  // Clean description — first 400 chars, no double quotes
  const bio = video.description
    .slice(0, 400)
    .replace(/"/g, "'")
    .replace(/\n+/g, ' ')
    .trim();

  const content = `---
guestName: "${guestName}"
guestTitle: "Guest — The VIC Fix S${season}E${epNumber}"
season: ${season}
episode: ${epNumber}
youtubeId: "${video.youtubeId}"
category: "behind-the-decks"
categoryLabel: "Behind the Decks"
tagline: ""
bio: "${bio}"
pullQuote: ""
guestPhoto: ""
topics: []
publishDate: "${video.publishDate}"
viewCount: "0"
featured: true
---
`;

  fs.writeFileSync(filePath, content);
  console.log(`✅ Created: ${slug}.md (S${season}E${epNumber} — ${guestName})`);
  return true;
}

// Main
async function main() {
  console.log('🎙️  Vic Fix Auto Sync starting...');
  console.log('Node version:', process.version);

  if (!YOUTUBE_API_KEY) {
    console.error('❌ YOUTUBE_API_KEY secret is not set or empty.');
    console.error('Go to GitHub repo → Settings → Secrets → Actions → add YOUTUBE_API_KEY');
    process.exit(1);
  }

  console.log('✅ API key found');

  const existingIds = getExistingEpisodeIds();
  console.log(`📁 Found ${existingIds.size} existing episodes`);

  const videos = await fetchLatestVicFixVideos();
  console.log(`📺 Found ${videos.length} recent Vic Fix videos on YouTube`);

  let added = 0;
  const { season, nextEp } = getNextEpisodeInfo();

  for (const video of videos) {
    if (existingIds.has(video.youtubeId)) {
      console.log(`✓  Already exists: ${video.title}`);
      continue;
    }

    console.log(`🆕 New episode: ${video.title}`);
    const created = createEpisodeFile(video, season, nextEp + added);
    if (created) added++;
  }

  if (added === 0) {
    console.log('✅ No new episodes found. Site is up to date.');
  } else {
    console.log(`🚀 Added ${added} new episode(s). GitHub Actions will deploy.`);
  }
}

main().catch(err => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
