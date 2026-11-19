import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Demo SERVICE businesses for testing location features (postal code → city →
 * state fallback, "Open now near you", nearest sort, Popular services, etc.).
 *
 * - 5 areas × 4 businesses, each with real-ish coordinates, opening hours and
 *   4–6 services that fit its sub-category.
 * - All owned by one demo provider account, so they're easy to find and remove.
 * - A few reviews per business from demo reviewer accounts; ratingAvg /
 *   ratingCount are computed from those reviews so the numbers match.
 * - No photos: the app falls back to the sub-category photo from the API.
 *
 * Re-running replaces the demo data (it never touches anything else).
 *
 *   npm run seed:demo           # create / refresh
 *   DEMO_REMOVE=1 npm run seed:demo   # remove all demo data
 *
 * Demo provider login: demo.provider@dnx.test / Demo@1234
 */

const OWNER_EMAIL = 'demo.provider@dnx.test';
const PASSWORD = 'Demo@1234';
const REVIEWERS = [
  { email: 'demo.reviewer1@dnx.test', fullName: 'Priya Shah' },
  { email: 'demo.reviewer2@dnx.test', fullName: 'Rahul Patel' },
  { email: 'demo.reviewer3@dnx.test', fullName: 'Neha Mehta' },
  { email: 'demo.reviewer4@dnx.test', fullName: 'Arjun Desai' },
  { email: 'demo.reviewer5@dnx.test', fullName: 'Kavya Joshi' },
];

type Hours = 'standard' | 'long' | 'late' | 'clinic' | 'weekdays';

/** [name, price ₹, duration min, travelRequired?] */
type Svc = [string, number, number, boolean?];

interface Biz {
  name: string;
  sub: string; // sub-category slug (category comes from it)
  address: string;
  lat: number;
  lng: number;
  hours: Hours;
  verified?: boolean;
  about: string;
  services: Svc[];
  reviews: [number, string][];
}

interface Area {
  city: string;
  state: string;
  postalCode: string;
  businesses: Biz[];
}

