"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

function TypeTester() {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setScale((prev) => (prev === 1 ? 1.5 : 1));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center h-full">
      <motion.span
        className="font-serif text-6xl md:text-8xl text-foreground"
        animate={{ scale }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        A*-
      </motion.span>
    </div>
  );
}

function LayoutAnimation() {
  const [layout, setLayout] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLayout((prev) => (prev + 1) % 3);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const layouts = [
    "grid-cols-2 grid-rows-2",
    "grid-cols-3 grid-rows-1",
    "grid-cols-1 grid-rows-3",
  ];

  return (
    <div className="h-full p-4 flex items-center justify-center">
      <motion.div
        className={`grid ${layouts[layout]} gap-2 w-full max-w-[140px]`}
        layout
      >
        {[1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="bg-primary/20 rounded-md min-h-[30px]"
            layout
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </motion.div>
    </div>
  );
}

function SeedIndicator() {
  const [hash, setHash] = useState("a3f8b2c1");

  useEffect(() => {
    const chars = "0123456789abcdef";
    const interval = setInterval(() => {
      let h = "";
      for (let i = 0; i < 8; i++) h += chars[Math.floor(Math.random() * 16)];
      setHash(h);
    }, 300);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <span className="text-2xl md:text-3xl font-mono font-medium text-foreground tracking-wider">
        {hash}
      </span>
      <span className="text-xs text-muted-foreground">SHA3-256 Entropy Seed</span>
    </div>
  );
}

export function FeaturesSection() {
  return (
    <section className="bg-background px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <motion.p
          className="text-muted-foreground text-sm uppercase tracking-widest mb-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Features
        </motion.p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            className="bg-secondary rounded-xl p-8 min-h-[280px] flex flex-col"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ scale: 0.98 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.2 }}
            data-clickable
          >
            <div className="flex-1">
              <TypeTester />
            </div>
            <div className="mt-4">
              <h3 className="font-serif text-xl text-foreground">Encrypt</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Encrypt documents automatically. Reduce risk of unknown and
                forgery access.
              </p>
            </div>
          </motion.div>

          <motion.div
            className="bg-secondary rounded-xl p-8 min-h-[280px] flex flex-col"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            whileHover={{ scale: 0.98 }}
            whileTap={{ scale: 0.96 }}
            data-clickable
          >
            <div className="flex-1">
              <LayoutAnimation />
            </div>
            <div className="mt-4">
              <h3 className="font-serif text-xl text-foreground">
                Organizational Tools
              </h3>
              <p className="text-muted-foreground text-sm mt-1">
                Organize secure documents into folders with varying levels of
                security.
              </p>
            </div>
          </motion.div>

          <motion.div
            className="bg-secondary rounded-xl p-8 min-h-[280px] flex flex-col"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 0.98 }}
            whileTap={{ scale: 0.96 }}
            data-clickable
          >
            <div className="flex-1">
              <SeedIndicator />
            </div>
            <div className="mt-4">
              <h3 className="font-serif text-xl text-foreground">Seed Generation</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Every 5 minutes, Velum samples live Solana data — token account
                balances, slot, and blockhash — combines it with registered
                document IDs, and hashes it via SHA3-256 to produce a verifiable
                entropy seed committed on-chain using the SPL Memo program.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
