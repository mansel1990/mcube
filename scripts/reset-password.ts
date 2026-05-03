import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const EMAIL = "mansel1990@gmail.com";
const NEW_PASSWORD = "mansel@123";

async function reset() {
  const { auth } = await import("../lib/auth");
  const { MongoClient } = await import("mongodb");

  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db();

  // Find the user first
  const user = await db.collection("user").findOne({ email: EMAIL });
  if (!user) {
    console.log(`✗ User ${EMAIL} not found`);
    await client.close();
    process.exit(1);
  }

  console.log(`Found user: ${user.email} (id: ${user.id})`);

  // Delete their account records (where the hashed password lives)
  await db.collection("account").deleteMany({ userId: user.id });
  // Delete the user record itself
  await db.collection("user").deleteOne({ email: EMAIL });
  // Delete any active sessions
  await db.collection("session").deleteMany({ userId: user.id });

  console.log("Cleared existing records, recreating with new password...");

  await client.close();

  // Re-create with new password preserving the same details
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await auth.api.signUpEmail({ body: { username: "mansel", email: EMAIL, password: NEW_PASSWORD, name: "Admin", section: "admin" } as any });
  console.log(`✓ Password reset for ${EMAIL} → ${NEW_PASSWORD}`);

  process.exit(0);
}

reset().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
