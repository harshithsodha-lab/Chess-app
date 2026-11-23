import React, { useEffect, useMemo, useState } from 'react';
import { Chess, type Square, type PieceSymbol } from 'chess.js';
import { motion } from 'framer-motion';
import {
  Zap,
  Clock,
  Users,
  Bot,
  Puzzle,
  BookOpen,
  Microscope,
  ArrowRight,
  ArrowUpDown,
  RotateCcw,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from 'lucide-react';
import { Chessboard } from './Chessboard';
import { ChessPiece } from './ChessPiece';
import { MessagesPanel } from './MessagesPanel';
import type { BoardThemeId, PieceStyleId } from '../types/settings';
import type {
  AcademyGameRecord,
  AcademyUser,
  ClassmateDirectoryEntry,
  StudentProgressRecord,
} from '../types/academy';
import type { ChessLesson } from '../data/lessons';

export type QuickPlayTimeControl = 'rapid10' | 'blitz5' | 'untimed';
export type QuickPlayOpponent = 'beginner' | 'club' | 'coach' | 'local';

interface HomeDashboardProps {
  token: string;
  user: AcademyUser;
  adminModeActive?: boolean;
  boardTheme: BoardThemeId;
  pieceStyle: PieceStyleId;
  showCoordinates: boolean;
  latestPuzzle: {
    id: string;
    title: string;
    fen: string;
    solution: string[];
    difficulty: string;
    coachNotes: string;
    isCustom: boolean;
  };
  nextLesson: ChessLesson;
  nextLessonIndex: number;
  studentProgress: StudentProgressRecord[];
  recentGames: AcademyGameRecord[];
  classmates: ClassmateDirectoryEntry[];
  activeMatchRoomId: string | null;
  activeMatchOpponentLabel: string | null;
  selectedDmPeerId: string | null;
  onSelectDmPeerId: (peerId: string | null) => void;
  onOpenFriendsDrawer: () => void;
  onOpenModerationQueue?: () => void;
  onTogglePeerChatDisabled?: (userId: string, currentlyDisabled: boolean) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onStartMatch: (opponent: QuickPlayOpponent, timeControl: QuickPlayTimeControl) => void;
  onOpenDailyPuzzle: () => void;
  onOpenLesson: (lessonIdx: number) => void;
  onReviewGame: (game: AcademyGameRecord) => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

function computeAcademyStats(
  games: AcademyGameRecord[],
  progress: StudentProgressRecord[]
): { rating: number; solvedToday: number; totalSolved: number; streakDays: number } {
  const solvedList = progress.filter((p) => p.solved);
  const totalSolved = solvedList.length;

  const todayKey = new Date().toISOString().slice(0, 10);
  const solvedToday = solvedList.filter(
    (p) => p.completed_at && p.completed_at.slice(0, 10) === todayKey
  ).length;

  // Deterministic rating derived from real games + puzzle solves
  let rating = 1200 + totalSolved * 12;
  for (const g of games) {
    if (g.result === 'win') rating += 18;
    else if (g.result === 'loss') rating -= 12;
    else rating += 2;
  }
  rating = Math.max(800, rating);

  // Activity streak from completed puzzles and played games
  const activeDates = new Set<string>();
  for (const p of solvedList) {
    if (p.completed_at) activeDates.add(p.completed_at.slice(0, 10));
  }
  for (const g of games) {
    if (g.played_at) activeDates.add(g.played_at.slice(0, 10));
  }

  let streakDays = 0;
  if (activeDates.size > 0) {
    const cursor = new Date();
    // Allow streak to start from today or yesterday if user hasn't solved yet today
    const curStr = cursor.toISOString().slice(0, 10);
    if (!activeDates.has(curStr)) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    while (activeDates.has(cursor.toISOString().slice(0, 10))) {
      streakDays += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }

  return { rating, solvedToday, totalSolved, streakDays };
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Recent';
  }
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  token,
  user,
  adminModeActive = false,
  boardTheme,
  pieceStyle,
  showCoordinates,
  latestPuzzle,
  nextLesson,
  nextLessonIndex,
  studentProgress,
  recentGames,
  classmates,
  activeMatchRoomId,
  activeMatchOpponentLabel,
  selectedDmPeerId,
  onSelectDmPeerId,
  onOpenFriendsDrawer,
  onOpenModerationQueue,
  onTogglePeerChatDisabled,
  onDeleteMessage,
  onStartMatch,
  onOpenDailyPuzzle,
  onOpenLesson,
  onReviewGame,
}) => {
  const stats = useMemo(
    () => computeAcademyStats(recentGames, studentProgress),
    [recentGames, studentProgress]
  );

  // Interactive Home Preview Board driven by latest Admin puzzle
  const [previewMoves, setPreviewMoves] = useState<string[]>([]);
  const [previewFlipped, setPreviewFlipped] = useState<boolean>(() => {
    try {
      return new Chess(latestPuzzle.fen).turn() === 'b';
    } catch {
      return false;
    }
  });
  const [previewStatus, setPreviewStatus] = useState<'ready' | 'wrong' | 'solved'>('ready');

  useEffect(() => {
    setPreviewMoves([]);
    setPreviewStatus('ready');
    try {
      setPreviewFlipped(new Chess(latestPuzzle.fen).turn() === 'b');
    } catch {
      setPreviewFlipped(false);
    }
  }, [latestPuzzle.id, latestPuzzle.fen]);

  const previewChess = useMemo(() => {
    const c = new Chess(latestPuzzle.fen);
    let lastMove: { from: Square; to: Square } | null = null;
    for (const san of previewMoves) {
      const m = c.move(san);
      if (m) lastMove = { from: m.from, to: m.to };
    }
    return { c, fen: c.fen(), turn: c.turn(), lastMove };
  }, [latestPuzzle.fen, previewMoves]);

  const solverColor = useMemo(() => {
    try {
      return new Chess(latestPuzzle.fen).turn();
    } catch {
      return 'w' as const;
    }
  }, [latestPuzzle.fen]);

  const handlePreviewMove = ({
    from,
    to,
    promotion,
  }: {
    from: Square;
    to: Square;
    promotion?: PieceSymbol;
  }): boolean => {
    if (previewStatus === 'solved') return false;
    const stepIdx = previewMoves.length;
    if (stepIdx % 2 === 1) return false;
    const clone = new Chess(previewChess.fen);
    let moved;
    try {
      moved = clone.move({ from, to, promotion });
      if (!moved) return false;
    } catch {
      return false;
    }
    const playedUci = `${from}${to}${promotion ?? ''}`;
    const expectedUci = latestPuzzle.solution[stepIdx];
    if (playedUci === expectedUci || clone.isCheckmate()) {
      const next = [...previewMoves, moved.san];
      if (!clone.isCheckmate() && stepIdx + 1 < latestPuzzle.solution.length) {
        const opp = latestPuzzle.solution[stepIdx + 1];
        const oppMove = clone.move({
          from: opp.slice(0, 2) as Square,
          to: opp.slice(2, 4) as Square,
          promotion: opp[4] as PieceSymbol | undefined,
        });
        if (oppMove) next.push(oppMove.san);
      }
      setPreviewMoves(next);
      setPreviewStatus(
        clone.isCheckmate() || next.length >= latestPuzzle.solution.length ? 'solved' : 'ready'
      );
      return true;
    } else {
      setPreviewStatus('wrong');
      return false;
    }
  };

  // Mini 8x8 static thumbnail for the Daily Academy Puzzle quick-start card
  const miniBoardGrid = useMemo(() => {
    try {
      return new Chess(latestPuzzle.fen).board();
    } catch {
      return new Chess().board();
    }
  }, [latestPuzzle.fen]);

  return (
    <div className="max-w-[1160px] mx-auto px-3 sm:px-6 py-4 md:py-7 pb-20 md:pb-8 space-y-6">
      {/* ================================================================= */}
      {/* TOP HEADER + STATS STRIP                                          */}
      {/* ================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-50">
            Welcome back, {user.full_name}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-zinc-400">
            Ready for today&apos;s session ·{' '}
            <span className="font-mono-tabular text-zinc-300">{user.login_id}</span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 sm:gap-8 pt-1 lg:pt-0">
          <div>
            <div className="text-[11px] font-medium text-zinc-400">Academy Rating</div>
            <div className="text-xl sm:text-2xl font-bold font-mono-tabular text-emerald-400">
              {stats.rating}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-zinc-400">Solved Today</div>
            <div className="text-xl sm:text-2xl font-bold font-mono-tabular text-zinc-50">
              {stats.solvedToday}{' '}
              <span className="text-xs font-normal text-zinc-500">
                / {stats.totalSolved} total
              </span>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-zinc-400">Streak</div>
            <div className="text-xl sm:text-2xl font-bold font-mono-tabular text-amber-400">
              {stats.streakDays} {stats.streakDays === 1 ? 'day' : 'days'}
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* MAIN 2-COLUMN WORKSPACE: BOARD PREVIEW (LEFT) + QUICK-START (RIGHT) */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-6 items-start">
        {/* Left/Center Area: Interactive Chessboard Preview */}
        <section className="rounded-2xl bg-[#18181B] border border-white/[0.08] p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-emerald-400">
                {latestPuzzle.isCustom ? 'Daily Academy Puzzle' : 'Featured Tactical Drill'}
              </div>
              <h2 className="text-base sm:text-lg font-semibold text-zinc-50 truncate">
                {latestPuzzle.title}
              </h2>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setPreviewFlipped((f) => !f)}
                aria-label="Flip preview board"
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition-colors cursor-pointer"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewMoves([]);
                  setPreviewStatus('ready');
                }}
                aria-label="Reset preview board"
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="w-full max-w-[460px] mx-auto">
            <Chessboard
              fen={previewChess.fen}
              flipped={previewFlipped}
              interactive={previewStatus !== 'solved'}
              allowedColor={solverColor}
              boardTheme={boardTheme}
              pieceStyle={pieceStyle}
              showLegalMoves
              showCoordinates={showCoordinates}
              lastMove={previewChess.lastMove}
              onMove={handlePreviewMove}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-xs text-zinc-400">
              {previewStatus === 'solved' ? (
                <span className="text-emerald-400 font-medium">
                  Solved! Clean tactical find.
                </span>
              ) : previewStatus === 'wrong' ? (
                <span className="text-amber-300 font-medium">
                  Not the best move — try another continuation.
                </span>
              ) : (
                <span>
                  {solverColor === 'w' ? 'White' : 'Black'} to move · {latestPuzzle.difficulty}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenDailyPuzzle}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Open in Puzzles</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        {/* Right Action Panel: Chess.com-Style Quick-Start Cards */}
        <div className="space-y-4">
          {/* Card 1: Play a Match */}
          <div className="rounded-2xl bg-[#18181B] border border-white/[0.08] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-zinc-50">Play a Match</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Start a timed practice game or play side-by-side with a classmate
                </p>
              </div>
              <Zap className="w-5 h-5 text-emerald-400 shrink-0" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onStartMatch('club', 'rapid10')}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>10 min Rapid</span>
              </motion.button>

              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onStartMatch('club', 'blitz5')}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-white/[0.08] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>5 min Blitz</span>
              </motion.button>

              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onStartMatch('local', 'untimed')}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-white/[0.08] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Play a Classmate</span>
              </motion.button>
            </div>
          </div>

          {/* Card 2: Play Coach Bots */}
          <div className="rounded-2xl bg-[#18181B] border border-white/[0.08] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-zinc-50">Play Coach Bots</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Challenge tiered AI personalities from Beginner to Coach Master
                </p>
              </div>
              <Bot className="w-5 h-5 text-indigo-400 shrink-0" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'beginner', name: 'Beginner', rating: '~800' },
                  { id: 'club', name: 'Club', rating: '~1350' },
                  { id: 'coach', name: 'Master', rating: '~1750' },
                ] as const
              ).map((bot) => (
                <motion.button
                  key={bot.id}
                  type="button"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onStartMatch(bot.id, 'rapid10')}
                  className="flex flex-col items-start p-3 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-white/[0.08] transition-colors text-left cursor-pointer"
                >
                  <span className="text-xs font-semibold text-zinc-100 whitespace-nowrap">
                    {bot.name}
                  </span>
                  <span className="text-[11px] font-mono-tabular text-zinc-400 mt-0.5">
                    {bot.rating}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Card 3: Solve Daily Academy Puzzle */}
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.99 }}
            onClick={onOpenDailyPuzzle}
            className="w-full text-left rounded-2xl bg-[#18181B] hover:bg-zinc-800/80 border border-white/[0.08] p-4 flex items-center gap-4 transition-colors cursor-pointer"
          >
            {/* Mini Board Thumbnail */}
            <div className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 grid grid-cols-8 grid-rows-8 shrink-0">
              {miniBoardGrid.flatMap((row, r) =>
                row.map((cell, c) => {
                  const isLight = (r + c) % 2 === 0;
                  return (
                    <div
                      key={`${FILES[c]}${8 - r}`}
                      className="flex items-center justify-center"
                      style={{ backgroundColor: isLight ? '#EEEED2' : '#769656' }}
                    >
                      {cell && <ChessPiece type={cell.type} color={cell.color} />}
                    </div>
                  );
                })
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <Puzzle className="w-3.5 h-3.5 shrink-0" />
                <span>Solve Daily Academy Puzzle</span>
              </div>
              <div className="text-sm font-semibold text-zinc-100 truncate mt-0.5">
                {latestPuzzle.title}
              </div>
              <div className="text-xs text-zinc-400 truncate mt-0.5">
                {latestPuzzle.difficulty} · {latestPuzzle.isCustom ? 'Coach Assigned' : 'Tactic'}
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-zinc-400 shrink-0" />
          </motion.button>

          {/* Card 4: Continue Lesson */}
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onOpenLesson(nextLessonIndex)}
            className="w-full text-left rounded-2xl bg-[#18181B] hover:bg-zinc-800/80 border border-white/[0.08] p-4 flex items-center justify-between gap-4 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/15 border border-indigo-400/25 flex items-center justify-center text-indigo-300 shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-indigo-300">Continue Lesson</div>
                <div className="text-sm font-semibold text-zinc-100 truncate mt-0.5">
                  {nextLesson.title}
                </div>
                <div className="text-xs text-zinc-400 truncate mt-0.5">
                  {nextLesson.category} · {nextLesson.level}
                </div>
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-zinc-400 shrink-0" />
          </motion.button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* BOTTOM SECTION: RECENT ACADEMY GAMES + SAFE MESSAGES PANEL        */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)] gap-6 items-start">
        <section className="rounded-2xl bg-[#18181B] border border-white/[0.08] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-50">Recent Academy Games</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Completed matches are saved automatically for instant Game Review
              </p>
            </div>
            <span className="text-xs font-mono-tabular text-zinc-400">
              {recentGames.length} {recentGames.length === 1 ? 'game' : 'games'}
            </span>
          </div>

        {recentGames.length === 0 ? (
          <div className="px-5 py-10 text-center space-y-3">
            <p className="text-xs text-zinc-400">
              No completed academy matches yet. Play a match against a Coach Bot or classmate to review your moves here.
            </p>
            <button
              type="button"
              onClick={() => onStartMatch('club', 'rapid10')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
            >
              <span>Play First Match</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.07] text-[11px] font-medium text-zinc-400">
                  <th className="py-3 px-5">Opponent</th>
                  <th className="py-3 px-4">Time Control</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4 text-right">Moves</th>
                  <th className="py-3 px-4 text-right">Date</th>
                  <th className="py-3 px-5 text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-xs">
                {recentGames.map((g) => (
                  <tr key={g.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-5 font-medium text-zinc-100 whitespace-nowrap">
                      {g.opponent_label}{' '}
                      <span className="text-zinc-500 font-normal">
                        ({g.player_color === 'w' ? 'White' : 'Black'})
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-300 font-mono-tabular whitespace-nowrap">
                      {g.time_control}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 font-medium ${
                          g.result === 'win'
                            ? 'text-emerald-400'
                            : g.result === 'loss'
                            ? 'text-red-400'
                            : 'text-zinc-300'
                        }`}
                      >
                        {g.result === 'win' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        ) : g.result === 'loss' ? (
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <MinusCircle className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>
                          {g.result === 'win' ? 'Win' : g.result === 'loss' ? 'Loss' : 'Draw'}
                        </span>
                      </span>
                      {g.result_reason && (
                        <span className="text-zinc-500 ml-1.5 hidden sm:inline">
                          · {g.result_reason}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-zinc-300">
                      {g.move_count}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-zinc-400 whitespace-nowrap">
                      {formatShortDate(g.played_at)}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onReviewGame(g)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
                      >
                        <Microscope className="w-3.5 h-3.5" />
                        <span>Game Review</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </section>

        {/* Friends DM & Match Messages Card */}
        <MessagesPanel
          token={token}
          user={user}
          adminModeActive={adminModeActive}
          classmates={classmates}
          matchRoomId={activeMatchRoomId}
          matchOpponentLabel={activeMatchOpponentLabel}
          defaultChannel={activeMatchRoomId ? 'match' : 'dm'}
          selectedDmPeerId={selectedDmPeerId}
          onSelectDmPeerId={onSelectDmPeerId}
          onOpenFriendsDrawer={onOpenFriendsDrawer}
          onOpenModerationQueue={onOpenModerationQueue}
          onTogglePeerChatDisabled={onTogglePeerChatDisabled}
          onDeleteMessage={onDeleteMessage}
        />
      </div>
    </div>
  );
};
