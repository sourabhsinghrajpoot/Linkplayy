import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { formatApiErrorDetail } from "@/lib/api";
import { Loader2, Mail, Lock, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

export default function AuthModal({ open, onOpenChange, defaultTab = "signup", onSuccess }) {
  const { login, register } = useAuth();
  const [tab, setTab] = useState(defaultTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setEmail("");
    setPassword("");
    setName("");
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (tab === "signup") {
        await register(email, password, name);
        toast.success("Account created!");
      } else {
        await login(email, password);
        toast.success("Welcome back!");
      }
      reset();
      onOpenChange(false);
      onSuccess && onSuccess();
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="auth-modal"
        className="sm:max-w-md bg-[#0c0c0e] border border-white/10 text-white"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-bold">
            {tab === "signup" ? "Create account" : "Welcome back"}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {tab === "signup"
              ? "Sign up to unlock Pro features and unlimited playback."
              : "Log in to continue where you left off."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 rounded-lg bg-black/40 p-1 mb-2">
          <button
            data-testid="auth-tab-signup"
            onClick={() => {
              setTab("signup");
              setError("");
            }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "signup"
                ? "bg-[#e63946] text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Sign up
          </button>
          <button
            data-testid="auth-tab-login"
            onClick={() => {
              setTab("login");
              setError("");
            }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "login"
                ? "bg-[#e63946] text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Log in
          </button>
        </div>

        {/* Google login */}
        <button
          type="button"
          data-testid="google-signin-btn"
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-3 bg-white text-[#111] font-semibold py-3 rounded-lg hover:bg-zinc-100 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.12A6.99 6.99 0 0 1 5.47 12c0-.74.13-1.46.37-2.12V7.04H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.96l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.4c1.61 0 3.06.55 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.33 9.14 5.4 12 5.4z"
            />
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-zinc-500 font-mono-lp">OR</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-zinc-300">
                Name
              </Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  id="name"
                  data-testid="auth-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="pl-9 bg-black/40 border-white/10 text-white"
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-zinc-300">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                id="email"
                data-testid="auth-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="pl-9 bg-black/40 border-white/10 text-white"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-zinc-300">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                id="password"
                data-testid="auth-password-input"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="pl-9 bg-black/40 border-white/10 text-white"
              />
            </div>
          </div>

          {error && (
            <div
              data-testid="auth-error"
              className="text-sm text-[#f87171] bg-[#e63946]/10 border border-[#e63946]/30 rounded-md px-3 py-2"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            data-testid="auth-submit-btn"
            disabled={loading}
            className="w-full bg-[#e63946] hover:bg-[#f04856] text-white font-semibold py-6 transition-colors"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : tab === "signup" ? (
              "Create account & continue"
            ) : (
              "Log in"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
