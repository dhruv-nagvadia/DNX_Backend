import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Full category -> subcategory (business type) taxonomy.
 * Each group holds the specific business types a provider can register as.
 */
type BizType = 'SERVICE' | 'STORE';

const taxonomy: { slug: string; name: string; sub: string[]; type?: BizType }[] = [
  {
    slug: 'healthcare',
    name: 'Healthcare',
    sub: [
      'General Physician (MD)',
      'Dentist',
      'Pediatrician',
      'Dermatologist',
      'Gynecologist',
      'Orthopedic',
      'ENT Specialist',
      'Eye Specialist',
      'Cardiologist',
      'Psychologist / Therapist',
      'Physiotherapist',
      'Ayurveda / Homeopathy',
      'Veterinary',
      'Diagnostic Lab',
      'Pharmacy',
    ],
  },
  {
    slug: 'beauty',
    name: 'Beauty & Wellness',
    sub: [
      'Unisex Salon',
      "Men's Salon / Barber",
      "Women's Beauty Parlour",
      'Spa & Massage',
      'Nail Studio',
      'Makeup Artist',
      'Tattoo Studio',
    ],
  },
  {
    slug: 'fitness',
    name: 'Fitness',
    sub: ['Gym', 'Yoga Studio', 'Personal Trainer', 'Dance Studio', 'Martial Arts', 'Zumba / Aerobics'],
  },
  {
    slug: 'education',
    name: 'Education & Coaching',
    sub: [
      'Private Tutor',
      'Coaching Institute',
      'Music Classes',
      'Language Classes',
      'Skill / Vocational Training',
      'Driving School',
    ],
  },
  {
    slug: 'home',
    name: 'Home Services',
    sub: [
      'Plumber',
      'Electrician',
      'Carpenter',
      'Painter',
      'AC & Appliance Repair',
      'Pest Control',
      'Home Cleaning',
      'Packers & Movers',
      'Interior Designer',
      'Locksmith',
      'Gardener / Landscaping',
    ],
  },
  {
    slug: 'automotive',
    name: 'Automotive',
    sub: ['Car Mechanic', 'Bike Mechanic', 'Car Wash & Detailing', 'Tyre & Puncture', 'Car Rental'],
  },
  {
    slug: 'professional',
    name: 'Professional Services',
    sub: [
      'Lawyer',
      'Chartered Accountant (CA)',
      'Financial Advisor',
      'Real Estate Agent',
      'Insurance Agent',
      'Notary',
    ],
  },
  {
    slug: 'events',
    name: 'Events & Photography',
    sub: ['Photographer', 'Videographer', 'Event Planner', 'Caterer', 'Decorator', 'DJ / Music'],
  },
  {
    // Catch-all for a store that doesn't fit any of the more specific store
    // categories below — kept intentionally small since Grocery, Pharmacy,
    // Fashion, Electronics, Furniture, Books/Gifts, Cosmetics, Bakery, Pet,
    // and Auto Parts now each have their own dedicated category.
    slug: 'retail',
    name: 'General Store',
    type: 'STORE',
    sub: ['Supermarket', 'General / Miscellaneous Store'],
  },
  {
    slug: 'food',
    name: 'Food & Hospitality',
    type: 'STORE',
    sub: ['Restaurant', 'Cafe', 'Cloud Kitchen', 'Tiffin Service'],
  },
  {
    slug: 'government',
    name: 'Government & Documentation',
    sub: ['Passport & Visa Services', 'Aadhaar / PAN Services', 'Notary & Attestation', 'Tax Filing'],
  },
  {
    slug: 'other',
    name: 'Other Services',
    sub: [
      'Laundry & Dry Cleaning',
      'Tailor',
      'Cobbler',
      'Courier & Logistics',
      'Pet Grooming',
      'Daycare / Babysitting',
      'Mobile & Computer Repair Service',
      'Security Services',
    ],
  },
  {
    slug: 'grocery',
    name: 'Grocery & Daily Needs',
    type: 'STORE',
    sub: ['Kirana / Grocery Store', 'Supermarket', 'Dairy / Amul Parlour', 'Fruits & Vegetables', 'General Store'],
  },
  {
    slug: 'pharmacy-store',
    name: 'Pharmacy & Medical Store',
    type: 'STORE',
    sub: ['Medical / Pharmacy Store', 'Ayurvedic & Herbal Store', 'Health Supplements Store', 'Optical Store'],
  },
  {
    slug: 'fashion',
    name: 'Fashion & Apparel',
    type: 'STORE',
    sub: [
      "Men's Clothing",
      "Women's Clothing",
      'Kids Wear',
      'Footwear Store',
      'Jewellery Store',
      'Bags & Accessories',
    ],
  },
  {
    slug: 'electronics',
    name: 'Electronics & Mobiles',
    type: 'STORE',
    sub: ['Mobile Store', 'Electronics & Appliances', 'Computer & Laptop Store', 'Mobile Repair & Accessories'],
  },
  {
    slug: 'furniture',
    name: 'Home, Furniture & Hardware',
    type: 'STORE',
    sub: ['Furniture Store', 'Home Decor Store', 'Hardware Store', 'Paint Store', 'Electrical & Sanitary Store'],
  },
  {
    slug: 'books-gifts',
    name: 'Books, Gifts & Stationery',
    type: 'STORE',
    sub: ['Bookstore', 'Stationery Store', 'Gift Shop', 'Toy Store'],
  },
  {
    slug: 'cosmetics',
    name: 'Beauty & Cosmetics Store',
    type: 'STORE',
    sub: ['Cosmetics & Beauty Store', 'Perfume Store'],
  },
  {
    slug: 'bakery',
    name: 'Bakery & Sweets',
    type: 'STORE',
    sub: ['Bakery', 'Sweet Shop', 'Confectionery'],
  },
  {
    slug: 'pet-garden',
    name: 'Pet & Garden Store',
    type: 'STORE',
    sub: ['Pet Store', 'Nursery & Plants', 'Cattle Feed / Agri Store'],
  },
  {
    slug: 'auto-parts',
    name: 'Auto Parts & Accessories',
    type: 'STORE',
    sub: ['Auto Parts Store', 'Tyre Shop', 'Bike Accessories Store'],
  },
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function main() {
  // Clean reset of the taxonomy + businesses (users are kept).
  await prisma.booking.deleteMany();
  await prisma.provider.deleteMany(); // cascades services
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();

  let catOrder = 1;
  for (const cat of taxonomy) {
    const category = await prisma.category.create({
      data: { slug: cat.slug, name: cat.name, sortOrder: catOrder++, type: cat.type ?? 'SERVICE' },
    });

    await prisma.subcategory.createMany({
      data: cat.sub.map((name, i) => ({
        categoryId: category.id,
        slug: `${cat.slug}-${slugify(name)}`,
        name,
        sortOrder: i + 1,
      })),
    });
  }

  const catCount = taxonomy.length;
  const subCount = taxonomy.reduce((n, c) => n + c.sub.length, 0);
  console.log(`Seeded ${catCount} categories and ${subCount} business types`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
