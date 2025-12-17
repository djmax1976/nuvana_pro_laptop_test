/**
 * Password Strength Verification Script
 *
 * This script tests if the passwords for specific users could be weak passwords
 * that bypass the validation requirements. Since bcrypt hashes are one-way,
 * we can only TEST passwords against hashes, not reverse them.
 *
 * Usage: npx tsx scripts/verify-password-strength.ts
 *
 * Requires DATABASE_URL environment variable or Railway connection.
 */

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// Use public URL for local execution
const databaseUrl =
  process.env.DATABASE_PUBLIC_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:JdyWeMkcHbmFHIormIWhuKEXfsqsFPRn@metro.proxy.rlwy.net:42384/railway";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

// Password requirements regex (matches our validation)
const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecial: /[!@#$%^&*(),.?":{}|<>]/,
};

/**
 * Test if a password meets all requirements
 */
function meetsRequirements(password: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    issues.push(
      `Too short (${password.length} < ${PASSWORD_REQUIREMENTS.minLength})`,
    );
  }
  if (!PASSWORD_REQUIREMENTS.hasUppercase.test(password)) {
    issues.push("Missing uppercase letter");
  }
  if (!PASSWORD_REQUIREMENTS.hasLowercase.test(password)) {
    issues.push("Missing lowercase letter");
  }
  if (!PASSWORD_REQUIREMENTS.hasNumber.test(password)) {
    issues.push("Missing number");
  }
  if (!PASSWORD_REQUIREMENTS.hasSpecial.test(password)) {
    issues.push("Missing special character");
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Common weak passwords to test (none of these should work if validation is correct)
 */
const WEAK_PASSWORDS = [
  // No uppercase
  "password1!",
  "password123!",
  "abcdefgh1!",
  "test1234!",
  "qwerty12!",
  "letmein1!",
  "welcome1!",
  // No lowercase
  "PASSWORD1!",
  "ABCDEFGH1!",
  "TEST1234!",
  // No number
  "Password!",
  "Abcdefgh!",
  "TestTest!",
  // No special char
  "Password1",
  "Abcdefgh1",
  "TestTest1",
  // Too short
  "Pass1!",
  "Ab1!xyz",
  // Completely weak
  "password",
  "12345678",
  "abcdefgh",
  "ABCDEFGH",
];

/**
 * Strong passwords to test (these SHOULD work)
 */
const STRONG_PASSWORDS = [
  "Password1!",
  "Password123!",
  "Test1234!",
  "Abcdefg1!",
  "MyP@ssw0rd",
  "SecureP@ss1",
  "Strong1234!",
  "Valid@Pass1",
];

/**
 * Test passwords specifically for the users in question
 */
const USER_SPECIFIC_PASSWORDS = [
  // Variations on "Ja ja" user
  "Jaja1234!",
  "JaJa1234!",
  "Jaja1234@",
  "Jaja123!",
  "jaja1234!", // weak - no uppercase
  "JAJA1234!", // weak - no lowercase
  // Variations on "Acne" user
  "Acne1234!",
  "ACNE1234!",
  "acne1234!", // weak - no uppercase
  "Acne123!",
  "Acne1234@",
  // Common simple patterns people might use
  "Qwerty12!",
  "Asdf1234!",
  "Zxcv1234!",
];

async function main() {
  console.log("=".repeat(70));
  console.log("PASSWORD STRENGTH VERIFICATION SCRIPT");
  console.log("=".repeat(70));
  console.log();

  // Fetch the users in question
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: "ja", mode: "insensitive" } },
        { name: { contains: "acne", mode: "insensitive" } },
        { email: { contains: "ja", mode: "insensitive" } },
        { email: { contains: "acne", mode: "insensitive" } },
      ],
    },
    select: {
      user_id: true,
      email: true,
      name: true,
      password_hash: true,
      created_at: true,
      user_roles: {
        select: {
          role: {
            select: {
              code: true,
            },
          },
        },
      },
    },
  });

  if (users.length === 0) {
    console.log("No users found matching 'ja' or 'acne'");
    return;
  }

  console.log(`Found ${users.length} user(s) to test:\n`);

  for (const user of users) {
    console.log("-".repeat(70));
    console.log(`User: ${user.name}`);
    console.log(`Email: ${user.email}`);
    console.log(
      `Role(s): ${user.user_roles.map((r) => r.role.code).join(", ")}`,
    );
    console.log(`Created: ${user.created_at}`);
    console.log(`Hash: ${user.password_hash?.substring(0, 20)}...`);
    console.log();

    if (!user.password_hash) {
      console.log("⚠️  No password hash found for this user");
      continue;
    }

    // Test weak passwords
    console.log(
      "Testing WEAK passwords (should NOT match if validation worked):",
    );
    let weakMatches = 0;
    for (const pwd of WEAK_PASSWORDS) {
      const match = await bcrypt.compare(pwd, user.password_hash);
      if (match) {
        const requirements = meetsRequirements(pwd);
        console.log(`  🔴 MATCH FOUND: "${pwd}"`);
        console.log(`     Meets requirements: ${requirements.valid}`);
        if (!requirements.valid) {
          console.log(`     Issues: ${requirements.issues.join(", ")}`);
        }
        weakMatches++;
      }
    }
    if (weakMatches === 0) {
      console.log("  ✅ No weak passwords matched");
    }

    // Test strong passwords
    console.log("\nTesting STRONG passwords:");
    let strongMatches = 0;
    for (const pwd of STRONG_PASSWORDS) {
      const match = await bcrypt.compare(pwd, user.password_hash);
      if (match) {
        const requirements = meetsRequirements(pwd);
        console.log(`  ✅ MATCH FOUND: "${pwd}"`);
        console.log(`     Meets requirements: ${requirements.valid}`);
        strongMatches++;
      }
    }
    if (strongMatches === 0) {
      console.log("  (No standard strong passwords matched)");
    }

    // Test user-specific passwords
    console.log("\nTesting USER-SPECIFIC passwords:");
    let userSpecificMatches = 0;
    for (const pwd of USER_SPECIFIC_PASSWORDS) {
      const match = await bcrypt.compare(pwd, user.password_hash);
      if (match) {
        const requirements = meetsRequirements(pwd);
        const status = requirements.valid ? "✅" : "🔴";
        console.log(`  ${status} MATCH FOUND: "${pwd}"`);
        console.log(`     Meets requirements: ${requirements.valid}`);
        if (!requirements.valid) {
          console.log(`     Issues: ${requirements.issues.join(", ")}`);
        }
        userSpecificMatches++;
      }
    }
    if (userSpecificMatches === 0) {
      console.log("  (No user-specific passwords matched)");
    }

    console.log();
  }

  console.log("=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(`
If no weak passwords matched, the passwords stored for these users
meet the strength requirements (uppercase, lowercase, number, special char).

Since bcrypt hashes are one-way, we cannot determine the actual password.
We can only verify that common weak passwords do NOT match.

If a weak password DID match, it indicates either:
1. A validation bypass occurred when the user was created
2. The password was set via a code path without proper validation
`);
}

main()
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
