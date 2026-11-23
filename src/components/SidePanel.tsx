import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flag,
  RotateCcw,
  ArrowUpDown,
  Undo2,
  ChevronDown,
  ChevronUp,
  Download,
  MessageSquare,
} from 'lucide-react';
import type { Color, PieceSymbol } from 'chess.js';
import { ChessPiece } from './ChessPiece';
import type { CapturedPiecesSummary } from '../utils/chessEngine';
import type { PieceStyleId } from '../types/settings';

interface MovePair {
  moveNumber: number;
  white?: { san: string; plyIndex: number };
  black?: { san: string; plyIndex: number };
}

interface SidePanelProps {
  turn: Color;
  statusText: string;
  statusSubtext?: string;
  isGameOver: boolean;
  captured: CapturedPiecesSummary;
  pieceStyle?: PieceStyleId;
  moves: string[];
  activePlyIndex?: number;
  canSelectMoves?: boolean;
  onSelectPly?: (plyIndex: number) => void;
  moveNotes?: Record<number, string>;
  onChangeMoveNote?: (plyIndex: number, note: string) => void;
  onExportAnnotatedPgn?: () => void;
  canUndo: boolean;
  canResign: boolean;
  newGameLabel?: string;
  onNewGame: () => void;
  onFlipBoard: () => void;
  onUndoMove: () => void;
  onResign: () => void;
  compactDrawer?: boolean;
  messagesSlot?: React.ReactNode;
  openMessagesNonce?: number;
  children?: React.ReactNode;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  turn,
  statusText,
  statusSubtext,
  isGameOver,
  captured,
  pieceStyle = 'staunton',
  moves,
  activePlyIndex,
  canSelectMoves = false,
  onSelectPly,
  moveNotes,
  onChangeMoveNote,
  onExportAnnotatedPgn,
  canUndo,
  canResign,
  newGameLabel = 'New Game',
  onNewGame,
  onFlipBoard,
  onUndoMove,
  onResign,
  compactDrawer = false,
  messagesSlot,
  openMessagesNonce = 0,
  children,
}) => {
  const moveListRef = useRef<HTMLDivElement | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<'moves' | 'messages'>('moves');

  useEffect(() => {
    if (openMessagesNonce > 0 && messagesSlot) {
      setPanelTab('messages');
    }
  }, [openMessagesNonce, messagesSlot]);

  useEffect(() => {
    if (!messagesSlot && panelTab === 'messages') {
      setPanelTab('moves');
    }
  }, [messagesSlot, panelTab]);

  useEffect(() => {
    if (moveListRef.current && activePlyIndex === undefined) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [moves.length, activePlyIndex]);

  const movePairs: MovePair[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: { san: moves[i], plyIndex: i },
      black: moves[i + 1] ? { san: moves[i + 1], plyIndex: i + 1 } : undefined,
    });
  }

  // Determine which ply note we are editing
  const targetNotePly =
    activePlyIndex !== undefined && activePlyIndex >= 0
      ? activePlyIndex
      : moves.length > 0
      ? moves.length - 1
      : -1;

  const targetNoteLabel =
    targetNotePly >= 0
      ? `${Math.floor(targetNotePly / 2) + 1}${targetNotePly % 2 === 0 ? '.' : '...'} ${
          moves[targetNotePly]
        }`
      : '';

  const renderCapturedRow = (
    label: string,
    pieces: PieceSymbol[],
    pieceColor: Color,
    advantage: number
  ) => (
    <div className="flex items-center justify-between gap-2 min-h-[24px]">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-medium text-slate-400 w-11 shrink-0">{label}</span>
        {pieces.length === 0 ? (
          <span className="text-xs text-slate-600">—</span>
        ) : (
          <div className="flex flex-wrap items-center -space-x-1">
            {pieces.map((p, idx) => (
              <div key={`${p}-${idx}`} className="w-5 h-5 shrink-0">
                <ChessPiece type={p} color={pieceColor} pieceStyle={pieceStyle} />
              </div>
            ))}
          </div>
        )}
      </div>
      {advantage > 0 && (
        <span className="text-xs font-semibold font-mono-tabular text-emerald-400 shrink-0">
          +{advantage}
        </span>
      )}
    </div>
  );

  return (
    <aside
      className={`flex flex-col overflow-hidden h-full ${
        compactDrawer
          ? 'bg-transparent'
          : 'bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.65)]'
      }`}
    >
      {/* Turn & Game Status */}
      <div className="px-5 py-3.5 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-3.5 h-3.5 rounded-sm border shrink-0 transition-colors duration-200 ${
              turn === 'w'
                ? 'bg-slate-100 border-white/50'
                : 'bg-slate-800 border-slate-500'
            }`}
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold text-slate-100 tracking-tight truncate">
            {statusText}
          </h2>
        </div>
        {statusSubtext && (
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">{statusSubtext}</p>
        )}
      </div>

      {/* Mode-specific controls slot */}
      {children && (
        <div className="px-5 py-3.5 border-b border-white/[0.08] bg-slate-950/30">
          {children}
        </div>
      )}

      {/* Optional Moves | Messages Switcher (Play mode) */}
      {messagesSlot && (
        <div className="px-4 py-2 border-b border-white/[0.08] bg-slate-950/40 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setPanelTab('moves')}
            className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              panelTab === 'moves'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/75'
            }`}
          >
            Moves ({moves.length})
          </button>
          <button
            type="button"
            onClick={() => setPanelTab('messages')}
            className={`py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              panelTab === 'messages'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/75'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span>Messages</span>
          </button>
        </div>
      )}

      {panelTab === 'messages' && messagesSlot ? (
        <div className="flex-1 min-h-[260px] flex flex-col overflow-hidden">
          {messagesSlot}
        </div>
      ) : (
        <>
          {/* Captured Pieces */}
          <div className="px-5 py-2.5 border-b border-white/[0.08] space-y-1">
            <div className="text-xs font-medium text-slate-400 mb-1">Captured Pieces</div>
            {renderCapturedRow(
              'White',
              captured.byWhite,
              'b',
              captured.whiteAdvantage > 0 ? captured.whiteAdvantage : 0
            )}
            {renderCapturedRow(
              'Black',
              captured.byBlack,
              'w',
              captured.whiteAdvantage < 0 ? Math.abs(captured.whiteAdvantage) : 0
            )}
          </div>

          {/* Scrollable Move History */}
          <div className="flex-1 flex flex-col min-h-[130px] max-h-[240px] md:max-h-none">
            <div className="flex items-center justify-between px-5 py-2 border-b border-white/[0.07]">
              <span className="text-xs font-medium text-slate-400">Move History</span>
              <span className="text-xs font-mono-tabular text-slate-500">
                {moves.length} {moves.length === 1 ? 'ply' : 'plies'}
              </span>
            </div>

        <div
          ref={moveListRef}
          className="flex-1 overflow-y-auto chess-scroll px-3 py-2"
        >
          {movePairs.length === 0 ? (
            <div className="h-full flex items-center justify-center py-6 text-xs text-slate-500">
              No moves played yet
            </div>
          ) : (
            <div className="space-y-0.5">
              {movePairs.map((pair) => (
                <div
                  key={pair.moveNumber}
                  className="grid grid-cols-[36px_1fr_1fr] items-center text-sm font-mono-tabular"
                >
                  <span className="text-xs text-slate-500 pl-2 py-1 select-none">
                    {pair.moveNumber}.
                  </span>

                  {pair.white && (
                    <button
                      type="button"
                      disabled={!canSelectMoves}
                      onClick={() => onSelectPly?.(pair.white!.plyIndex)}
                      className={`flex items-center justify-between gap-1 text-left px-2 py-1 rounded-md transition-colors truncate ${
                        activePlyIndex === pair.white.plyIndex ||
                        (activePlyIndex === undefined && pair.white.plyIndex === moves.length - 1)
                          ? 'bg-emerald-500/20 text-emerald-300 font-medium'
                          : canSelectMoves
                          ? 'text-slate-200 hover:bg-white/[0.06] cursor-pointer'
                          : 'text-slate-200 cursor-default'
                      }`}
                    >
                      <span className="truncate">{pair.white.san}</span>
                      {moveNotes?.[pair.white.plyIndex]?.trim() && (
                        <MessageSquare className="w-3 h-3 text-indigo-400 shrink-0" />
                      )}
                    </button>
                  )}

                  {pair.black ? (
                    <button
                      type="button"
                      disabled={!canSelectMoves}
                      onClick={() => onSelectPly?.(pair.black!.plyIndex)}
                      className={`flex items-center justify-between gap-1 text-left px-2 py-1 rounded-md transition-colors truncate ${
                        activePlyIndex === pair.black.plyIndex ||
                        (activePlyIndex === undefined && pair.black.plyIndex === moves.length - 1)
                          ? 'bg-emerald-500/20 text-emerald-300 font-medium'
                          : canSelectMoves
                          ? 'text-slate-200 hover:bg-white/[0.06] cursor-pointer'
                          : 'text-slate-200 cursor-default'
                      }`}
                    >
                      <span className="truncate">{pair.black.san}</span>
                      {moveNotes?.[pair.black.plyIndex]?.trim() && (
                        <MessageSquare className="w-3 h-3 text-indigo-400 shrink-0" />
                      )}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Move Notes & Annotated PGN Export */}
      {onChangeMoveNote && (
        <div className="border-t border-white/[0.08] bg-slate-950/35">
          <div className="flex items-center justify-between px-4 py-2">
            <button
              type="button"
              onClick={() => setNotesOpen((o) => !o)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
              <span>Move Notes</span>
              {targetNoteLabel && (
                <span className="text-[11px] font-mono-tabular text-slate-500">
                  ({targetNoteLabel})
                </span>
              )}
              {notesOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {onExportAnnotatedPgn && (
              <button
                type="button"
                onClick={onExportAnnotatedPgn}
                disabled={moves.length === 0}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-800/80 hover:bg-slate-800 disabled:opacity-40 text-slate-200 border border-white/10 transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>Export PGN</span>
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {notesOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden px-4 pb-3"
              >
                {targetNotePly >= 0 ? (
                  <textarea
                    rows={2}
                    value={moveNotes?.[targetNotePly] ?? ''}
                    onChange={(e) => onChangeMoveNote(targetNotePly, e.target.value)}
                    placeholder={`Add coaching note for ${targetNoteLabel}...`}
                    className="w-full rounded-lg px-2.5 py-2 text-xs bg-slate-950/80 text-slate-200 placeholder:text-slate-500 border border-white/10 focus:outline-none focus:border-emerald-400 resize-none"
                  />
                ) : (
                  <div className="text-[11px] text-slate-500 py-1">
                    Play or select a move to attach a coaching comment.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
        </>
      )}

      {/* Action Buttons */}
      <div className="p-3.5 border-t border-white/[0.08] bg-slate-950/45 grid grid-cols-2 gap-2">
        <motion.button
          type="button"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12 }}
          onClick={onNewGame}
          className="flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-sm shadow-emerald-950/50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          <span>{newGameLabel}</span>
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12 }}
          onClick={onFlipBoard}
          className="flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] rounded-xl text-xs font-medium bg-slate-800/75 hover:bg-slate-800 text-slate-200 border border-white/10 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
        >
          <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
          <span>Flip Board</span>
        </motion.button>

        <motion.button
          type="button"
          whileHover={canUndo ? { y: -1 } : undefined}
          whileTap={canUndo ? { scale: 0.97 } : undefined}
          transition={{ duration: 0.12 }}
          onClick={onUndoMove}
          disabled={!canUndo}
          className="flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] rounded-xl text-xs font-medium bg-slate-800/75 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none text-slate-200 border border-white/10 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5 shrink-0" />
          <span>Undo Move</span>
        </motion.button>

        <motion.button
          type="button"
          whileHover={canResign && !isGameOver ? { y: -1 } : undefined}
          whileTap={canResign && !isGameOver ? { scale: 0.97 } : undefined}
          transition={{ duration: 0.12 }}
          onClick={onResign}
          disabled={!canResign || isGameOver}
          className="flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] rounded-xl text-xs font-medium bg-slate-800/75 hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/30 disabled:opacity-40 disabled:pointer-events-none text-slate-200 border border-white/10 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer"
        >
          <Flag className="w-3.5 h-3.5 shrink-0" />
          <span>Resign</span>
        </motion.button>
      </div>
    </aside>
  );
};