const AREAS: Area[] = [
  {
    city: 'Morbi',
    state: 'Gujarat',
    postalCode: '363641',
    businesses: [
      {
        name: 'Glow Up Unisex Salon',
        sub: 'beauty-unisex-salon',
        address: 'Shop 4, Ravapar Road',
        lat: 22.8173,
        lng: 70.8377,
        hours: 'late',
        verified: true,
        about: 'Haircuts, colour and skin care for men and women.',
        services: [
          ['Haircut', 250, 30],
          ['Hair Spa', 799, 60],
          ['Global Hair Colour', 1499, 90],
          ['Beard Trim & Styling', 150, 20],
          ['Cleanup Facial', 599, 45],
        ],
        reviews: [
          [5, 'Great haircut, very neat and quick.'],
          [4, 'Good hair spa, a little crowded on Sunday.'],
          [5, 'Friendly staff and clean salon.'],
        ],
      },
      {
        name: 'Smile Care Dental Clinic',
        sub: 'healthcare-dentist',
        address: '1st Floor, Shanala Road',
        lat: 22.8126,
        lng: 70.8302,
        hours: 'clinic',
        verified: true,
        about: 'General and cosmetic dentistry with digital X-ray.',
        services: [
          ['Dental Check-up', 300, 20],
          ['Teeth Cleaning & Polishing', 900, 40],
          ['Tooth Filling', 1200, 45],
          ['Root Canal Treatment', 4500, 90],
        ],
        reviews: [
          [5, 'Painless root canal, doctor explained everything.'],
          [4, 'Good clinic, had to wait 15 minutes.'],
        ],
      },
      {
        name: 'FitZone Gym',
        sub: 'fitness-gym',
        address: 'Near Nehru Gate, Station Road',
        lat: 22.8205,
        lng: 70.8421,
        hours: 'long',
        about: 'Strength and cardio floor with certified trainers.',
        services: [
          ['Day Pass', 150, 60],
          ['Personal Training Session', 500, 60],
          ['Body Composition Check', 200, 20],
          ['Diet Consultation', 400, 30],
        ],
        reviews: [
          [4, 'Good equipment, gets busy in the evening.'],
          [5, 'Trainer is very helpful.'],
          [4, 'Clean and well maintained.'],
        ],
      },
      {
        name: 'QuickFix Plumbing & Electricals',
        sub: 'home-plumber',
        address: 'Lilapar Road',
        lat: 22.8089,
        lng: 70.8455,
        hours: 'standard',
        about: 'Plumbing and electrical repairs at your home.',
        services: [
          ['Tap & Mixer Repair', 199, 30, true],
          ['Leakage Fixing', 349, 45, true],
          ['Bathroom Fitting Installation', 799, 90, true],
          ['Water Tank Cleaning', 999, 120, true],
        ],
        reviews: [[4, 'Came on time and fixed the leak properly.']],
      },
    ],
  },
  {
    city: 'Rajkot',
    state: 'Gujarat',
    postalCode: '360005',
    businesses: [
      {
        name: 'The Royal Barber',
        sub: 'beauty-men-s-salon-barber',
        address: '150 Feet Ring Road',
        lat: 22.2916,
        lng: 70.7743,
        hours: 'late',
        verified: true,
        about: 'Classic cuts, hot towel shaves and beard grooming.',
        services: [
          ['Haircut', 200, 30],
          ['Hot Towel Shave', 180, 25],
          ['Haircut + Beard Combo', 350, 45],
          ['Hair Colour (Men)', 600, 45],
          ['Head Massage', 250, 20],
        ],
        reviews: [
          [5, 'Best shave in Rajkot.'],
          [5, 'Very professional barbers.'],
          [4, 'Good service, slightly pricey.'],
          [5, 'Always my go-to place.'],
        ],
      },
      {
        name: 'Serenity Spa & Wellness',
        sub: 'beauty-spa-massage',
        address: 'Kalawad Road, Near Crystal Mall',
        lat: 22.2863,
        lng: 70.7712,
        hours: 'standard',
        about: 'Relaxing massages and body therapies.',
        services: [
          ['Swedish Massage (60 min)', 1999, 60],
          ['Deep Tissue Massage', 2499, 75],
          ['Foot Reflexology', 899, 30],
          ['Aroma Therapy', 2199, 60],
          ['Body Scrub', 1499, 45],
        ],
        reviews: [
          [5, 'Very relaxing, will come again.'],
          [4, 'Nice ambience and good therapist.'],
        ],
      },
      {
        name: 'Rajkot Physio Care',
        sub: 'healthcare-physiotherapist',
        address: 'Yagnik Road',
        lat: 22.2971,
        lng: 70.7951,
        hours: 'clinic',
        about: 'Physiotherapy for back pain, sports injuries and post-surgery rehab.',
        services: [
          ['Physiotherapy Assessment', 400, 30],
          ['Back Pain Therapy Session', 600, 45],
          ['Sports Injury Rehab', 800, 60],
          ['Home Visit Physiotherapy', 900, 45, true],
        ],
        reviews: [
          [5, 'My knee pain is much better after 5 sessions.'],
          [4, 'Good exercises and guidance.'],
        ],
      },
      {
        name: 'Shine Car Wash & Detailing',
        sub: 'automotive-car-wash-detailing',
        address: 'Mavdi Main Road',
        lat: 22.2701,
        lng: 70.7826,
        hours: 'long',
        about: 'Foam wash, interior cleaning and ceramic coating.',
        services: [
          ['Foam Car Wash', 399, 30],
          ['Interior Deep Cleaning', 1199, 90],
          ['Car Polishing', 1499, 120],
          ['Bike Wash', 149, 20],
        ],
        reviews: [
          [4, 'Car looks new after polishing.'],
          [3, 'Good wash but took longer than said.'],
        ],
      },
    ],
  },
  {
    city: 'Ahmedabad',
    state: 'Gujarat',
    postalCode: '380059',
    businesses: [
      {
        name: 'Blush Beauty Parlour',
        sub: 'beauty-women-s-beauty-parlour',
        address: 'Thaltej Cross Road',
        lat: 23.0503,
        lng: 72.5081,
        hours: 'standard',
        verified: true,
        about: 'Threading, waxing, facials and bridal makeup.',
        services: [
          ['Eyebrow Threading', 60, 10],
          ['Full Arms Waxing', 349, 30],
          ['Gold Facial', 1199, 60],
          ['Pedicure', 599, 45],
          ['Party Makeup', 2499, 90],
        ],
        reviews: [
          [5, 'Lovely facial, skin feels fresh.'],
          [4, 'Neat threading, good staff.'],
          [5, 'Did my party makeup perfectly.'],
        ],
      },
      {
        name: 'Nail Art Studio by Riya',
        sub: 'beauty-nail-studio',
        address: 'Sindhu Bhavan Road',
        lat: 23.0446,
        lng: 72.4986,
        hours: 'late',
        about: 'Gel polish, extensions and custom nail art.',
        services: [
          ['Gel Polish', 699, 45],
          ['Nail Extensions', 1499, 90],
          ['Custom Nail Art (per hand)', 499, 40],
          ['Manicure', 499, 40],
        ],
        reviews: [
          [5, 'Beautiful nail art, very patient.'],
          [5, 'Extensions lasted 4 weeks.'],
        ],
      },
      {
        name: 'Sunrise Yoga Studio',
        sub: 'fitness-yoga-studio',
        address: 'Bodakdev, Judges Bungalow Road',
        lat: 23.0397,
        lng: 72.5132,
        hours: 'long',
        about: 'Hatha, power and prenatal yoga classes.',
        services: [
          ['Drop-in Yoga Class', 300, 60],
          ['Private Yoga Session', 900, 60],
          ['Prenatal Yoga Class', 400, 60],
          ['Meditation Session', 250, 45],
        ],
        reviews: [
          [5, 'Calm studio and great teacher.'],
          [4, 'Morning batch is a little full.'],
        ],
      },
      {
        name: 'CoolAir AC Service',
        sub: 'home-ac-appliance-repair',
        address: 'Drive-In Road',
        lat: 23.0478,
        lng: 72.5296,
        hours: 'standard',
        about: 'AC servicing, gas refill and appliance repair at home.',
        services: [
          ['AC Service (Split)', 499, 45, true],
          ['AC Gas Refill', 2499, 60, true],
          ['Washing Machine Repair', 399, 45, true],
          ['Refrigerator Repair', 449, 45, true],
        ],
        reviews: [
          [4, 'AC cooling much better now.'],
          [4, 'Technician was polite and on time.'],
        ],
      },
    ],
  },
  {
    city: 'Ahmedabad',
    state: 'Gujarat',
    postalCode: '380015',
    businesses: [
      {
        name: 'Satellite Skin & Hair Clinic',
        sub: 'healthcare-dermatologist',
        address: 'Satellite Road, Near Shyamal Cross Road',
        lat: 23.0225,
        lng: 72.5269,
        hours: 'clinic',
        verified: true,
        about: 'Skin, hair and laser treatments by certified dermatologists.',
        services: [
          ['Dermatologist Consultation', 600, 20],
          ['Acne Treatment Session', 1500, 40],
          ['Chemical Peel', 2500, 45],
          ['Hair Fall Treatment (PRP)', 4000, 60],
        ],
        reviews: [
          [5, 'Acne cleared up in a month.'],
          [4, 'Doctor is very knowledgeable.'],
          [5, 'Clean clinic, good follow-up.'],
        ],
      },
      {
        name: 'Paws & Claws Pet Grooming',
        sub: 'other-pet-grooming',
        address: 'Jodhpur Gam Road',
        lat: 23.0189,
        lng: 72.5205,
        hours: 'weekdays',
        about: 'Bathing, haircuts and nail trimming for dogs and cats.',
        services: [
          ['Dog Bath & Blow Dry', 699, 60],
          ['Full Grooming (Dog)', 1299, 90],
          ['Cat Grooming', 999, 60],
          ['Nail Trimming', 199, 15],
        ],
        reviews: [
          [5, 'My dog looks so cute after grooming!'],
          [4, 'Gentle with pets.'],
        ],
      },
      {
        name: 'Click Studio Photography',
        sub: 'events-photographer',
        address: 'Prahlad Nagar',
        lat: 23.0124,
        lng: 72.5075,
        hours: 'standard',
        about: 'Portraits, product shoots and event photography.',
        services: [
          ['Passport Size Photos', 150, 15],
          ['Portrait Photoshoot', 2499, 60],
          ['Maternity Shoot', 4999, 120],
          ['Birthday Event Coverage (3 hr)', 7999, 180],
        ],
        reviews: [[5, 'Amazing portraits, quick delivery.']],
      },
      {
        name: 'Sparkle Home Cleaning',
        sub: 'home-home-cleaning',
        address: 'Vejalpur',
        lat: 23.0052,
        lng: 72.5214,
        hours: 'long',
        about: 'Deep cleaning for homes, kitchens and bathrooms.',
        services: [
          ['Bathroom Deep Cleaning', 599, 60, true],
          ['Kitchen Deep Cleaning', 1299, 120, true],
          ['Full Home Deep Cleaning (2BHK)', 3499, 300, true],
          ['Sofa Cleaning (5 seater)', 899, 60, true],
        ],
        reviews: [
          [4, 'Kitchen looks spotless.'],
          [5, 'Team was thorough and polite.'],
        ],
      },
    ],
  },
  {
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400050',
    businesses: [
      {
        name: 'Bandra Hair Lounge',
        sub: 'beauty-unisex-salon',
        address: 'Hill Road, Bandra West',
        lat: 19.0544,
        lng: 72.8295,
        hours: 'late',
        verified: true,
        about: 'Trendy cuts, keratin and colour by senior stylists.',
        services: [
          ['Haircut (Senior Stylist)', 800, 45],
          ['Keratin Treatment', 4999, 150],
          ['Balayage', 5999, 180],
          ['Blow Dry', 600, 30],
          ['Hair Spa', 1499, 60],
        ],
        reviews: [
          [5, 'Best balayage I have had.'],
          [4, 'Great stylists, book in advance.'],
          [5, 'Loved my keratin results.'],
        ],
      },
      {
        name: 'Zen Body Spa',
        sub: 'beauty-spa-massage',
        address: 'Linking Road, Bandra West',
        lat: 19.0606,
        lng: 72.8347,
        hours: 'long',
        about: 'Thai, Balinese and deep tissue massages.',
        services: [
          ['Thai Massage', 2999, 60],
          ['Balinese Massage', 3299, 75],
          ['Head, Neck & Shoulder', 1299, 30],
          ['Couple Massage', 5999, 60],
        ],
        reviews: [
          [5, 'Very relaxing Thai massage.'],
          [4, 'Clean and calm place.'],
        ],
      },
      {
        name: 'Dr. Mehta ENT Clinic',
        sub: 'healthcare-ent-specialist',
        address: 'Turner Road, Bandra West',
        lat: 19.0583,
        lng: 72.8362,
        hours: 'clinic',
        about: 'Ear, nose and throat care, hearing tests and allergy treatment.',
        services: [
          ['ENT Consultation', 900, 20],
          ['Ear Wax Removal', 700, 20],
          ['Hearing Test (Audiometry)', 1200, 30],
          ['Sinus Allergy Treatment', 1500, 30],
        ],
        reviews: [[4, 'Doctor listened carefully, good advice.']],
      },
      {
        name: 'Beat Street Dance Studio',
        sub: 'fitness-dance-studio',
        address: 'Pali Hill, Bandra West',
        lat: 19.0681,
        lng: 72.8263,
        hours: 'weekdays',
        about: 'Hip hop, Bollywood and contemporary dance classes.',
        services: [
          ['Bollywood Dance Class', 500, 60],
          ['Hip Hop Class', 600, 60],
          ['Wedding Choreography Session', 2500, 90],
          ['Kids Dance Class', 400, 45],
        ],
        reviews: [
          [5, 'Super fun classes!'],
          [5, 'Great choreography for our sangeet.'],
        ],
      },
    ],
  },
];

