"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronDown } from "lucide-react";
import MetallicPaint from "@/components/MetallicPaint";

const images = [
  "/premium_photo-1670573801174-1ab41ec2afa0.avif",
  "/bigstock-Businessman-Or-Accountant-Work-BW_small.jpg",
  "/new-york-skyline-art-bw.jpg",
];

/** Matte gold used for Velum wordmark and accent text - single source of truth */
const VELUM_GOLD = "#b8a060";

const LANDING_BG_IMAGE = "/Screenshot 2026-02-28 at 5.21.47 PM.png";

function landingBgUrl() {
  return `url("${encodeURI(LANDING_BG_IMAGE)}")`;
}

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const rotate1 = useTransform(scrollYProgress, [0, 1], [-6, 0]);
  const rotate2 = useTransform(scrollYProgress, [0, 1], [0, 0]);
  const rotate3 = useTransform(scrollYProgress, [0, 1], [6, 0]);
  const x1 = useTransform(scrollYProgress, [0, 1], [-80, 0]);
  const x3 = useTransform(scrollYProgress, [0, 1], [80, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const ySide = useTransform(y, (v) => (v as number) + 48);

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-background px-6 -mt-8 pt-0 pb-0 gap-1"
    >
      {/* Background: black base + screenshot on top */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: landingBgUrl(),
        }}
        aria-hidden
      />
      {/* Logo emblem and wordmark above cards */}
      <div className="relative z-10 flex items-center justify-center gap-12 md:gap-16 shrink-0">
        <a
          href="#"
          className="text-lg font-serif text-muted-foreground hover:text-foreground transition-colors shrink-0"
          data-clickable
        >
          The Wall
        </a>
        <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
          <div className="w-[min(24vmin,140px)] h-[min(24vmin,140px)] md:w-[min(16vmin,120px)] md:h-[min(16vmin,120px)]">
            <MetallicPaint
              imageSrc="/velumclear.png"
              scale={3.5}
              refraction={0.012}
              liquid={0.7}
              speed={0.25}
              brightness={2}
              lightColor="#ffffff"
              darkColor="#000000"
              fresnel={1}
            />
          </div>
          <span className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight font-serif" style={{ color: VELUM_GOLD }}>
            Velum
          </span>
        </div>
        <a
          href="#pricing"
          className="text-lg font-serif text-muted-foreground hover:text-foreground transition-colors shrink-0"
          data-clickable
        >
          Pricing
        </a>
      </div>

      <div className="relative z-10 flex items-center justify-center min-h-[420px] md:min-h-[480px]">
        <motion.div
          className="absolute w-[280px] md:w-[320px] aspect-[3/4] rounded-xl overflow-hidden shadow-2xl"
          style={{ rotate: rotate1, x: x1, y: ySide, zIndex: 1 }}
          initial={{ clipPath: "inset(100% 0 0 0)" }}
          animate={{ clipPath: "inset(0 0 0 0)" }}
          transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <img
            src={images[0]}
            alt="Showcase 1"
            className="w-full h-full object-cover"
          />
        </motion.div>

        <motion.div
          className="relative w-[280px] md:w-[320px] aspect-[3/4] rounded-xl overflow-hidden shadow-2xl"
          style={{ rotate: rotate2, y, zIndex: 2 }}
          initial={{ clipPath: "inset(100% 0 0 0)" }}
          animate={{ clipPath: "inset(0 0 0 0)" }}
          transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <img
            src={images[1]}
            alt="Showcase 2"
            className="w-full h-full object-cover"
          />
        </motion.div>

        <motion.div
          className="absolute w-[280px] md:w-[320px] aspect-[3/4] rounded-xl overflow-hidden shadow-2xl"
          style={{ rotate: rotate3, x: x3, y: ySide, zIndex: 1 }}
          initial={{ clipPath: "inset(100% 0 0 0)" }}
          animate={{ clipPath: "inset(0 0 0 0)" }}
          transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <img
            src={images[2]}
            alt="Showcase 3"
            className="w-full h-full object-cover"
          />
        </motion.div>
      </div>

      <motion.div
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.8 }}
      >
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif text-center text-foreground mix-blend-difference">
          Documents stay <em className="italic font-serif font-bold tracking-tight mix-blend-normal" style={{ color: VELUM_GOLD }}>Yours</em>
        </h1>
      </motion.div>

      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <motion.div
          className="text-foreground/70"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
        >
          <ChevronDown className="w-8 h-8" strokeWidth={2} />
        </motion.div>
      </motion.div>
    </section>
  );
}
