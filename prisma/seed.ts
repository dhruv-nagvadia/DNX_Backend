import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Full category -> subcategory (business type) taxonomy.
 * Each group holds the specific business types a provider can register as.
 */
const taxonomy: { slug: string; name: string; sub: string[] }[] = [
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
    slug: 'retail',
    name: 'Retail & Stores',
    sub: [
      'Kirana / Grocery Store',
      'Supermarket',
      'Stationery',
      'Mobile & Electronics',
      'Clothing Store',
      'Hardware Store',
    ],
  },
  {
    slug: 'food',
    name: 'Food & Hospitality',
    sub: ['Restaurant', 'Cafe', 'Bakery', 'Cloud Kitchen', 'Tiffin Service', 'Sweet Shop'],
  },
  {
    slug: 'government',
    name: 'Government & Documentation',
    sub: ['Passport & Visa Services', 'Aadhaar / PAN Services', 'Notary & Attestation', 'Tax Filing'],
  },
  {
    slug: 'other',
    name: 'Other Services',
    sub: ['Laundry & Dry Cleaning', 'Tailor', 'Cobbler', 'Courier & Logistics', 'Pet Grooming'],
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
      data: { slug: cat.slug, name: cat.name, sortOrder: catOrder++ },
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
