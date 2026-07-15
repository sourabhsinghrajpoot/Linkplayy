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
