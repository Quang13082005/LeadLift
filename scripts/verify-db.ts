import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@neondatabase/serverless';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

async function verifyDatabase() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error('❌ DATABASE_URL_UNPOOLED is missing in .env');
    process.exit(1);
  }

  // Parse connection info safely without logging password
  const parsed = new URL(url);
  console.log('🔍 Database Target Verification:');
  console.log(`  - Host: ${parsed.hostname}`);
  console.log(`  - Database: ${parsed.pathname.replace('/', '')}`);
  console.log(`  - User: ${parsed.username}`);
  console.log(`  - SSL Mode: ${parsed.searchParams.get('sslmode') || 'default'}`);

  const client = new Client({ connectionString: url });

  try {
    await client.connect();
    console.log('✅ Successfully established direct connection to PostgreSQL.');

    const infoRes = await client.query('SELECT current_database(), current_user, version();');
    console.log('📊 Active Session Details:');
    console.log(`  - Current Database: ${infoRes.rows[0].current_database}`);
    console.log(`  - Current User: ${infoRes.rows[0].current_user}`);
    console.log(`  - PostgreSQL Version: ${infoRes.rows[0].version.split(' ')[0]} ${infoRes.rows[0].version.split(' ')[1]}`);

    // Check existing tables in public schema
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log(`\n📋 Existing Tables in public schema (${tablesRes.rows.length}):`);
    if (tablesRes.rows.length === 0) {
      console.log('  ✨ Verified: Database is completely FRESH & EMPTY (0 tables). Ready for initial migration.');
    } else {
      tablesRes.rows.forEach((row: { table_name: string }) => {
        console.log(`  - ${row.table_name}`);
      });
    }

    await client.end();
  } catch (err: unknown) {
    console.error('❌ Connection verification failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

verifyDatabase();
