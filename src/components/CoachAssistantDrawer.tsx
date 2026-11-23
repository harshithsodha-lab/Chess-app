import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  MessageSquare,
  Send,
  X,
  Paperclip,
  Sparkles,
  UserCheck,
  Microscope,
} from 'lucide-react';
import { ChessPiece } from './ChessPiece';
import {
  analyzeBoardForCoach,
  answerCoachQuestion,
  type CoachBoardMode,
} from '../utils/localCoachAnalyzer';
import { sentinelAgent } from '../lib/autoHealAgent';
import type { AcademyUser, CoachMessageRecord } from '../types/academy';

interface AiChatEntry {
  id: string;
  sender: 'student' | 'coach';
  text: string;
}

interface CoachAssistantDrawerProps {
  token: string;
  user: AcademyUser;
  mode: CoachBoardMode;
  currentFen: string;
  moves: string[];
  contextLabel: string;
  puzzleHint?: string;
  onLoadPositionToAnalyze?: (fen: string) => void;
}

type DrawerMode = 'ai' | 'human';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export const MiniFenBoard: React.FC<{ fen: string; size?: number }> = ({ fen, size = 72 }) => {
  const grid = useMemo(() => {
    try {
      return new Chess(fen).board();
    } catch {
      return null;
    }
  }, [fen]);

  if (!grid) return null;

  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-md overflow-hidden border border-white/15 grid grid-cols-8 grid-rows-8 shrink-0"
    >
      {grid.flatMap((row, r) =>
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
  );
};

export const CoachAssistantDrawer: React.FC<CoachAssistantDrawerProps> = ({
  token,
  user,
  mode,
  currentFen,
  moves,
  contextLabel,
  puzzleHint,
  onLoadPositionToAnalyze,
}) => {
  const [open, setOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('ai');

  // AI Coach State
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState<AiChatEntry[]>([
    {
      id: 'welcome-ai',
      sender: 'coach',
      text: 'Ask me about threats, hanging pieces, opening ideas, or a tactical hint for your current board.',
    },
  ]);

  // Human Academy Coach State
  const [humanMessages, setHumanMessages] = useState<CoachMessageRecord[]>([]);
  const [humanInput, setHumanInput] = useState('');
  const [attachBoard, setAttachBoard] = useState(false);
  const [loadingHuman, setLoadingHuman] = useState(false);
  const [sendingHuman, setSendingHuman] = useState(false);
  const [humanError, setHumanError] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const liveReport = useMemo(
    () =>
      analyzeBoardForCoach({
        fen: currentFen,
        moves,
        mode,
        puzzleHint,
      }),
    [currentFen, moves, mode, puzzleHint]
  );

  const fetchHumanMessages = useCallback(async () => {
    if (!token) return;
    try {
      const res = await sentinelAgent.resilientFetch(
        '/api/coach/messages',
        {
          headers: { Authorization: `Bearer ${token}` },
        },
        'Coach Messages Sync',
        1
      );
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: CoachMessageRecord[] };
      if (data.messages) {
        setHumanMessages(data.messages);
      }
    } catch {
      // Errors handled gracefully by sentinelAgent
    } finally {
      setLoadingHuman(false);
    }
  }, [token]);

  useEffect(() => {
    if (!open || drawerMode !== 'human') return;
    setLoadingHuman(true);
    fetchHumanMessages();
    const timer = window.setInterval(fetchHumanMessages, 4000);
    return () => window.clearInterval(timer);
  }, [open, drawerMode, fetchHumanMessages]);

  useEffect(() => {
    if (open) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, drawerMode, aiMessages.length, humanMessages.length]);

  const askAiQuestion = (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed) return;
    const reply = answerCoachQuestion({
      question: trimmed,
      fen: currentFen,
      moves,
      mode,
      puzzleHint,
    });
    const nowId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setAiMessages((prev) => [
      ...prev.slice(-24),
      { id: `s-${nowId}`, sender: 'student', text: trimmed },
      { id: `c-${nowId}`, sender: 'coach', text: reply },
    ]);
    setAiInput('');
  };

  const handleSendHumanMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = humanInput.trim();
    if (!text) return;
    if (user.role === 'admin') {
      setHumanError('Coach replies to specific students are managed in Admin Panel → Coach Inbox.');
      return;
    }

    setSendingHuman(true);
    setHumanError(null);
    try {
      const res = await sentinelAgent.resilientFetch(
        '/api/coach/messages',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messageText: text,
            attachedFen: attachBoard ? currentFen : null,
            attachedContext: attachBoard ? contextLabel : '',
          }),
        },
        'Send Coach Message'
      );
      const data = (await res.json().catch(() => ({}))) as {
        message?: CoachMessageRecord;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Unable to send message.');
      }
      if (data.message) {
        setHumanMessages((prev) => [...prev, data.message!]);
      }
      setHumanInput('');
      setAttachBoard(false);
    } catch (err) {
      setHumanError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSendingHuman(false);
    }
  };

  return (
    <>
      {/* Floating Dock Toggle Button */}
      {!open && (
        <motion.button
          type="button"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setOpen(true)}
          className="fixed bottom-16 right-3 md:bottom-6 md:right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#18181B] hover:bg-zinc-800 text-zinc-100 border border-white/15 shadow-2xl text-xs font-semibold cursor-pointer touch-manipulation"
        >
          <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="whitespace-nowrap">Coach Assistant</span>
        </motion.button>
      )}

      {/* Expandable Coach Assistant Drawer */}
      <AnimatePresence>
        {open && (
          <motion.section
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            aria-label="Coach Assistant"
            className="fixed bottom-16 right-3 left-3 sm:left-auto sm:right-6 md:bottom-6 z-50 sm:w-[400px] h-[70dvh] max-h-[540px] flex flex-col rounded-2xl bg-[#18181B] border border-white/15 shadow-2xl overflow-hidden"
          >
            {/* Header + Dual Mode Switcher */}
            <div className="p-3.5 border-b border-white/[0.08] bg-[#141417] space-y-2.5 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-zinc-100 truncate">
                    Coach Assistant
                  </span>
                  <span className="text-[11px] text-zinc-500">·</span>
                  <span className="text-[11px] text-zinc-400 truncate">{contextLabel}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close Coach Assistant"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Segmented Dual Mode Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-900 border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setDrawerMode('ai')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    drawerMode === 'ai'
                      ? 'bg-emerald-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5 shrink-0" />
                  <span>Ask AI Coach</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerMode('human')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    drawerMode === 'human'
                      ? 'bg-emerald-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Message Academy Coach</span>
                </button>
              </div>
            </div>

            {drawerMode === 'ai' ? (
              <>
                {/* Live Position Snapshot */}
                <div className="px-3.5 py-2.5 border-b border-white/[0.06] bg-zinc-900/60 shrink-0 space-y-2">
                  <div className="text-[11px] font-medium text-zinc-300 leading-snug">
                    {liveReport.summaryText}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: 'What are the threats?', query: 'What are the current threats?' },
                      { label: 'Hanging pieces?', query: 'Are there any hanging pieces?' },
                      { label: 'Opening & plan', query: 'What opening is this and what is the plan?' },
                      {
                        label: mode === 'puzzles' ? 'Subtle hint' : 'Best idea',
                        query: mode === 'puzzles' ? 'Give me a subtle hint without spoiling' : 'What is the best move or idea here?',
                      },
                    ].map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => askAiQuestion(chip.query)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition-colors cursor-pointer"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI Chat Feed */}
                <div className="flex-1 overflow-y-auto chess-scroll p-3.5 space-y-2.5">
                  {aiMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender === 'student' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                          msg.sender === 'student'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-zinc-900 border border-white/[0.08] text-zinc-200'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  <div ref={scrollEndRef} />
                </div>

                {/* AI Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    askAiQuestion(aiInput);
                  }}
                  className="p-3 border-t border-white/[0.08] bg-[#141417] flex items-center gap-2 shrink-0"
                >
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Ask AI Coach about this board…"
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl text-xs bg-zinc-900 text-zinc-100 border border-white/10 focus:outline-none focus:border-emerald-400"
                  />
                  <button
                    type="submit"
                    disabled={!aiInput.trim()}
                    aria-label="Send question to AI Coach"
                    className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors shrink-0 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            ) : (
              <>
                {/* Human Academy Coach Thread */}
                <div className="flex-1 overflow-y-auto chess-scroll p-3.5 space-y-3">
                  {user.role === 'admin' ? (
                    <div className="rounded-xl bg-zinc-900 border border-white/10 p-3.5 text-xs text-zinc-300 leading-relaxed">
                      You are signed in as Admin/Coach. Open <span className="font-semibold text-emerald-400">Admin Panel → Coach Inbox</span> to view and reply to individual student threads.
                    </div>
                  ) : loadingHuman && humanMessages.length === 0 ? (
                    <div className="text-center py-8 text-xs text-zinc-400">
                      Loading coach messages…
                    </div>
                  ) : humanMessages.length === 0 ? (
                    <div className="rounded-xl bg-zinc-900/70 border border-white/[0.08] p-4 text-center space-y-1.5">
                      <p className="text-xs font-medium text-zinc-200">
                        Direct Line to Your Academy Coach
                      </p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Send a question or click &ldquo;Attach Current Board&rdquo; below to share this exact position with your coach.
                      </p>
                    </div>
                  ) : (
                    humanMessages.map((msg) => {
                      const isSelf = msg.sender_role === 'student';
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} space-y-1`}
                        >
                          <div className="text-[10px] text-zinc-500 px-1">
                            {isSelf ? 'You' : `${msg.sender_name} (Coach)`} ·{' '}
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          <div
                            className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed space-y-2 ${
                              isSelf
                                ? 'bg-emerald-600 text-white'
                                : 'bg-zinc-900 border border-white/10 text-zinc-100'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.message_text}</p>
                            {msg.attached_fen && (
                              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-black/25 border border-white/10">
                                <MiniFenBoard fen={msg.attached_fen} size={56} />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="text-[10px] font-medium text-zinc-200 truncate">
                                    {msg.attached_context || 'Shared Board'}
                                  </div>
                                  {onLoadPositionToAnalyze && (
                                    <button
                                      type="button"
                                      onClick={() => onLoadPositionToAnalyze(msg.attached_fen!)}
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 hover:underline cursor-pointer"
                                    >
                                      <Microscope className="w-3 h-3" />
                                      <span>Open in Analyze</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={scrollEndRef} />
                </div>

                {/* Human Coach Input + 1-Click Attach Current Board */}
                {user.role === 'student' && (
                  <form
                    onSubmit={handleSendHumanMessage}
                    className="p-3 border-t border-white/[0.08] bg-[#141417] space-y-2 shrink-0"
                  >
                    {humanError && (
                      <div className="text-[11px] text-red-400">{humanError}</div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setAttachBoard((v) => !v)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                          attachBoard
                            ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                            : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        <Paperclip className="w-3 h-3 shrink-0" />
                        <span>{attachBoard ? 'Board Attached' : 'Attach Current Board'}</span>
                      </button>
                      {attachBoard && (
                        <span className="text-[10px] font-mono-tabular text-zinc-400 truncate">
                          {contextLabel}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={humanInput}
                        onChange={(e) => setHumanInput(e.target.value)}
                        placeholder="Message your Academy Coach…"
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl text-xs bg-zinc-900 text-zinc-100 border border-white/10 focus:outline-none focus:border-emerald-400"
                      />
                      <button
                        type="submit"
                        disabled={sendingHuman || !humanInput.trim()}
                        aria-label="Send message to Academy Coach"
                        className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors shrink-0 cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
};
