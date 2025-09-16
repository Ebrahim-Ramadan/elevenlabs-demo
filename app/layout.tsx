import type {Metadata} from "next";
import "./globals.css";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Folder } from "lucide-react";

export const metadata: Metadata = {
    title: "ConvAI",
};

export default function RootLayout({children}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" className={"h-full w-full"}>
        <body className={`antialiased w-full h-full lex flex-col`}>
        <div className="flex flex-col flex-grow w-full items-center justify-center sm:px-4">
            <nav
  className="sm:fixed w-full top-0 left-0 flex justify-between items-center py-4 px-8"
>
  <Link href={"/"} prefetch={true}>
    <Image 
      priority={false}
      unoptimized
      src="/logo.svg"
      alt="Caribou Logo"
      width={100}
      height={100}
      className="w-40 h-auto hover:text-gray-500 text-[#24292f]"
    />
  </Link>
  <Link
    href="/inventory"
    className="w-fit text-xs flex gap-2 items-center justify-end text-blue-700 hover:text-blue-900 font-semibold px-3 py-1 rounded-lg transition-all shadow-sm bg-blue-50 hover:bg-blue-100"
  >
    <Folder size={14}  />
    Inventory
    <ArrowRight size={14}  />
  </Link>
</nav>
            {children}
        </div>
        </body>
        </html>
    );
}
