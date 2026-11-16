-- Category / sub-category photos served by the backend (public/ → /assets).
ALTER TABLE "Category" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Category" ADD COLUMN "bannerUrl" TEXT;
ALTER TABLE "Subcategory" ADD COLUMN "imageUrl" TEXT;

-- Every category has its own photo at public/categories/<slug>.jpg.
UPDATE "Category" SET "imageUrl" = '/assets/categories/' || "slug" || '.jpg'
WHERE "slug" IN (
  'grocery', 'food', 'pharmacy-store', 'bakery', 'retail', 'cosmetics', 'fashion',
  'electronics', 'furniture', 'pet-garden', 'books-gifts', 'auto-parts',
  'beauty', 'healthcare', 'fitness', 'home', 'education', 'professional',
  'automotive', 'events', 'government', 'other'
);

-- Wide banners (public/categories/banners/<slug>.jpg); the rest fall back to imageUrl.
UPDATE "Category" SET "bannerUrl" = '/assets/categories/banners/' || "slug" || '.jpg'
WHERE "slug" IN ('beauty');

-- Sub-category photos (public/subcategories/<slug>.jpg).
UPDATE "Subcategory" SET "imageUrl" = '/assets/subcategories/' || "slug" || '.jpg'
WHERE "slug" IN (
  'beauty-unisex-salon', 'beauty-men-s-salon-barber', 'beauty-women-s-beauty-parlour',
  'beauty-spa-massage', 'beauty-nail-studio', 'beauty-makeup-artist', 'beauty-tattoo-studio'
);
