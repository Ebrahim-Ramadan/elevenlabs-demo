"use client";
import { motion } from "framer-motion";

export const BackgroundWave = () => {
  return (
    <motion.video
      src="/wave-loop.mp4"
      autoPlay
      muted
      loop
      controls={false}
      className="fixed grayscale opacity-40 object-cover bottom-40 md:bottom-0 z-[-1]  pointer-events-none opacity-75 "
    />
  );
};
