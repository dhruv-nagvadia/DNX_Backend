import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  { slug: 'medical', name: 'Doctors & Dentists', sortOrder: 1 },
  { slug: 'salon', name: 'Salons & Beauty', sortOrder: 2 },
  { slug: 'fitness', name: 'Fitness & Gyms', sortOrder: 3 },
  { slug: 'tutors', name: 'Tutors & Coaching', sortOrder: 4 },
  { slug: 'legal', name: 'Lawyers & Consultants', sortOrder: 5 },
  { slug: 'mechanic', name: 'Mechanics & Vehicle Services', sortOrder: 6 },
  { slug: 'home-services', name: 'Plumbers & Electricians', sortOrder: 7 },
  { slug: 'cleaning', name: 'Home Cleaning', sortOrder: 8 },
  { slug: 'photographer', name: 'Photographers', sortOrder: 9 },
  { slug: 'kirana', name: 'Kirana & Grocery Stores', sortOrder: 10 },
  { slug: 'appliance', name: 'Appliance Maintenance', sortOrder: 11 },
  { slug: 'insurance', name: 'Insurance & Renewals', sortOrder: 12 },
  { slug: 'government', name: 'Government & Passport Services', sortOrder: 13 },
];

async function main() {
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sortOrder: c.sortOrder },
      create: c,
    });
  }
  console.log(`Seeded ${categories.length} categories`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
