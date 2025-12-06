const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find all CLIENT_USER users (is_client_user = true)
  const clientUsers = await prisma.user.findMany({
    where: { is_client_user: true },
    select: {
      user_id: true,
      email: true,
      name: true,
      is_client_user: true,
      user_roles: {
        select: {
          store_id: true,
          company_id: true,
          role: {
            select: { code: true, scope: true }
          }
        }
      }
    }
  });

  console.log('CLIENT_USER users found:', clientUsers.length);
  clientUsers.forEach(u => {
    console.log(`\n  User: ${u.email} (name: ${u.name})`);
    console.log(`    user_id: ${u.user_id}`);
    u.user_roles.forEach(r => {
      console.log(`    Role: ${r.role.code} (scope: ${r.role.scope}), store_id: ${r.store_id || 'NULL'}, company_id: ${r.company_id || 'NULL'}`);
    });
  });

  // Now check stores without login but that might have a matching user
  console.log('\n\n--- Stores without store_login_user_id ---');
  const storesWithoutLogin = await prisma.store.findMany({
    where: { store_login_user_id: null },
    select: {
      store_id: true,
      name: true,
      company_id: true,
    }
  });

  for (const store of storesWithoutLogin) {
    console.log(`\n  Store: ${store.name} (id: ${store.store_id})`);

    // Check if any CLIENT_USER has a UserRole with this store_id
    const matchingUserRole = await prisma.userRole.findFirst({
      where: {
        store_id: store.store_id,
        role: { code: 'CLIENT_USER' }
      },
      include: {
        user: { select: { user_id: true, email: true, name: true } },
        role: { select: { code: true } }
      }
    });

    if (matchingUserRole) {
      console.log(`    FOUND matching user: ${matchingUserRole.user.email} (user_id: ${matchingUserRole.user.user_id})`);
    } else {
      console.log(`    No matching CLIENT_USER found for this store`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
