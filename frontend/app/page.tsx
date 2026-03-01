"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { LenisProvider } from "@/components/lenis-provider";
import { HeroSection } from "@/components/sections/hero-section";
import { ManifestoSection } from "@/components/sections/manifesto-section";
import { FeaturesSection } from "@/components/sections/features-section";
import { ShowcaseSection } from "@/components/sections/showcase-section";
import { PricingSection } from "@/components/sections/pricing-section";
import { FooterSection } from "@/components/sections/footer-section";

function LandingPage() {
  return (
    <LenisProvider>
      <main className="bg-background">
        <HeroSection />
        <ManifestoSection />
        <FeaturesSection />
        <ShowcaseSection />
        <PricingSection />
        <FooterSection />
      </main>
    </LenisProvider>
  );
}

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (session) {
      router.replace("/dashboard");
    }
  }, [session, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (session) {
    return null;
  }

  return <LandingPage />;
}
