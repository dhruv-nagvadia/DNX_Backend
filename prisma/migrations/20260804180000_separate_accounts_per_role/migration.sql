-- Accounts are now per-audience: unique on (email, role) instead of a global
-- unique email/phone. The same email can exist once as a USER (customer) and
-- once as a PROVIDER (business) — two independent accounts.

-- DropIndex (global uniques)
DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "User_phone_key";

-- CreateIndex (composite unique)
CREATE UNIQUE INDEX "User_email_role_key" ON "User"("email", "role");
