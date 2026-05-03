import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

async function link() {
  const { connectToDatabase } = await import("../lib/mongodb");
  const { LoanCreditor } = await import("../lib/models/loan-creditor");

  await connectToDatabase();

  const updated = await LoanCreditor.findByIdAndUpdate(
    "69d9fdb6a348c9ad275b1c2b",
    { userId: "69f729625d0f29f403084c80" },
    { new: true }
  );

  if (updated) {
    console.log(`✓ Linked creditor "${updated.name}" to mom's account`);
  } else {
    console.log("✗ Creditor not found");
  }

  process.exit(0);
}

link().catch((err) => {
  console.error(err);
  process.exit(1);
});
