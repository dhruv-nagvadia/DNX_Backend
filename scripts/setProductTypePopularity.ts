import { prisma } from '@/lib/prisma';

/**
 * One-off: reorders ProductType.sortOrder by everyday-use frequency (most
 * routine first) instead of the taxonomy-group order they were seeded in —
 * so "Shop by product" leads with what people actually buy daily/weekly
 * (fruits & veg, dairy, staples, toiletries…), not auto parts or gift wrap.
 *
 * Update-only — safe to run against a live dev DB.
 * Usage: npm run set-product-type-popularity
 */
const ORDER: string[] = [
  // Daily/near-daily grocery + personal-care staples.
  'fruits-vegetables',
  'dairy-eggs',
  'staples',
  'snacks',
  'beverages',
  'bath-body',
  'oral-care',
  'hair-care',
  'skin-care',
  'cleaning',
  'kitchen-dining',

  // Weekly / regular.
  'bakery',
  'grooming',
  'health-wellness',
  'baby-care',
  'meat-fish',
  'frozen-food',
  'cosmetics-makeup',
  'pet-garden-care',

  // Occasional.
  'home-furnishing',
  'hardware-tools',
  'mobile-accessories',
  'mens-fashion',
  'womens-fashion',
  'footwear',
  'fashion-accessories',

  // Rare.
  'electronics-gadgets',
  'auto-parts',
  'stationery',
  'books',
  'gifts-toys',
];

async function main() {
  for (let i = 0; i < ORDER.length; i++) {
    const slug = ORDER[i];
    try {
      const updated = await prisma.productType.update({
        where: { slug },
        data: { sortOrder: i + 1 },
      });
      console.log(`✅ ${slug} -> sortOrder ${updated.sortOrder}`);
    } catch {
      console.warn(`⚠️  No product type with slug "${slug}" — skipped`);
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
