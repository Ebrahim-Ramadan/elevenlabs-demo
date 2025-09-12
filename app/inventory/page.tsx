import React from "react";

async function getInventory() {
  // Use process.env.NEXT_PUBLIC_SITE_URL or hardcode your site URL
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ;
  const res = await fetch(`${baseUrl}/api/inventory`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch inventory");
  const data = await res.json();
  return data.items;
}

export default async function InventoryPage() {
  const items = await getInventory();
  
  return (
    <main className="max-w-2xl mx-auto py-24">
      <h1 className="text-2xl font-bold mb-6 text-center">Main Inventory</h1>
      <table className="w-full border rounded-xl overflow-hidden">
        <thead>
          <tr className="bg-gray-100">
            <th className="py-2 px-4 text-left">id</th>
            <th className="py-2 px-4 text-left">Item</th>
            <th className="py-2 px-4 text-right">Inventory</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => (
            <tr key={item.name} className="border-t">
              <td className="py-2 px-4">{item.id}</td>
              <td className="py-2 px-4">{item.name}</td>
              <td className="py-2 px-4 text-right text-red-500 font-bold">{item.inventory}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}