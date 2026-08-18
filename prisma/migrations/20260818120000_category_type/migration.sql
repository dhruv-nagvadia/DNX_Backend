-- AlterTable
ALTER TABLE "Category" ADD COLUMN "type" "BusinessType" NOT NULL DEFAULT 'SERVICE';

-- Mark the goods/store categories so the picker can filter by business type.
UPDATE "Category" SET "type" = 'STORE' WHERE "slug" IN ('retail', 'food');

-- Give the retail/store category the common shop types (idempotent on slug).
INSERT INTO "Subcategory" ("id", "categoryId", "slug", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", v.slug, v.name, true, v.ord, NOW(), NOW()
FROM "Category" c
CROSS JOIN (VALUES
  ('retail-general-store', 'General Store', 10),
  ('retail-dairy-amul', 'Dairy / Amul Parlour', 11),
  ('retail-medical-pharmacy', 'Medical / Pharmacy Store', 12),
  ('retail-cosmetics', 'Cosmetics & Beauty Store', 13),
  ('retail-fruits-vegetables', 'Fruits & Vegetables', 14),
  ('retail-sweets-bakery', 'Sweets & Bakery', 15)
) AS v(slug, name, ord)
WHERE c."slug" = 'retail'
ON CONFLICT ("slug") DO NOTHING;
