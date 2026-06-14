// Build-time JSON of blog-post image slots, consumed by the admin "Page Images"
// tab so every blog post's hero/thumbnail is replaceable without code changes.
// New posts appear here automatically — no manual registry edits needed.
import { getCollection } from 'astro:content';

export async function GET() {
  const posts = await getCollection('blog');
  const slots = posts
    .sort((a, b) => {
      const da = a.data.publishDate ?? (a.data.date ? new Date(a.data.date) : new Date(0));
      const db = b.data.publishDate ?? (b.data.date ? new Date(b.data.date) : new Date(0));
      return db.getTime() - da.getTime();
    })
    .map((p) => ({
      slot: `blog.${p.id}`,
      label: p.data.title,
      page: 'Blog',
      size: '1200 × 800 px · landscape',
      default: p.data.image || p.data.ogImage || '/images/og-default.jpg',
    }));
  return new Response(JSON.stringify(slots), {
    headers: { 'Content-Type': 'application/json' },
  });
}
