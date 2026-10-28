import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@neondatabase/serverless';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

async function inspectSchema() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL_UNPOOLED missing');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  console.log('🔍 Detailed Schema Verification on Neon PostgreSQL:\n');

  // 1. Tables
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log(`📋 1. Tables created in public schema (${tablesRes.rows.length}):`);
  tablesRes.rows.forEach((r: { table_name: string }) => console.log(`   - ${r.table_name}`));

  // 2. Foreign Keys
  const fkRes = await client.query(`
    SELECT
      tc.table_name, 
      kcu.column_name, 
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.column_name;
  `);

  console.log(`\n🔗 2. Foreign Key Relationships (${fkRes.rows.length}):`);
  fkRes.rows.forEach((r: { table_name: string; column_name: string; foreign_table_name: string; foreign_column_name: string; delete_rule: string }) => {
    console.log(`   - ${r.table_name}.${r.column_name} -> ${r.foreign_table_name}.${r.foreign_column_name} (onDelete: ${r.delete_rule})`);
  });

  // 3. Unique Constraints & Indexes
  const idxRes = await client.query(`
    SELECT
      tablename,
      indexname,
      indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `);

  console.log(`\n⚡ 3. Indexes & Unique Constraints (${idxRes.rows.length}):`);
  idxRes.rows.forEach((r: { tablename: string; indexname: string }) => {
    console.log(`   - [${r.tablename}] ${r.indexname}`);
  });

  // 4. Custom Enums
  const enumRes = await client.query(`
    SELECT t.typname AS enum_name, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS enum_values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
  `);

  console.log(`\n🏷️ 4. User Defined Enums (${enumRes.rows.length}):`);
  enumRes.rows.forEach((r: { enum_name: string; enum_values: string }) => {
    console.log(`   - ${r.enum_name}: [${r.enum_values}]`);
  });

  await client.end();
}

inspectSchema();
