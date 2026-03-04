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
];

async function seed() {
  // Dynamic import so env vars are loaded first
  const { auth } = await import("../lib/auth");

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

  console.log("\nDone. Update passwords before going to production.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
