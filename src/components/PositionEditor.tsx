import React, { useState } from 'react';
import type { Color, PieceSymbol } from 'chess.js';
import { motion } from 'framer-motion';
import { Eraser, Trash2, RotateCcw, Copy, Check, Play, Microscope } from 'lucide-react';
import { ChessPiece } from './ChessPiece';
import type { PieceStyleId } from '../types/settings';

export type EditorTool =
  | { kind: 'piece'; color: Color; type: PieceSymbol }
  | { kind: 'erase' };

interface PositionEditorProps {
  selectedTool: EditorTool;
  onSelectTool: (tool: EditorTool) => void;
  turn: Color;
  onChangeTurn: (turn: Color) => void;
  castling: { K: boolean; Q: boolean; k: boolean; q: boolean };
  onToggleCastling: (key: 'K' | 'Q' | 'k' | 'q') => void;
  fenString: string;
  fenError: string | null;
  validationError: string | null;
  pieceStyle: PieceStyleId;
  onLoadFenString: (fen: string) => void;
  onClearBoard: () => void;
  onResetStandard: () => void;
  onPlayFromHere: () => void;
  onAnalyzeFromHere: () => void;
}

const PIECE_ORDER: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p'];

export const PositionEditor: React.FC<PositionEditorProps> = ({
  selectedTool,
  onSelectTool,
  turn,
  onChangeTurn,
  castling,
  onToggleCastling,
  fenString,
  fenError,
  validationError,
  pieceStyle,
  onLoadFenString,
  onClearBoard,
  onResetStandard,
  onPlayFromHere,
  onAnalyzeFromHere,
}) => {
  const [fenDraft, setFenDraft] = useState(fenString);
  const [copied, setCopied] = useState(false);

  // Sync draft when board changes externally
  React.useEffect(() => {
    setFenDraft(fenString);
  }, [fenString]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fenString);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failures
    }
  };

  const renderPaletteRow = (color: Color) => (
    <div className="grid grid-cols-6 gap-1.5">
      {PIECE_ORDER.map((type) => {
        const active =
          selectedTool.kind === 'piece' &&
          selectedTool.color === color &&
          selectedTool.type === type;
        return (
          <button
            key={`${color}-${type}`}
            type="button"
            onClick={() => onSelectTool({ kind: 'piece', color, type })}
            aria-label={`Select ${color === 'w' ? 'White' : 'Black'} ${type}`}
            className={`aspect-square rounded-lg p-1 border transition-colors cursor-pointer touch-manipulation ${
              active
                ? 'bg-emerald-500/25 border-emerald-400 ring-1 ring-emerald-400/50'
                : 'bg-slate-800/70 border-white/10 hover:bg-slate-800'
            }`}
          >
            <ChessPiece type={type} color={color} pieceStyle={pieceStyle} />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-xs text-slate-400 leading-relaxed">
        Select a piece below, then tap squares on the board to place or remove pieces.
      </div>

      {/* Piece Palette */}
      <div className="space-y-2">
        {renderPaletteRow('w')}
        {renderPaletteRow('b')}
      </div>

      {/* Eraser + Clear + Standard */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onSelectTool({ kind: 'erase' })}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer touch-manipulation ${
            selectedTool.kind === 'erase'
              ? 'bg-red-500/20 border-red-400/70 text-red-200'
              : 'bg-slate-800/75 border-white/10 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Eraser className="w-3.5 h-3.5" />
          <span>Eraser</span>
        </button>

        <button
          type="button"
          onClick={onClearBoard}
          className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium bg-slate-800/75 border border-white/10 text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer touch-manipulation"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>

        <button
          type="button"
          onClick={onResetStandard}
          className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium bg-slate-800/75 border border-white/10 text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer touch-manipulation"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Start</span>
        </button>
      </div>

      {/* Turn & Castling Rights */}
      <div className="space-y-2.5 pt-1 border-t border-white/[0.07]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-400">Side to move</span>
          <div className="flex items-center gap-1 p-0.5 bg-slate-950/60 rounded-lg border border-white/10">
            {(
              [
                { id: 'w', label: 'White' },
                { id: 'b', label: 'Black' },
              ] as const
            ).map((side) => (
              <button
                key={side.id}
                type="button"
                onClick={() => onChangeTurn(side.id)}
                className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                  turn === side.id
                    ? 'bg-emerald-500 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {side.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-400">Castling</span>
          <div className="flex items-center gap-1.5">
            {(['K', 'Q', 'k', 'q'] as const).map((flag) => (
              <button
                key={flag}
                type="button"
                onClick={() => onToggleCastling(flag)}
                className={`w-7 h-7 rounded-md text-xs font-mono-tabular font-semibold border transition-colors cursor-pointer ${
                  castling[flag]
                    ? 'bg-indigo-500/25 border-indigo-400/70 text-indigo-200'
                    : 'bg-slate-800/60 border-white/10 text-slate-500 hover:text-slate-300'
                }`}
              >
                {flag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Copy/Paste FEN */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onLoadFenString(fenDraft.trim());
        }}
        className="space-y-1.5 pt-1 border-t border-white/[0.07]"
      >
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={fenDraft}
            onChange={(e) => setFenDraft(e.target.value)}
            aria-label="Custom setup FEN"
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-[11px] font-mono-tabular bg-slate-950/80 text-slate-200 border border-white/10 focus:outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-white/10 transition-colors shrink-0 cursor-pointer"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy setup FEN"
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-white/10 transition-colors shrink-0 cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        {(fenError || validationError) && (
          <p className="text-[11px] text-red-400">{fenError || validationError}</p>
        )}
      </form>

      {/* Launch Actions */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={onPlayFromHere}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-500 to-indigo-500 text-white shadow-sm cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Play from Here</span>
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={onAnalyzeFromHere}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-100 border border-white/10 cursor-pointer"
        >
          <Microscope className="w-3.5 h-3.5" />
          <span>Analyze Position</span>
        </motion.button>
      </div>
    </div>
  );
};
