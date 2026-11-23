import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { ChessPiece } from './ChessPiece';

interface WelcomeCoverProps {
  onStart: () => void;
}

const GRID_CELLS = Array.from({ length: 64 }, (_, idx) => {
  const row = Math.floor(idx / 8);
  const col = idx % 8;
  const isLight = (row + col) % 2 === 0;
  const distanceFromCenter = Math.hypot(row - 3.5, col - 3.5);
  return { idx, row, col, isLight, distanceFromCenter };
});

export const WelcomeCover: React.FC<WelcomeCoverProps> = ({ onStart }) => {
  return (
    <motion.section
      key="welcome-cover"
      initial={{ opacity: 1 }}
      exit={{
        opacity: 0,
        y: -32,
        scale: 0.985,
        transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#090D16] overflow-hidden px-6"
      aria-label="Welcome to Pure Chess"
    >
      {/* Soft ambient radial glows */}
      <div
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[780px] h-[520px] rounded-full opacity-35 blur-[120px]"
        style={{
          background:
            'radial-gradient(circle, rgba(16,185,129,0.28) 0%, rgba(99,102,241,0.22) 55%, transparent 75%)',
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 left-1/2 -translate-x-1/2 w-[680px] h-[420px] rounded-full opacity-25 blur-[110px]"
        style={{
          background:
            'radial-gradient(circle, rgba(99,102,241,0.28) 0%, rgba(16,185,129,0.12) 60%, transparent 80%)',
        }}
      />

      {/* Subtle animated geometric chessboard grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
        aria-hidden="true"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, rotate: -6 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-8 w-[min(125vw,920px)] aspect-square gap-1.5 p-2 opacity-[0.22]"
          style={{
            maskImage:
              'radial-gradient(circle at center, rgba(0,0,0,0.9) 18%, rgba(0,0,0,0.3) 56%, transparent 78%)',
            WebkitMaskImage:
              'radial-gradient(circle at center, rgba(0,0,0,0.9) 18%, rgba(0,0,0,0.3) 56%, transparent 78%)',
          }}
        >
          {GRID_CELLS.map((cell) => (
            <motion.div
              key={cell.idx}
              initial={{ opacity: 0.15 }}
              animate={{
                opacity: cell.isLight ? [0.14, 0.32, 0.14] : [0.04, 0.12, 0.04],
              }}
              transition={{
                duration: 4.8,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: cell.distanceFromCenter * 0.22,
              }}
              className={`rounded-md border ${
                cell.isLight
                  ? 'bg-slate-400/20 border-white/10'
                  : 'bg-slate-800/40 border-white/[0.04]'
              }`}
            />
          ))}
        </motion.div>
      </div>

      {/* Foreground Center Card / Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 max-w-xl w-full text-center flex flex-col items-center"
      >
        {/* Minimal piece emblem */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="w-16 h-16 mb-7 rounded-2xl bg-slate-900/75 backdrop-blur-md border border-white/10 shadow-2xl shadow-emerald-950/30 flex items-center justify-center p-2.5"
        >
          <ChessPiece type="n" color="w" className="w-full h-full" />
        </motion.div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-slate-50 text-balance">
          PURE CHESS
        </h1>

        <p className="mt-4 text-base sm:text-lg text-slate-300/90 max-w-md leading-relaxed">
          Play, train, and analyze—fast, smooth, and 100% ad-free.
        </p>

        <div className="mt-8 flex flex-col items-center gap-5">
          <motion.button
            type="button"
            onClick={onStart}
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="group relative inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl text-sm sm:text-base font-semibold text-white bg-gradient-to-r from-emerald-500 to-indigo-500 shadow-[0_0_32px_-4px_rgba(16,185,129,0.55)] hover:shadow-[0_0_40px_-2px_rgba(99,102,241,0.65)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Play Now</span>
            <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5" />
          </motion.button>

          <div className="flex items-center gap-2.5 text-xs text-slate-400">
            <span>Bot &amp; Pass-and-Play</span>
            <span aria-hidden="true">·</span>
            <span>Tactical Puzzles</span>
            <span aria-hidden="true">·</span>
            <span>Analysis Board</span>
          </div>
        </div>
      </motion.div>
    </motion.section>
  );
};
