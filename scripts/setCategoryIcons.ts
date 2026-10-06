import { prisma } from '@/lib/prisma';

/**
 * One-off: points each STORE category at its curated browse image under
 * backend/public/categories/<slug>.png (served via /assets, see app.ts).
 * Update-only — never touches Provider/Booking/Subcategory, unlike
 * prisma/seed.ts's full reset, so it's safe to run against a live dev DB.
 *
 * Usage: npm run set-category-icons
 */
const SLUGS = [
  'retail',
  'food',
  'grocery',
  'pharmacy-store',
  'fashion',
  'electronics',
  'furniture',
  'books-gifts',
  'cosmetics',
  'bakery',
  'pet-garden',
  'auto-parts',
];

async function main() {
  for (const slug of SLUGS) {
    try {
      const updated = await prisma.category.update({
        where: { slug },
        data: { iconUrl: `/assets/categories/${slug}.png` },
      });
      console.log(`✅ ${slug} -> ${updated.iconUrl}`);
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
