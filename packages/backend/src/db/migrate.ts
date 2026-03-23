import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const connectionString =
  process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  process.stderr.write(
    'Missing DATABASE_MIGRATION_URL or DATABASE_URL environment variable\n',
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

const db = drizzle(client);

process.stdout.write('Running migrations...\n');
await migrate(db, { migrationsFolder: './drizzle' });
process.stdout.write('Migrations complete.\n');

await client.end();
