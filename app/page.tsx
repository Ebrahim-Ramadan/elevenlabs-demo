import {ConvAI} from "@/components/ConvAI";
import { ConvAINLP } from "@/components/ConvAI-nlp";

export default function Home() {
    return (
        <div
            className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center w-full min-h-screen p-8 pb-20 gap-16 sm:p-12">
                          <ConvAI/>
{/* <ConvAINLP/> */}
        </div>
    );
}
