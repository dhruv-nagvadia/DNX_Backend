import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const SALT_ROUNDS = 10;

/**
 * One-off bootstrap for the first ADMIN account — there's no self-registration
 * for admins by design (see admin.routes.ts). Re-running with the same email
 * just resets that admin's password, so it's also how you'd recover access.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=aStrongPassword123 ADMIN_NAME="Your Name" npm run create-admin
 */
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME?.trim() || 'Admin';

  if (!email || !password) {
    console.error(
      'Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=aStrongPassword123 ADMIN_NAME="Your Name" npm run create-admin',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email_role: { email, role: Role.ADMIN } },
    update: { passwordHash, fullName, isActive: true },
    create: { email, passwordHash, fullName, role: Role.ADMIN },
  });

  console.log(`✅ Admin ready: ${admin.email} (id: ${admin.id})`);
}

main()
  .catch((err) => {
    console.error('Failed to create admin:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
