import React from 'react';

interface EvalBarProps {
  centipawns: number;
  isCheckmate: boolean;
  turn: 'w' | 'b';
  flipped: boolean;
  label: string;
}

export const EvalBar: React.FC<EvalBarProps> = ({
  centipawns,
  isCheckmate,
  turn,
  flipped,
  label,
}) => {
  let whitePercent = 50;
  if (isCheckmate) {
    whitePercent = turn === 'w' ? 0 : 100;
  } else {
    const normalized = Math.tanh(centipawns / 450);
    whitePercent = Math.round((0.5 + normalized * 0.46) * 100);
  }

  const blackPercent = 100 - whitePercent;
  const whiteWinning = whitePercent >= 50;

  return (
    <div
      className="relative flex flex-col w-6 sm:w-7 rounded-lg overflow-hidden border border-white/10 bg-slate-900/80 select-none shrink-0"
      aria-label={`Position evaluation: ${label}`}
      title={`Static evaluation: ${label}`}
    >
      {flipped ? (
        <>
          <div
            className="w-full bg-[#F1F5F9] transition-[height] duration-300 ease-out"
            style={{ height: `${whitePercent}%` }}
          />
          <div
            className="w-full bg-slate-800 transition-[height] duration-300 ease-out"
            style={{ height: `${blackPercent}%` }}
          />
        </>
      ) : (
        <>
          <div
            className="w-full bg-slate-800 transition-[height] duration-300 ease-out"
            style={{ height: `${blackPercent}%` }}
          />
          <div
            className="w-full bg-[#F1F5F9] transition-[height] duration-300 ease-out"
            style={{ height: `${whitePercent}%` }}
          />
        </>
      )}

      <span
        className={`absolute left-0 right-0 text-center text-[9px] font-semibold font-mono-tabular leading-none px-0.5 ${
          whiteWinning
            ? flipped
              ? 'top-1.5 text-slate-900'
              : 'bottom-1.5 text-slate-900'
            : flipped
            ? 'bottom-1.5 text-slate-200'
            : 'top-1.5 text-slate-200'
        }`}
      >
        {label}
      </span>
    </div>
  );
};
