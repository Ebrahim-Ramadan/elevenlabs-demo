"use client";
import { motion } from "framer-motion";

export const BackgroundWave = () => {
  return (
    <motion.video
      src="/large-thumbnail20250216-3097548-1djrrxq.mp4"
      autoPlay
      muted
      loop
      controls={false}
      className="fixed w-fit h-5/6 opacity-40 object-cover -top-4 md:bottom-0 z-[-1]  pointer-events-none opacity-50 "
    />
  );
};
