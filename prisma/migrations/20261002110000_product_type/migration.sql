-- CreateTable
CREATE TABLE "ProductType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_slug_key" ON "ProductType"("slug");

-- CreateIndex
CREATE INDEX "ProductType_isActive_idx" ON "ProductType"("isActive");

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "productTypeId" TEXT;

-- CreateIndex
CREATE INDEX "Product_productTypeId_idx" ON "Product"("productTypeId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the taxonomy (one-time data load — not re-run via prisma/seed.ts, so
-- re-seeding Category/Provider/Booking data never disturbs this).
INSERT INTO "ProductType" ("id", "slug", "name", "sortOrder", "updatedAt") VALUES
    ('pt_fruits_vegetables',    'fruits-vegetables',   'Fruits & Vegetables',             1, CURRENT_TIMESTAMP),
    ('pt_dairy_eggs',           'dairy-eggs',          'Dairy & Eggs',                    2, CURRENT_TIMESTAMP),
    ('pt_meat_fish',            'meat-fish',           'Meat, Fish & Poultry',            3, CURRENT_TIMESTAMP),
    ('pt_staples',              'staples',             'Atta, Rice & Dal',                4, CURRENT_TIMESTAMP),
    ('pt_snacks',               'snacks',              'Snacks & Branded Foods',          5, CURRENT_TIMESTAMP),
    ('pt_beverages',            'beverages',           'Beverages',                       6, CURRENT_TIMESTAMP),
    ('pt_bakery',               'bakery',              'Bakery & Biscuits',               7, CURRENT_TIMESTAMP),
    ('pt_frozen_food',          'frozen-food',         'Frozen Food',                     8, CURRENT_TIMESTAMP),
    ('pt_bath_body',            'bath-body',           'Bath & Body',                     9, CURRENT_TIMESTAMP),
    ('pt_hair_care',            'hair-care',           'Hair Care',                      10, CURRENT_TIMESTAMP),
    ('pt_skin_care',            'skin-care',           'Skin Care',                      11, CURRENT_TIMESTAMP),
    ('pt_oral_care',            'oral-care',           'Oral Care',                      12, CURRENT_TIMESTAMP),
    ('pt_grooming',             'grooming',            'Grooming & Shaving',             13, CURRENT_TIMESTAMP),
    ('pt_cosmetics_makeup',     'cosmetics-makeup',    'Cosmetics & Makeup',             14, CURRENT_TIMESTAMP),
    ('pt_cleaning',             'cleaning',            'Cleaning Supplies',              15, CURRENT_TIMESTAMP),
    ('pt_kitchen_dining',       'kitchen-dining',      'Kitchen & Dining',               16, CURRENT_TIMESTAMP),
    ('pt_home_furnishing',      'home-furnishing',     'Home & Furnishing',              17, CURRENT_TIMESTAMP),
    ('pt_hardware_tools',       'hardware-tools',      'Hardware & Tools',               18, CURRENT_TIMESTAMP),
    ('pt_baby_care',            'baby-care',           'Baby Care',                      19, CURRENT_TIMESTAMP),
    ('pt_pet_garden',           'pet-garden-care',     'Pet & Garden Care',              20, CURRENT_TIMESTAMP),
    ('pt_health_wellness',      'health-wellness',     'Health & Wellness',              21, CURRENT_TIMESTAMP),
    ('pt_mens_fashion',         'mens-fashion',        'Men''s Fashion',                 22, CURRENT_TIMESTAMP),
    ('pt_womens_fashion',       'womens-fashion',      'Women''s Fashion',               23, CURRENT_TIMESTAMP),
    ('pt_footwear',             'footwear',            'Footwear',                      24, CURRENT_TIMESTAMP),
    ('pt_fashion_accessories',  'fashion-accessories', 'Bags, Watches & Accessories',    25, CURRENT_TIMESTAMP),
    ('pt_mobile_accessories',   'mobile-accessories',  'Mobile & Electronics Accessories', 26, CURRENT_TIMESTAMP),
    ('pt_electronics_gadgets',  'electronics-gadgets', 'Electronics & Gadgets',          27, CURRENT_TIMESTAMP),
    ('pt_auto_parts',           'auto-parts',          'Auto Parts & Accessories',       28, CURRENT_TIMESTAMP),
    ('pt_stationery',           'stationery',          'Stationery & Office Supplies',   29, CURRENT_TIMESTAMP),
    ('pt_books',                'books',               'Books',                          30, CURRENT_TIMESTAMP),
    ('pt_gifts_toys',           'gifts-toys',          'Gifts & Toys',                   31, CURRENT_TIMESTAMP);
