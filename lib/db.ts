// Database access. One small query() function for the whole app.
// - DATABASE_URL set   -> real Postgres (Supabase free tier) through the `pg` driver.
// - DATABASE_URL empty -> embedded Postgres (PGlite) stored in ./.data, zero setup.
// On first use it creates the tables and loads the catalog from data/catalog.json.
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from './env';
import { hashPassword } from './auth-crypto';

type Row = Record<string, any>;
type Runner = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>; exec: (sql: string) => Promise<void> };

const g = globalThis as unknown as { __bazaarDb?: Promise<Runner> };

async function createRunner(): Promise<Runner> {
  if (config.databaseUrl) {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseUrl.includes('localhost') ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
    return {
      query: async (sql, params) => ({ rows: (await pool.query(sql, params as any[])).rows }),
      exec: async (sql) => { await pool.query(sql); },
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  // On Vercel without DATABASE_URL only /tmp is writable (data resets on cold start).
  const dir = process.env.VERCEL ? '/tmp/bazaar-pglite' : path.join(process.cwd(), '.data', 'pglite');
  await mkdir(path.dirname(dir), { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  return {
    query: async (sql, params) => ({ rows: (await db.query<Row>(sql, params as any[])).rows }),
    exec: async (sql) => { await db.exec(sql); },
  };
}

async function init(): Promise<Runner> {
  const r = await createRunner();
  const schema = await readFile(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
  await r.exec(schema);
  await seedIfEmpty(r);
  return r;
}

async function seedIfEmpty(r: Runner) {
  const { rows } = await r.query('select count(*)::int as n from products');
  if (rows[0].n > 0) return;

  const emails = config.sellerEmails.length
    ? config.sellerEmails
    : ['seller.one@bazaar.test', 'seller.two@bazaar.test', 'seller.three@bazaar.test'];
  const names = ['Lahore Beauty House', 'Karachi Lifestyle Co', 'Islamabad Gadgets'];
  const sellerIds: number[] = [];
  for (let i = 0; i < emails.length; i++) {
    const { rows } = await r.query(
      'insert into sellers (name, paypal_email, commission_rate) values ($1, $2, $3) returning id',
      [names[i] ?? `Seller ${i + 1}`, emails[i], config.platformFeeRate],
    );
    sellerIds.push(rows[0].id);
  }

  // Two bulk inserts instead of hundreds of round trips (fast on Supabase and Vercel too).
  const catalog: any[] = JSON.parse(await readFile(path.join(process.cwd(), 'data', 'catalog.json'), 'utf8'));
  const products = catalog.map((p, i) => ({ ...p, reviews: undefined, seller_id: sellerIds[i % sellerIds.length] }));
  await r.query(
    `insert into products (id, title, description, category, brand, price, rating, stock, thumbnail, images, tags, seller_id)
     select x.id, x.title, x.description, x.category, x.brand, x.price, x.rating, x.stock, x.thumbnail, x.images,
            array(select jsonb_array_elements_text(x.tags)), x.seller_id
     from jsonb_to_recordset($1::jsonb) as x(id int, title text, description text, category text, brand text, price numeric,
          rating numeric, stock int, thumbnail text, images jsonb, tags jsonb, seller_id int)
     on conflict (id) do nothing`,
    [JSON.stringify(products)],
  );
  const reviews = catalog.flatMap((p) => p.reviews.map((rv: any) => ({ product_id: p.id, ...rv })));
  await r.query(
    `insert into reviews (product_id, rating, comment, reviewer_name, created_at)
     select x.product_id, x.rating, x.comment, x.reviewer_name, x.created_at
     from jsonb_to_recordset($1::jsonb) as x(product_id int, rating int, comment text, reviewer_name text, created_at timestamptz)`,
    [JSON.stringify(reviews)],
  );

  // Demo account so judges can try it without signing up.
  const { rows: u } = await r.query(
    `insert into users (email, password_hash, name) values ($1, $2, $3)
     on conflict (email) do update set email = excluded.email returning id`,
    [config.demoEmail, hashPassword(config.demoPassword), 'Demo Shopper'],
  );
  await r.query('insert into mandates (user_id) values ($1) on conflict do nothing', [u[0].id]);
}

export function getDb(): Promise<Runner> {
  if (!g.__bazaarDb) {
    g.__bazaarDb = init().catch((e) => { g.__bazaarDb = undefined; throw e; });
  }
  return g.__bazaarDb;
}

export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return (await db.query(sql, params)).rows as T[];
}

export async function one<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function logEvent(type: string, source: string, orderId: string | null, payload: unknown) {
  await query('insert into events (order_id, type, source, payload) values ($1, $2, $3, $4)', [
    orderId, type, source, JSON.stringify(payload ?? {}),
  ]);
}

export const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
