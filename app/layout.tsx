import type {Metadata} from "next";
import "./globals.css";
import {BackgroundWave} from "@/components/background-wave";
import Link from "next/link";
import { GithubLogo} from "@/components/logos";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
    title: "ConvAI",
};

export default function RootLayout({children}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" className={"h-full w-full"}>
        <body className={`antialiased w-full h-full lex flex-col`}>
        <div className="flex flex-col flex-grow w-full items-center justify-center sm:px-4">
            <nav
                className={
                    "sm:fixed w-full top-0 left-0 grid grid-cols-2 py-4 px-8"
                }
            >
                 <Link href={"/"} prefetch={true}>
                       <Image 
                       priority={false}
                       unoptimized
                       src="/logo.svg"
                       alt="Caribou Logo"
                       width={100}
                       height={100}
                       className={"w-40 h-auto hover:text-gray-500 text-[#24292f]"}
                       />
                    </Link>
                    <Link href="/inventory" className="text-xs md:text-sm flex gap-2 items-center justify-end text-blue-700 hover:text-blue-900 font-medium ">
                        Inventory 
                        <ArrowRight className="w-5 h-5" />
                    </Link>
                {/* <div className={"flex gap-4 justify-end"}>
                    <Link
                        href="https://github.com/jonatanvm/convai-demo"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={"py-0.5"}
                        aria-label="View source on GitHub"
                    >
                        <GithubLogo
                            className={"w-5 h-5 hover:text-gray-500 text-[#24292f]"}
                        />
                    </Link>
                </div> */}
            </nav>
            {children}
            <BackgroundWave/>
        </div>
        </body>
        </html>
    );
}
