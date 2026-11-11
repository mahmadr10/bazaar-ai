// Downloads the DummyJSON catalog once and saves it to data/catalog.json.
// The app loads this file into the database on first start, so it works offline.
// Run: npm run seed
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const url = 'https://dummyjson.com/products?limit=0';
const res = await fetch(url);
if (!res.ok) throw new Error(`DummyJSON returned ${res.status}`);
const { products } = await res.json();

const catalog = products.map((p) => ({
  id: p.id,
  title: p.title,
  description: p.description,
  category: p.category,
  brand: p.brand ?? null,
  price: p.price,
  rating: p.rating,
  stock: p.stock,
  thumbnail: p.thumbnail,
  images: p.images ?? [],
  tags: p.tags ?? [],
  reviews: (p.reviews ?? []).map((r) => ({
    rating: r.rating,
    comment: r.comment,
    reviewer_name: r.reviewerName,
    created_at: r.date,
  })),
}));

// Save each thumbnail inside the app (public/products) so pictures never depend on an outside server.
await mkdir(path.join(process.cwd(), 'public', 'products'), { recursive: true });
const queue = [...catalog];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const p = queue.shift();
    const ext = (new URL(p.thumbnail).pathname.match(/\.(webp|png|jpg|jpeg)$/i)?.[1] || 'webp').toLowerCase();
    const r = await fetch(p.thumbnail);
    if (!r.ok) throw new Error(`Thumbnail ${p.id} returned ${r.status}`);
    await writeFile(path.join(process.cwd(), 'public', 'products', `${p.id}.${ext}`), Buffer.from(await r.arrayBuffer()));
    p.thumbnail = `/products/${p.id}.${ext}`;
  }
}));

const out = path.join(process.cwd(), 'data', 'catalog.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(catalog));
const cats = [...new Set(catalog.map((p) => p.category))].sort();
console.log(`Saved ${catalog.length} products to ${out}`);
console.log(`Categories: ${cats.join(', ')}`);
console.log(`Under $10: ${catalog.filter((p) => p.price <= 10).length}, under $20: ${catalog.filter((p) => p.price <= 20).length}`);
