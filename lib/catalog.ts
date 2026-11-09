// Catalog search and ranking. Prices, ratings and stock always come from the database.
import { query, one, num } from './db';
import type { ProductCard, ProductDetails } from './contracts';

export const CATEGORIES = [
  'beauty', 'fragrances', 'furniture', 'groceries', 'home-decoration', 'kitchen-accessories', 'laptops',
  'mens-shirts', 'mens-shoes', 'mens-watches', 'mobile-accessories', 'motorcycle', 'skin-care', 'smartphones',
  'sports-accessories', 'sunglasses', 'tablets', 'tops', 'vehicle', 'womens-bags', 'womens-dresses',
  'womens-jewellery', 'womens-shoes', 'womens-watches',
];

const SYNONYMS: Record<string, string[]> = {
  perfume: ['fragrance', 'eau'], cologne: ['fragrance', 'eau'], scent: ['fragrance'], attar: ['fragrance'],
  phone: ['smartphone', 'phone'], mobile: ['smartphone', 'phone'], makeup: ['beauty'], cosmetic: ['beauty'],
  sneaker: ['shoe'], trainer: ['shoe'], bag: ['bag', 'handbag'], purse: ['bag'], laptop: ['laptop'],
  shade: ['sunglasses'], glasses: ['sunglasses'], soap: ['soap', 'wash'], cream: ['cream', 'lotion', 'moisture'],
};
const STOP = new Set(['a', 'an', 'the', 'for', 'me', 'my', 'best', 'good', 'cheap', 'under', 'below', 'with', 'and', 'or', 'of', 'some', 'nice', 'buy', 'find']);

function terms(keywords: string): string[] {
  const words = keywords.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length > 1 && !STOP.has(w));
  const out = new Set<string>();
  for (let w of words) {
    if (w.length > 4 && w.endsWith('es') && !w.endsWith('sses')) w = w.slice(0, -2);
    else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    out.add(w);
    for (const s of SYNONYMS[w] ?? []) out.add(s);
  }
  return [...out].slice(0, 8);
}

type Row = { id: number; title: string; price: string; rating: string; category: string; thumbnail: string; stock: number; avg_review: string | null; review_count: number; rel: number };

const toCard = (r: Row, score?: number): ProductCard => ({
  id: r.id, title: r.title, price: num(r.price), rating: num(r.rating), category: r.category,
  thumbnail: r.thumbnail, stock: r.stock, avgReview: Math.round(num(r.avg_review) * 100) / 100,
  reviewCount: r.review_count, score: score === undefined ? undefined : Math.round(score * 1000) / 1000,
});

// Deterministic, explainable score from the project plan:
// 0.5 * rating/5 + 0.3 * avgReview/5 + 0.2 * (1 - price/budget)   (last term only with a budget)
export function valueScore(p: { rating: number; avgReview: number; price: number }, budget?: number | null): number {
  const base = 0.5 * (p.rating / 5) + 0.3 * (p.avgReview / 5);
  if (!budget || budget <= 0) return base / 0.8;
  return base + 0.2 * Math.max(0, 1 - p.price / budget);
}

export async function searchProducts(q: {
  keywords: string; category?: string; maxPrice?: number | null; minRating?: number; limit?: number;
}): Promise<ProductCard[]> {
  const t = terms(q.keywords || '');
  const params: unknown[] = [];
  const relParts: string[] = [];
  for (const w of t) {
    params.push(`%${w}%`);
    const i = params.length;
    relParts.push(`(case when p.title ilike $${i} then 3 else 0 end + case when p.category ilike $${i} then 2 else 0 end
      + case when array_to_string(p.tags, ' ') ilike $${i} then 2 else 0 end + case when p.description ilike $${i} then 1 else 0 end)`);
  }
  const rel = relParts.length ? relParts.join(' + ') : '1';
  const where = ['p.stock > 0'];
  const category = q.category && CATEGORIES.includes(q.category) ? q.category : null;
  if (category) { params.push(category); where.push(`p.category = $${params.length}`); }
  if (q.maxPrice) { params.push(q.maxPrice); where.push(`p.price <= $${params.length}`); }
  if (q.minRating) { params.push(q.minRating); where.push(`p.rating >= $${params.length}`); }

  const rows = await query<Row>(
    `select * from (
       select p.id, p.title, p.price, p.rating, p.category, p.thumbnail, p.stock,
              (select avg(r.rating) from reviews r where r.product_id = p.id) as avg_review,
              (select count(*)::int from reviews r where r.product_id = p.id) as review_count,
              (${rel})::int as rel
       from products p where ${where.join(' and ')}
     ) x where x.rel > 0 order by x.rel desc limit 60`,
    params,
  );
  if (!rows.length) return [];
  // Keep only the most relevant tier, then rank by value score.
  const maxRel = Math.max(...rows.map((r) => r.rel));
  const relevant = rows.filter((r) => r.rel >= Math.max(2, maxRel * 0.5) || (!category && t.length === 0));
  return relevant
    .map((r) => ({ r, s: valueScore({ rating: num(r.rating), avgReview: num(r.avg_review), price: num(r.price) }, q.maxPrice) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, Math.min(q.limit ?? 5, 8))
    .map(({ r, s }) => toCard(r, s));
}

export async function getProduct(id: number): Promise<ProductDetails | null> {
  const p = await one<Row & { description: string; brand: string | null }>(
    `select p.*, (select avg(r.rating) from reviews r where r.product_id = p.id) as avg_review,
            (select count(*)::int from reviews r where r.product_id = p.id) as review_count, 1 as rel
     from products p where p.id = $1`, [id]);
  if (!p) return null;
  const reviews = await query<{ rating: number; comment: string; reviewer_name: string }>(
    'select rating, comment, reviewer_name from reviews where product_id = $1 order by id limit 5', [id]);
  return { ...toCard(p), description: p.description, brand: p.brand, reviews };
}