/** dayOfWeek 0 = Sunday … 6 = Saturday */
function hoursFor(kind: Hours) {
  return Array.from({ length: 7 }, (_, day) => {
    switch (kind) {
      case 'long': // every day, early to late
        return { dayOfWeek: day, isOpen: true, openTime: '06:00', closeTime: '22:00' };
      case 'late': // every day, till late night
        return { dayOfWeek: day, isOpen: true, openTime: '09:00', closeTime: '23:30' };
      case 'clinic': // Mon–Sat with a lunch break, Sunday closed
        return {
          dayOfWeek: day,
          isOpen: day !== 0,
          openTime: '09:00',
          closeTime: '20:00',
          breakStart: '13:00',
          breakEnd: '16:00',
        };
      case 'weekdays': // Mon–Fri only
        return {
          dayOfWeek: day,
          isOpen: day >= 1 && day <= 5,
          openTime: '10:00',
          closeTime: '19:00',
        };
      default: // standard: Mon–Sat, Sunday closed
        return { dayOfWeek: day, isOpen: day !== 0, openTime: '10:00', closeTime: '20:00' };
    }
  });
}

/** Deletes the demo businesses (services, hours, reviews cascade). Accounts are kept for reuse. */
async function removeDemo(): Promise<number> {
  const owner = await prisma.user.findUnique({
    where: { email_role: { email: OWNER_EMAIL, role: Role.PROVIDER } },
  });
  if (!owner) {
    return 0;
  }
  const { count } = await prisma.provider.deleteMany({ where: { userId: owner.id } });
  return count;
}

