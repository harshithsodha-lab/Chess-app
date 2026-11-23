import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { ChessPiece } from './ChessPiece';
import type { AcademyUser } from '../types/academy';

interface AcademyAuthGateProps {
  noticeMessage: string | null;
  onAuthenticated: (token: string, user: AcademyUser) => void;
}

export const AcademyAuthGate: React.FC<AcademyAuthGateProps> = ({
  noticeMessage,
  onAuthenticated,
}) => {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });

      const data = (await res.json()) as {
        error?: string;
        token?: string;
        user?: AcademyUser;
      };

      if (!res.ok || !data.token || !data.user) {
        setError(data.error || 'Invalid Login ID or password.');
        setSubmitting(false);
        return;
      }

      onAuthenticated(data.token, data.user);
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1014] px-4 py-6 overflow-y-auto"
      aria-label="Sign In"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[390px] rounded-2xl bg-[#18181B] border border-white/10 p-6 sm:p-7 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)]"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-1.5 shrink-0">
            <ChessPiece type="n" color="w" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-50">
              Pure Chess
            </h1>
            <p className="text-xs text-zinc-400">Sign in to your account</p>
          </div>
        </div>

        <form onSubmit={handleLoginSubmit} className="space-y-4">
          {noticeMessage && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2.5 text-xs text-amber-200">
              {noticeMessage}
            </div>
          )}

          <div>
            <label
              htmlFor="academy-login-id"
              className="block text-xs font-medium text-zinc-300 mb-1.5"
            >
              Login ID
            </label>
            <input
              id="academy-login-id"
              type="text"
              autoComplete="username"
              required
              value={loginId}
              onChange={(e) => setLoginId(e.target.value.toUpperCase())}
              placeholder="STUDENT01"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono-tabular bg-[#121216] text-slate-100 placeholder:text-zinc-600 border border-white/10 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label
              htmlFor="academy-password"
              className="block text-xs font-medium text-zinc-300 mb-1.5"
            >
              Password
            </label>
            <input
              id="academy-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#121216] text-slate-100 placeholder:text-zinc-600 border border-white/10 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3.5 py-2.5 text-xs text-red-200">
              {error}
            </div>
          )}

          <motion.button
            type="submit"
            disabled={submitting}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.985 }}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-950/50 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <span>{submitting ? 'Signing In…' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </form>
      </motion.div>
    </section>
  );
};
