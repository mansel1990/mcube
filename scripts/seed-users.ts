/**
 * Seed initial users into MongoDB via Better Auth.
 *
 * Run from project root:
 *   npx tsx --env-file=.env.local scripts/seed-users.ts
 *
 * IMPORTANT: Change the passwords below before running in production.
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local BEFORE importing anything that reads env vars
config({ path: resolve(process.cwd(), ".env.local") });

const USERS = [
  {
    username: "admin",
    email: "admin@mcube.studio",
    password: "admin-change-me",
    name: "Admin",
    section: "admin",
  },
  {
    username: "stocks1",
    email: "stocks1@mcube.studio",
    password: "stocks1-change-me",
    name: "Stocks User 1",
    section: "stocks",
  },
  {
    username: "stocks2",
    email: "stocks2@mcube.studio",
    password: "stocks2-change-me",
    name: "Stocks User 2",
    section: "stocks",
  },
  {
    username: "mansel",
    email: "mansel1990@gmail.com",
    password: "mansel@123",
    name: "Admin",
    section: "admin",
  },
  {
    username: "mithila",
    email: "mithila.kannan@gmail.com",
    password: "mithila@123",
    name: "Admin",
    section: "admin",
  },
];

// Viewer accounts — each linked to a creditor by name in the DB
// Fill in the real email, password, and creditorName before running
const VIEWERS = [
  {
    username: "mangai",
    email: "selvanmangai@gmail.com",       // ← change to mom's real email
    password: "mangai@123",
    name: "Mangai",
    section: "viewer",
    creditorName: "Mom",
  },
];

async function seed() {
  // Dynamic import so env vars are loaded first
  const { auth } = await import("../lib/auth");
  const { connectToDatabase } = await import("../lib/mongodb");
  const { LoanCreditor } = await import("../lib/models/loan-creditor");

  await connectToDatabase();

  console.log("Seeding users...\n");

  for (const user of USERS) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await auth.api.signUpEmail({ body: { username: user.username, email: user.email, password: user.password, name: user.name, section: user.section } as any });
      console.log(`✓ Created: ${user.email} (section: ${user.section})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("already exists") || message.includes("duplicate")) {
        console.log(`- Skipped: ${user.email} (already exists)`);
      } else {
        console.error(`✗ Failed:  ${user.email} — ${message}`);
      }
    }
  }

  console.log("\nSeeding viewer accounts...\n");

  for (const viewer of VIEWERS) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await auth.api.signUpEmail({ body: { username: viewer.username, email: viewer.email, password: viewer.password, name: viewer.name, section: viewer.section } as any });
      const userId = (res as Record<string, Record<string, string>>).user?.id;
      console.log(`✓ Created viewer: ${viewer.email} (id: ${userId})`);

      if (userId && viewer.creditorName) {
        const updated = await LoanCreditor.findOneAndUpdate(
          { name: viewer.creditorName },
          { userId },
          { new: true }
        );
        if (updated) {
          console.log(`  ↳ Linked to creditor "${updated.name}" (${updated._id})`);
        } else {
          console.warn(`  ↳ Warning: creditor "${viewer.creditorName}" not found — link it manually`);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("already exists") || message.includes("duplicate")) {
        console.log(`- Skipped: ${viewer.email} (already exists)`);
      } else {
        console.error(`✗ Failed:  ${viewer.email} — ${message}`);
      }
    }
  }

  console.log("\nDone. Update passwords before going to production.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