async function main() {
  // Test data only — never on the real production database.
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '✋ seed:demo is for development/staging only. Refusing to run with NODE_ENV=production.',
    );
    process.exit(1);
  }
  const removed = await removeDemo();
  if (process.env.DEMO_REMOVE) {
    console.log(`🗑  Removed ${removed} demo businesses.`);
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const owner = await prisma.user.upsert({
    where: { email_role: { email: OWNER_EMAIL, role: Role.PROVIDER } },
    update: {},
    create: {
      email: OWNER_EMAIL,
      passwordHash,
      fullName: 'Demo Provider',
      phone: '9000000001',
      role: Role.PROVIDER,
    },
  });
  const reviewers = await Promise.all(
    REVIEWERS.map((r) =>
      prisma.user.upsert({
        where: { email_role: { email: r.email, role: Role.USER } },
        update: {},
        create: { email: r.email, passwordHash, fullName: r.fullName, role: Role.USER },
      }),
    ),
  );

  const subs = await prisma.subcategory.findMany({
    select: { id: true, slug: true, categoryId: true },
  });
  const subBySlug = new Map(subs.map((s) => [s.slug, s]));

  let bizCount = 0;
  let svcCount = 0;
  for (const area of AREAS) {
    for (const [i, b] of area.businesses.entries()) {
      const sub = subBySlug.get(b.sub);
      if (!sub) {
        console.warn(`⚠️  Sub-category "${b.sub}" not found — skipped ${b.name}`);
        continue;
      }
      const ratingCount = b.reviews.length;
      const ratingAvg =
        Math.round((b.reviews.reduce((s, [r]) => s + r, 0) / Math.max(1, ratingCount)) * 10) / 10;

      // eslint-disable-next-line no-await-in-loop
      await prisma.provider.create({
        data: {
          userId: owner.id,
          type: 'SERVICE',
          categoryId: sub.categoryId,
          subcategoryId: sub.id,
          businessName: b.name,
          description: b.about,
          phone: `90000${area.postalCode.slice(-3)}${String(i + 1).padStart(2, '0')}`,
          addressLine: b.address,
          city: area.city,
          state: area.state,
          postalCode: area.postalCode,
          latitude: b.lat,
          longitude: b.lng,
          isVerified: !!b.verified,
          ratingAvg,
          ratingCount,
          businessHours: { create: hoursFor(b.hours) },
          services: {
            create: b.services.map(([name, rupees, durationMin, travel]) => ({
              categoryId: sub.categoryId,
              name,
              priceMinor: rupees * 100,
              durationMin,
              ...(travel
                ? { travelRequired: true, travelBaseFeeMinor: 5000, travelPerKmMinor: 1000 }
                : {}),
            })),
          },
          reviews: {
            create: b.reviews.map(([rating, comment], r) => ({
              userId: reviewers[r % reviewers.length].id,
              rating,
              comment,
              // Spread over the last few weeks so they don't all look the same day.
              createdAt: new Date(Date.now() - (r + 1) * 4 * 24 * 60 * 60 * 1000),
            })),
          },
        },
      });
      bizCount += 1;
      svcCount += b.services.length;
    }
  }

  console.log(
    `✅ Demo data ready: ${bizCount} businesses, ${svcCount} services across ${AREAS.length} postal codes` +
      (removed ? ` (replaced ${removed} old demo businesses)` : ''),
  );
  for (const a of AREAS) {
    console.log(
      `   ${a.postalCode}  ${a.city}, ${a.state}  — ${a.businesses.map((b) => b.name).join(', ')}`,
    );
  }
  console.log(`   Demo provider login: ${OWNER_EMAIL} / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
