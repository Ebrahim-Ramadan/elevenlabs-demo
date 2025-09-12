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
            <th className="py-2 px-4 text-right">last purchased</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => (
            <tr key={item.name} className="border-t [&>*]:py-2 [&>*]:px-4">
              <td className="">{item.id}</td>
              <td className="">{item.name}</td>
              <td className="  text-red-500 font-bold">{item.inventory}</td>
              <td className="text-sm text-neutral-600 text-right">
  {item.last_purchased
    ? new Date(item.last_purchased).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : "-"}
</td>

              {/* <td className="py-2 px-4 text-right">{item.last_purchased ? new Date(item.last_purchased).toLocaleDateString() : "-"}</td> */}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}