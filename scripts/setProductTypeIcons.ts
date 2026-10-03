import 'dotenv/config';
import { prisma } from '@/lib/prisma';

/**
 * One-off: points each product type at its curated browse image under
 * backend/public/product-types/<slug>.png (served via /assets, see app.ts).
 * All 31 product types now have a generated image.
 *
 * Update-only — safe to run against a live dev DB.
 * Usage: npm run set-product-type-icons
 */
const SLUGS = [
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
  'bakery',
  'grooming',
  'health-wellness',
  'baby-care',
  'meat-fish',
  'frozen-food',
  'cosmetics-makeup',
  'pet-garden-care',
  'home-furnishing',
  'hardware-tools',
  'mobile-accessories',
  'mens-fashion',
  'womens-fashion',
  'footwear',
  'fashion-accessories',
  'electronics-gadgets',
  'auto-parts',
  'stationery',
  'books',
  'gifts-toys',
];

async function main() {
  for (const slug of SLUGS) {
    try {
      const updated = await prisma.productType.update({
        where: { slug },
        data: { iconUrl: `/assets/product-types/${slug}.png` },
      });
      console.log(`✅ ${slug} -> ${updated.iconUrl}`);
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
