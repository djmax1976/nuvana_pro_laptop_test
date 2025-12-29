import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  generatePublicId,
  PUBLIC_ID_PREFIXES,
} from "../backend/src/utils/public-id";

console.log("DATABASE_URL:", process.env.DATABASE_URL || "not set");

const prisma = new PrismaClient({
  log: ["query", "info", "warn", "error"],
});

async function main() {
  console.log("Starting...");

  // Delete existing
  const deleted = await prisma.user.deleteMany({
    where: { email: "store-e2e@test.com" },
  });
  console.log("Deleted existing users:", deleted.count);

  // Create new
  const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
  const user = await prisma.user.create({
    data: {
      public_id: generatePublicId(PUBLIC_ID_PREFIXES.USER),
      email: "store-e2e@test.com",
      name: "Store E2E Tester",
      password_hash: hashedPassword,
      status: "ACTIVE",
    },
  });
  console.log("Created user:", user.user_id);

  // Verify
  const found = await prisma.user.findFirst({
    where: { email: "store-e2e@test.com" },
  });
  console.log("Found user:", found ? found.user_id : "NOT FOUND");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  prisma.$disconnect();
  process.exit(1);
});
