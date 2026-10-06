import { prisma } from '@/lib/prisma';

/**
 * One-off: reorders Category.sortOrder by everyday-use frequency (most
 * routine first) instead of the arbitrary order they were seeded in — so
 * Home's category grids lead with what people actually use daily/weekly,
 * not what happened to be typed first into prisma/seed.ts.
 *
 * SERVICE and STORE are ranked independently (the app renders them as two
 * separate sections), sharing one sortOrder space since each screen already
 * filters by type before rendering.
 *
 * Update-only — safe to run against a live dev DB.
 * Usage: npm run set-category-popularity
 */
const ORDER: string[] = [
  // SERVICE — most routine first.
  'beauty', // haircuts/grooming
  'healthcare', // routine doctor/dental visits
  'fitness', // gym/yoga, daily-weekly
  'home', // home repairs/cleaning
  'education', // coaching/classes
  'professional',
  'automotive',
  'events',
  'government',
  'other',

  // STORE — most routine first.
  'grocery',
  'food', // restaurants/food delivery
  'pharmacy-store',
  'bakery',
  'retail', // general store
  'cosmetics',
  'fashion',
  'electronics',
  'furniture',
  'pet-garden',
  'books-gifts',
  'auto-parts',
];

async function main() {
  for (let i = 0; i < ORDER.length; i++) {
    const slug = ORDER[i];
    try {
      const updated = await prisma.category.update({
        where: { slug },
        data: { sortOrder: i + 1 },
      });
      console.log(`✅ ${slug} -> sortOrder ${updated.sortOrder}`);
    } catch {
      console.warn(`⚠️  No category with slug "${slug}" — skipped`);
    }
  }
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
