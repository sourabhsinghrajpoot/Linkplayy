import React from "react";
import { Check, Sparkles, Zap, Infinity as InfIcon, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PricingCard({ onSubscribe, isPro }) {
  const features = [
    { icon: InfIcon, text: "Unlimited link playback" },
    { icon: Zap, text: "HD quality streaming" },
    { icon: Download, text: "Fast, priority download" },
    { icon: Sparkles, text: "Skip ads & rate limits" },
  ];

  return (
    <section
      data-testid="pricing-section"
      className="max-w-7xl mx-auto px-4 sm:px-8 pb-24"
    >
      <div className="grid lg:grid-cols-2 gap-6 items-stretch">
        {/* Left copy */}
        <div className="flex flex-col justify-center">
          <div className="mb-3 inline-flex w-fit items-center gap-2 px-3 py-1 rounded-full bg-[#facc15]/10 border border-[#facc15]/30">
            <Sparkles className="w-3 h-3 text-[#facc15]" />
            <span className="font-mono-lp text-xs uppercase tracking-widest text-[#facc15]">
              LinkPlay Pro
            </span>
          </div>
          <h2 className="font-display text-4xl sm:text-5xl font-black tracking-tight leading-tight mb-4">
            Stop counting.
            <br />
            <span className="text-[#facc15]">Start streaming.</span>
          </h2>
          <p className="text-zinc-400 text-lg max-w-md">
            The free tier is great for a few videos a day. Go Pro to unlock
            unlimited playback, HD quality, and faster downloads — for less than
            a chai a week.
          </p>
        </div>

        {/* Right pricing card */}
        <div
          data-testid="pro-card"
          className="relative rounded-3xl border border-[#facc15]/30 bg-gradient-to-b from-[#facc15]/[0.06] to-[#0c0c0e] p-8 sm:p-10"
        >
          <div className="absolute inset-0 rounded-3xl pointer-events-none border border-white/5" />
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="font-mono-lp text-xs uppercase tracking-widest text-zinc-500 mb-2">
                Monthly plan
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-display text-5xl font-black text-white">
                  ₹49
                </span>
                <span className="text-zinc-500 font-mono-lp text-sm">
                  /month
                </span>
              </div>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-[#facc15] flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-[#050505]" strokeWidth={2.5} />
            </div>
          </div>

          <ul className="space-y-3 mb-8">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-[#facc15]/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-[#facc15]" strokeWidth={3} />
                </div>
                <span className="text-zinc-200">{f.text}</span>
              </li>
            ))}
          </ul>

          {isPro ? (
            <Button
              data-testid="already-pro-btn"
              disabled
              className="w-full bg-[#facc15]/20 text-[#facc15] border border-[#facc15]/40 font-semibold py-6"
            >
              You are already Pro
            </Button>
          ) : (
            <Button
              data-testid="pro-upgrade-btn"
              onClick={onSubscribe}
              className="w-full bg-[#facc15] hover:bg-[#fde047] text-[#050505] font-bold py-6 text-base transition-colors"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Get Pro — ₹49/month
            </Button>
          )}
          <p className="text-center text-xs text-zinc-500 mt-3 font-mono-lp">
            Powered by Razorpay • Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}
