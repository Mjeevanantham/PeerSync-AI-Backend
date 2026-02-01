#!/usr/bin/env node
/**
 * Run Supabase migrations via direct Postgres connection.
 *
 * Requires DATABASE_URL in .env:
 *   postgresql://postgres.[project-ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
 *
 * Get from: Supabase Dashboard → Settings → Database → Connection string (URI)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runMigrations() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    console.error('Get it from: Supabase Dashboard → Settings → Database → Connection string (URI)');
    console.error('Add to .env: DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@...pooler.supabase.com:6543/postgres');
    process.exit(1);
  }

  let pg;
  try {
    pg = require('pg');
  } catch (e) {
    console.error('Install pg: npm install pg --save-dev');
    process.exit(1);
  }

  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('Connected to database.');

    for (const file of files) {
      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      console.log(`Running: ${file}`);
      await client.query(sql);
      console.log(`  ✓ ${file}`);
    }

    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
