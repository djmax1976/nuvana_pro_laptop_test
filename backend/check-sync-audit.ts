import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Check recent sync audit logs
  const recentAuditLogs = await prisma.apiKeyAuditEvent.findMany({
    where: {
      event_type: 'SYNC_STARTED'
    },
    orderBy: { created_at: 'desc' },
    take: 10,
    select: {
      audit_event_id: true,
      event_type: true,
      event_details: true,
      created_at: true
    }
  });

  console.log('Recent SYNC audit logs:');
  for (const log of recentAuditLogs) {
    console.log('\n[' + log.created_at.toISOString() + '] ' + log.event_type);
    console.log('Details:', JSON.stringify(log.event_details, null, 2));
  }

  // Check sync sessions
  const recentSessions = await prisma.apiKeySyncSession.findMany({
    orderBy: { session_started_at: 'desc' },
    take: 5,
    select: {
      sync_session_id: true,
      sync_type: true,
      sync_status: true,
      session_started_at: true,
      total_records_synced: true,
      sync_summary: true
    }
  });

  console.log('\n\n=== Recent Sync Sessions ===');
  for (const session of recentSessions) {
    console.log('\nSession: ' + session.sync_session_id);
    console.log('Type: ' + session.sync_type + ', Status: ' + session.sync_status);
    console.log('Started: ' + session.session_started_at.toISOString());
    console.log('Records synced: ' + session.total_records_synced);
    console.log('Summary:', JSON.stringify(session.sync_summary, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
