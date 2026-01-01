const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  // Find a store manager user from fixture
  const storeManagerUser = await prisma.user.findFirst({
    where: {
      email: { contains: 'store-manager' },
      status: 'ACTIVE'
    },
    include: {
      user_roles: {
        include: {
          role: true
        }
      }
    }
  });

  console.log('Store manager user:', storeManagerUser?.email);
  console.log('Roles:', storeManagerUser?.user_roles.map(ur => ur.role.code));

  // Create test user with password
  const testPassword = 'TestPassword123!';
  const passwordHash = await bcrypt.hash(testPassword, 10);
  const testEmail = `test-debug-${Date.now()}@test.nuvana.local`;

  await prisma.user.deleteMany({ where: { email: testEmail } });

  const testUser = await prisma.user.create({
    data: {
      email: testEmail,
      name: 'Test Debug User',
      public_id: `TEST-DEBUG-${Date.now()}`,
      password_hash: passwordHash,
      status: 'ACTIVE',
      is_client_user: true,
    },
  });

  console.log('\nCreated test user:', testUser.user_id);
  console.log('Email:', testEmail);
  console.log('Password hash exists:', !!testUser.password_hash);

  // Verify password works
  const passwordValid = await bcrypt.compare(testPassword, passwordHash);
  console.log('Password verification:', passwordValid);

  // Check roles
  const userRoles = await prisma.userRole.findMany({
    where: { user_id: testUser.user_id },
  });
  console.log('User roles count:', userRoles.length);

  // Clean up
  await prisma.user.deleteMany({ where: { email: testEmail } });

  await prisma.$disconnect();
}

test().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
