import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      // Select all items, show quantity_sold as "-quantity_sold"
      const result = await client.query(
        `SELECT id, name, ('-' || quantity_sold::text) AS inventory FROM menu_items`
      );
      return NextResponse.json({ items: result.rows });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error fetching inventory:', err);
    return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 });
  }
}