import { prisma } from '@/lib/prisma';
import { geoService } from '@/modules/geo/geo.service';

/**
 * One-off: gives every business that has no map pin approximate coordinates
 * (the centre of its PIN code, else its city/state) so it shows up in the
 * "near me" distance-ring search. Businesses with no address at all are
 * listed and skipped. Safe to re-run — only touches rows still missing coords.
 *
 *   npm run backfill:coords
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const missing = await prisma.provider.findMany({
    where: { OR: [{ latitude: null }, { longitude: null }] },
    select: { id: true, businessName: true, postalCode: true, city: true, state: true },
  });
  console.log(`${missing.length} businesses without coordinates`);

  for (const p of missing) {
    if (!p.postalCode && !p.city && !p.state) {
      console.log(`  –  ${p.businessName}: no address, skipped`);
      continue;
    }
    // Nominatim allows ~1 request per second.
    // eslint-disable-next-line no-await-in-loop
    let point = p.postalCode ? await geoService.forwardGeocode({ postalCode: p.postalCode }) : null;
    if (!point && (p.city || p.state)) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(1100);
      // eslint-disable-next-line no-await-in-loop
      point = await geoService.forwardGeocode({
        city: p.city ?? undefined,
        state: p.state ?? undefined,
      });
    }
    if (point) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.provider.update({ where: { id: p.id }, data: point });
      console.log(
        `  ✓  ${p.businessName} (${p.postalCode ?? p.city}): ${point.latitude}, ${point.longitude}`,
      );
    } else {
      console.log(`  ✗  ${p.businessName} (${p.postalCode ?? p.city}): could not be located`);
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(1100);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
