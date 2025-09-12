import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: Request) {
  try {
    const { items } = await req.json(); // items: [{ name: string, quantity: number }]
    console.log('Received items:', items);
    if (!Array.isArray(items)) {
      console.log('Invalid items payload:', items);
      return NextResponse.json({ error: 'Invalid items' }, { status: 400 });
    }
    const client = await pool.connect();
    try {
      for (const item of items) {
        console.log(`Updating quantity_sold for: ${item.name}, increment: ${item.quantity}`);
        const updateResult = await client.query(
          'UPDATE menu_items SET quantity_sold = quantity_sold + $1, last_purchased = NOW() WHERE name = $2 RETURNING *',
          [item.quantity, item.name]
        );
        console.log('Update result:', updateResult.rows);
        if (updateResult.rowCount === 0) {
          // Item does not exist, insert new record
          const insertResult = await client.query(
            'INSERT INTO menu_items (name, quantity_sold, last_purchased) VALUES ($1, $2, NOW()) RETURNING *',
            [item.name, item.quantity]
          );
          console.log('Insert result:', insertResult.rows);
        }
      }
      console.log('All items updated successfully.');
      return NextResponse.json({ success: true });
    } finally {
      client.release();
    }
  } catch (err : any) {
    console.log('Error in place-order API:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
