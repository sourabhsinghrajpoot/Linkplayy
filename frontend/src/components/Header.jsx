import React from "react";
import { Button } from "@/components/ui/button";
import { PlayCircle, Sparkles, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Header({ dailyUsed, dailyLimit, onUpgradeClick, onAuthClick }) {
  const { user, logout } = useAuth();
  const isPro = user && user.subscription_status === "pro";

  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-40 backdrop-blur-xl bg-[#050505]/70 border-b border-white/5"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-[#e63946] flex items-center justify-center">
            <PlayCircle className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="font-display text-2xl font-black tracking-tight">
            link<span className="text-[#e63946]">play</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isPro && (
            <div
              data-testid="free-quota-indicator"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"
            >
              <span className="font-mono-lp text-xs text-zinc-400">Free</span>
              <span className="font-mono-lp text-sm font-bold text-white">
                {dailyUsed}/{dailyLimit}
              </span>
            </div>
          )}

          {isPro && (
            <div
              data-testid="pro-badge"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#facc15]/10 border border-[#facc15]/40"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#facc15]" />
              <span className="font-display text-xs font-bold text-[#facc15] tracking-wider">
                PRO
              </span>
            </div>
          )}

          {!isPro && (
            <Button
              data-testid="upgrade-header-btn"
              onClick={onUpgradeClick}
              className="bg-[#facc15] text-[#050505] hover:bg-[#fde047] font-semibold transition-colors"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              Upgrade
            </Button>
          )}

          {user && user !== false ? (
            <button
              data-testid="logout-btn"
              onClick={logout}
              className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              data-testid="header-login-btn"
              onClick={onAuthClick}
              className="text-sm text-zinc-300 hover:text-white transition-colors px-3 py-1.5"
            >
              Log in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
