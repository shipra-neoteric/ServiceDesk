import 'dotenv/config';
import { prisma } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';
import { seedRolesAndPermissions } from './rolesAndPermissions.js';
import { seedJobTypesAndPriorities, seedWorkflowTemplates, seedReasonCodes } from './systemDefaults.js';

/**
 * Production-safe bootstrap: seeds only structural configuration the app cannot function
 * without (Roles/Permissions, Job Types, Priorities + SLA defaults, Workflow Templates, and
 * Hold/Closure reason codes — none of which have a "create from scratch" UI, see
 * systemDefaults.ts's doc comment) and, optionally, one real Master Admin account from
 * environment variables. Deliberately does NOT create any Projects, Work Categories, demo
 * users, or demo Job Cards — those are real business data a Master Admin sets up for their own
 * properties via Masters UI after logging in (see seed.ts for the local dev/demo version that
 * *does* fabricate all of that). Safe to run on every deploy: every write here is an
 * idempotent upsert.
 *
 * The admin account step is required to log in for the first time on a fresh deployment, since
 * there is no self-service signup — Master Admin is the only role that can create further
 * users, so one has to exist before anyone can use the app at all.
 */
async function main() {
  console.log('Bootstrapping roles & permissions...');
  await seedRolesAndPermissions();
  console.log('Bootstrapping job types, priorities & SLA defaults...');
  await seedJobTypesAndPriorities();
  console.log('Bootstrapping workflow templates...');
  await seedWorkflowTemplates();
  console.log('Bootstrapping hold/closure reason codes...');
  await seedReasonCodes();

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME ?? 'Master Admin';

  if (!email || !password) {
    console.log('BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD not set — skipping admin user creation.');
    console.log('Bootstrap complete (roles & permissions only).');
    return;
  }
  if (password.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters for a production account.');
  }

  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'MASTER_ADMIN' } });
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.log(`Admin account ${email} already exists — leaving it as-is (bootstrap never overwrites an existing password).`);
    return;
  }

  await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name,
      passwordHash: await hashPassword(password),
      active: true,
      roles: { create: [{ roleId: role.id }] },
    },
  });
  console.log(`Created Master Admin account: ${email}`);
  console.log('Log in, then use Masters > Users to create real projects, categories and additional users.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
