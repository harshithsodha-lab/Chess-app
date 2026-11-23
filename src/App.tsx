import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Check,
  Lightbulb,
  Trophy,
  RotateCcw,
  Microscope,
  X,
  ArrowUpDown,
  Undo2,
  Flag,
  List,
  Pencil,
  Eraser,
  Sparkles,
  BookOpen,
  Grid2x2,
  BarChart3,
  Swords,
} from 'lucide-react';
import {
  Chessboard,
  type AnnotationColor,
  type BoardArrow,
  type CustomBoardGrid,
  type HintHighlight,
  type LastMoveHighlight,
  type SquareHighlight,
} from './components/Chessboard';
import { SidePanel } from './components/SidePanel';
import { EvalBar } from './components/EvalBar';
import { SettingsModal } from './components/SettingsModal';
import { PositionEditor, type EditorTool } from './components/PositionEditor';
import { AcademyAuthGate } from './components/AcademyAuthGate';
import { AdminPanel, type AdminSubTab } from './components/AdminPanel';
import { SidebarNav, type NavTab } from './components/SidebarNav';
import { CoachAssistantDrawer } from './components/CoachAssistantDrawer';
import { FriendsDrawer } from './components/FriendsDrawer';
import { MessagesPanel } from './components/MessagesPanel';
import { sentinelAgent } from './lib/autoHealAgent';
import {
  HomeDashboard,
  type QuickPlayOpponent,
  type QuickPlayTimeControl,
} from './components/HomeDashboard';
import { CHESS_PUZZLES } from './data/puzzles';
import { CHESS_LESSONS } from './data/lessons';
import {
  buildAnnotatedPgn,
  evaluatePosition,
  findBestMove,
  formatEvalLabel,
  getCapturedPieces,
  pickBotMove,
  type BotDifficulty,
} from './utils/chessEngine';
import { soundEngine } from './utils/sound';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type ChessSettings,
} from './types/settings';
import type {
  AcademyGameRecord,
  AcademyGameResult,
  AcademyUser,
  AuthStatusPayload,
  ClassmateDirectoryEntry,
  CustomPuzzleRecord,
  MatchChallengeRecord,
  StudentProgressRecord,
} from './types/academy';

type LearnSubMode = 'lessons' | 'editor';
type OpponentMode = 'beginner' | 'club' | 'coach' | 'local' | 'friend';
type PuzzleSource = 'academy' | 'classics';
type TimeControlMode = QuickPlayTimeControl;

const TIME_CONTROL_SECONDS: Record<TimeControlMode, number> = {
  rapid10: 600,
  blitz5: 300,
  untimed: 0,
};

const TIME_CONTROL_LABELS: Record<TimeControlMode, string> = {
  rapid10: '10 min Rapid',
  blitz5: '5 min Blitz',
  untimed: 'Untimed',
};

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface ActivePuzzleItem {
  id: string;
  isCustom: boolean;
  title: string;
  fen: string;
  solution: string[];
  subtitle: string;
  meta: string;
  hint: string;
}

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

function createEmptyGrid(): CustomBoardGrid {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
}

function fenToGrid(fen: string): CustomBoardGrid {
  const placement = fen.split(' ')[0];
  const rows = placement.split('/');
  const grid = createEmptyGrid();
  for (let r = 0; r < 8; r++) {
    const rowStr = rows[r] ?? '';
    let c = 0;
    for (const ch of rowStr) {
      if (ch >= '1' && ch <= '8') {
        c += Number(ch);
      } else {
        const color: Color = ch === ch.toUpperCase() ? 'w' : 'b';
        const type = ch.toLowerCase() as PieceSymbol;
        if (c < 8) {
          grid[r][c] = { color, type };
        }
        c++;
      }
    }
  }
  return grid;
}

function gridToFen(
  grid: CustomBoardGrid,
  turn: Color,
  castling: { K: boolean; Q: boolean; k: boolean; q: boolean }
): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let rowStr = '';
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const cell = grid[r][c];
      if (!cell) {
        empty++;
      } else {
        if (empty > 0) {
          rowStr += String(empty);
          empty = 0;
        }
        rowStr += cell.color === 'w' ? cell.type.toUpperCase() : cell.type.toLowerCase();
      }
    }
    if (empty > 0) rowStr += String(empty);
    rows.push(rowStr);
  }
  const castlingStr =
    (['K', 'Q', 'k', 'q'] as const).filter((f) => castling[f]).join('') || '-';
  return `${rows.join('/')} ${turn} ${castlingStr} - 0 1`;
}

function squareToIndices(sq: Square): { r: number; c: number } {
  return {
    c: FILES.indexOf(sq[0] as (typeof FILES)[number]),
    r: RANKS.indexOf(sq[1] as (typeof RANKS)[number]),
  };
}

function downloadPgnFile(pgnText: string, filename = 'pure-chess-annotated.pgn') {
  const blob = new Blob([pgnText], { type: 'application/x-chess-pgn;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function playMoveSound(move: Move, resultingGame: Chess) {
  if (resultingGame.isGameOver()) {
    soundEngine.play('end');
  } else if (resultingGame.inCheck()) {
    soundEngine.play('check');
  } else if (move.isKingsideCastle() || move.isQueensideCastle()) {
    soundEngine.play('castle');
  } else if (move.isCapture()) {
    soundEngine.play('capture');
  } else {
    soundEngine.play('move');
  }
}

function getGameStatus(
  chess: Chess,
  resignedBy: Color | null,
  timeoutWinner: Color | null = null
): {
  isOver: boolean;
  headline: string;
  subtext: string;
  winner: 'White' | 'Black' | 'Draw' | null;
} {
  if (timeoutWinner) {
    const winner = timeoutWinner === 'w' ? 'White' : 'Black';
    const loser = timeoutWinner === 'w' ? 'Black' : 'White';
    return {
      isOver: true,
      headline: `${winner} wins on time`,
      subtext: `${loser} ran out of time.`,
      winner,
    };
  }

  if (resignedBy) {
    const winner = resignedBy === 'w' ? 'Black' : 'White';
    const loser = resignedBy === 'w' ? 'White' : 'Black';
    return {
      isOver: true,
      headline: `${winner} wins by resignation`,
      subtext: `${loser} resigned the game.`,
      winner,
    };
  }

  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'Black' : 'White';
    return {
      isOver: true,
      headline: `Checkmate · ${winner} wins`,
      subtext: `${chess.turn() === 'w' ? 'White' : 'Black'} king has no legal escape.`,
      winner,
    };
  }

  if (chess.isStalemate()) {
    return {
      isOver: true,
      headline: 'Draw by stalemate',
      subtext: 'Side to move has no legal moves and is not in check.',
      winner: 'Draw',
    };
  }

  if (chess.isThreefoldRepetition()) {
    return {
      isOver: true,
      headline: 'Draw by repetition',
      subtext: 'Position occurred three times.',
      winner: 'Draw',
    };
  }

  if (chess.isInsufficientMaterial()) {
    return {
      isOver: true,
      headline: 'Draw · Insufficient material',
      subtext: 'Neither side can force checkmate.',
      winner: 'Draw',
    };
  }

  if (chess.isDraw()) {
    return {
      isOver: true,
      headline: 'Draw · Fifty-move rule',
      subtext: 'Fifty consecutive moves without capture or pawn advance.',
      winner: 'Draw',
    };
  }

  const side = chess.turn() === 'w' ? 'White' : 'Black';
  if (chess.inCheck()) {
    return {
      isOver: false,
      headline: `${side} to move · In check`,
      subtext: 'King is under attack.',
      winner: null,
    };
  }

  return {
    isOver: false,
    headline: `${side} to move`,
    subtext: '',
    winner: null,
  };
}

export default function App() {
  // =========================================================================
  // ACADEMY AUTH & STRICT GATEKEEPER STATE (In-Memory Token Only)
  // =========================================================================
  const [authStatus, setAuthStatus] = useState<AuthStatusPayload | null>(null);
  const [authLoadError, setAuthLoadError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AcademyUser | null>(null);
  const [adminModeActive, setAdminModeActive] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const [academyPuzzles, setAcademyPuzzles] = useState<CustomPuzzleRecord[]>([]);
  const [studentProgress, setStudentProgress] = useState<StudentProgressRecord[]>([]);
  const [recentGames, setRecentGames] = useState<AcademyGameRecord[]>([]);

  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [requestedAdminSubTab, setRequestedAdminSubTab] = useState<AdminSubTab | null>(null);
  const [settings, setSettings] = useState<ChessSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [friendsDrawerOpen, setFriendsDrawerOpen] = useState(false);
  const [classmates, setClassmates] = useState<ClassmateDirectoryEntry[]>([]);
  const [challenges, setChallenges] = useState<MatchChallengeRecord[]>([]);
  const [activeChallenge, setActiveChallenge] = useState<MatchChallengeRecord | null>(null);
  const [selectedDmPeerId, setSelectedDmPeerId] = useState<string | null>(null);
  const [openMessagesNonce, setOpenMessagesNonce] = useState(0);
  const joinedChallengeIdsRef = useRef<Set<string>>(new Set());

  // Shared Coaching Annotation State
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [highlights, setHighlights] = useState<SquareHighlight[]>([]);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationColor, setAnnotationColor] = useState<AnnotationColor>('green');
  const [bestMoveLabel, setBestMoveLabel] = useState<string | null>(null);
  const [showPlayEval, setShowPlayEval] = useState(false);

  useEffect(() => {
    sentinelAgent.installGlobalListeners();
  }, []);

  const fetchAuthStatus = useCallback(async () => {
    setAuthLoadError(null);
    try {
      const res = await sentinelAgent.resilientFetch(
        '/api/auth/status',
        undefined,
        'Auth Status Check'
      );
      if (!res.ok) throw new Error('Unable to reach academy auth server.');
      const data = (await res.json()) as AuthStatusPayload;
      setAuthStatus(data);
    } catch (err) {
      setAuthLoadError(
        err instanceof Error ? err.message : 'Unable to connect to the academy server.'
      );
    }
  }, []);

  useEffect(() => {
    fetchAuthStatus();
  }, [fetchAuthStatus]);

  const fetchAcademyPuzzles = useCallback(async () => {
    if (!authToken || !authUser) return;
    try {
      const res = await sentinelAgent.resilientFetch(
        '/api/puzzles',
        {
          headers: { Authorization: `Bearer ${authToken}` },
        },
        'Academy Puzzles Sync'
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        puzzles: CustomPuzzleRecord[];
        progress: StudentProgressRecord[];
      };
      setAcademyPuzzles(data.puzzles ?? []);
      setStudentProgress(data.progress ?? []);
    } catch {
      // Logged by sentinelAgent
    }
  }, [authToken, authUser]);

  const fetchRecentGames = useCallback(async () => {
    if (!authToken || !authUser) return;
    try {
      const res = await sentinelAgent.resilientFetch(
        '/api/games',
        {
          headers: { Authorization: `Bearer ${authToken}` },
        },
        'Recent Games Sync'
      );
      if (!res.ok) return;
      const data = (await res.json()) as { games: AcademyGameRecord[] };
      setRecentGames(data.games ?? []);
    } catch {
      // Logged by sentinelAgent
    }
  }, [authToken, authUser]);

  useEffect(() => {
    if (authToken && authUser) {
      fetchAcademyPuzzles();
      fetchRecentGames();
    }
  }, [authToken, authUser, fetchAcademyPuzzles, fetchRecentGames]);

  // Poll active student session every 3s so Coach/Admin Revoke Access logs them out immediately
  useEffect(() => {
    if (!authToken || !authUser || authUser.role !== 'student') return;
    let cancelled = false;

    const verifySession = async () => {
      try {
        const res = await fetch('/api/auth/session-status', {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          setAuthToken(null);
          setAuthUser(null);
          setActiveTab('home');
          setAuthNotice('Your session has ended. Sign in again to request Coach approval.');
          return;
        }
        const data = (await res.json()) as { approved: boolean; user?: AcademyUser };
        if (!cancelled && !data.approved) {
          setAuthToken(null);
          setAuthUser(null);
          setActiveTab('home');
          setAuthNotice('Your access was revoked by the Coach/Admin.');
          return;
        }
        if (!cancelled && data.user) {
          setAuthUser((prev) =>
            prev
              ? { ...prev, chat_disabled: Boolean(data.user!.chat_disabled) }
              : prev
          );
        }
      } catch {
        // Ignore transient poll errors
      }
    };

    const interval = window.setInterval(verifySession, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [authToken, authUser]);

  // Clean tab-close / navigation presence reset
  useEffect(() => {
    const activeStudentToken =
      authToken && authUser?.role === 'student' ? authToken : null;

    if (!activeStudentToken) return;

    const sendExitBeacon = () => {
      try {
        navigator.sendBeacon(
          '/api/auth/logout-beacon',
          JSON.stringify({ token: activeStudentToken })
        );
      } catch {
        // Ignore unload beacon errors
      }
    };

    window.addEventListener('pagehide', sendExitBeacon);
    window.addEventListener('beforeunload', sendExitBeacon);
    return () => {
      window.removeEventListener('pagehide', sendExitBeacon);
      window.removeEventListener('beforeunload', sendExitBeacon);
    };
  }, [authToken, authUser]);

  const handleAuthenticated = useCallback(
    (token: string, user: AcademyUser) => {
      setAuthToken(token);
      setAuthUser(user);
      setAdminModeActive(false);
      setAuthNotice(null);
      fetchAuthStatus();
    },
    [fetchAuthStatus]
  );

  const handleToggleAdminMode = useCallback(
    (nextActive: boolean) => {
      if (authUser?.role !== 'admin') return;
      setAdminModeActive(nextActive);
      if (!nextActive && activeTab === 'admin') {
        setActiveTab('home');
      }
    },
    [authUser?.role, activeTab]
  );

  const handleLogout = useCallback(async () => {
    if (authToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
        });
      } catch {
        // Ignore
      }
    }
    setAuthToken(null);
    setAuthUser(null);
    setAdminModeActive(false);
    setAcademyPuzzles([]);
    setStudentProgress([]);
    setRecentGames([]);
    setClassmates([]);
    setChallenges([]);
    setActiveChallenge(null);
    setSelectedDmPeerId(null);
    setFriendsDrawerOpen(false);
    joinedChallengeIdsRef.current.clear();
    setActiveTab('home');
    setMobileDrawerOpen(false);
    setAuthNotice('Signed out cleanly.');
    fetchAuthStatus();
  }, [authToken, fetchAuthStatus]);

  useEffect(() => {
    soundEngine.setEnabled(settings.soundEnabled);
  }, [settings.soundEnabled]);

  const updateSettings = useCallback((partial: Partial<ChessSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
  }, []);

  const clearAnnotations = useCallback(() => {
    setArrows([]);
    setHighlights([]);
    setBestMoveLabel(null);
  }, []);

  const handleToggleArrow = useCallback(
    (from: Square, to: Square, color: AnnotationColor) => {
      setArrows((prev) => {
        const exists = prev.some(
          (a) => a.from === from && a.to === to && a.color === color
        );
        if (exists) {
          return prev.filter(
            (a) => !(a.from === from && a.to === to && a.color === color)
          );
        }
        return [
          ...prev.filter((a) => !(a.from === from && a.to === to)),
          { from, to, color },
        ];
      });
    },
    []
  );

  const handleToggleHighlight = useCallback(
    (square: Square, color: AnnotationColor) => {
      setHighlights((prev) => {
        const existing = prev.find((h) => h.square === square);
        if (existing && existing.color === color) {
          return prev.filter((h) => h.square !== square);
        }
        return [...prev.filter((h) => h.square !== square), { square, color }];
      });
    },
    []
  );

  // =========================================================================
  // PLAY MODE STATE
  // =========================================================================
  const [playInitialFen, setPlayInitialFen] = useState<string>(STANDARD_FEN);
  const [playPgnHistory, setPlayPgnHistory] = useState<string[]>([]);
  const [playMoveNotes, setPlayMoveNotes] = useState<Record<number, string>>({});
  const [playOpponent, setPlayOpponent] = useState<OpponentMode>('club');
  const [playTimeControl, setPlayTimeControl] = useState<TimeControlMode>('rapid10');
  const [playClocks, setPlayClocks] = useState<{ w: number; b: number }>({ w: 600, b: 600 });
  const [playTimeoutWinner, setPlayTimeoutWinner] = useState<Color | null>(null);
  const [playerColor, setPlayerColor] = useState<Color>('w');
  const [playFlipped, setPlayFlipped] = useState(false);
  const [playResignedBy, setPlayResignedBy] = useState<Color | null>(null);
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [gameOverModalDismissed, setGameOverModalDismissed] = useState(false);
  const [clockWatchdogNonce, setClockWatchdogNonce] = useState(0);
  const lastClockTickAtRef = useRef<number>(Date.now());
  const recordedGameKeyRef = useRef<string | null>(null);

  const playState = useMemo(() => {
    let chess: Chess;
    try {
      chess = new Chess(playInitialFen);
    } catch {
      chess = new Chess(STANDARD_FEN);
    }
    let lastMove: LastMoveHighlight | null = null;
    for (const san of playPgnHistory) {
      try {
        const m = chess.move(san);
        if (m) lastMove = { from: m.from, to: m.to };
        else break;
      } catch {
        break;
      }
    }
    const evalCp = evaluatePosition(chess);
    return {
      chess,
      fen: chess.fen(),
      turn: chess.turn(),
      lastMove,
      captured: getCapturedPieces(chess),
      status: getGameStatus(chess, playResignedBy, playTimeoutWinner),
      evalCp,
      evalLabel: formatEvalLabel(evalCp, chess),
    };
  }, [playInitialFen, playPgnHistory, playResignedBy, playTimeoutWinner]);

  // Sentinel Board & Move Integrity Monitor for Play Mode
  useEffect(() => {
    const check = sentinelAgent.validateAndRecoverSequence(
      playInitialFen,
      playPgnHistory,
      'Play Board'
    );
    if (check.recovered) {
      if (check.safeInitialFen !== playInitialFen) setPlayInitialFen(check.safeInitialFen);
      if (check.safeMoves.length !== playPgnHistory.length) setPlayPgnHistory(check.safeMoves);
    }
  }, [playInitialFen, playPgnHistory]);

  const startNewPlayGame = useCallback(
    (
      nextColor?: Color,
      nextOpponent?: OpponentMode,
      customFen?: string,
      nextTimeControl?: TimeControlMode
    ) => {
      const col = nextColor ?? playerColor;
      const opp = nextOpponent ?? playOpponent;
      const tc = nextTimeControl ?? playTimeControl;
      const secs = TIME_CONTROL_SECONDS[tc];
      setPlayInitialFen(customFen ?? STANDARD_FEN);
      setPlayPgnHistory([]);
      setPlayMoveNotes({});
      setPlayResignedBy(null);
      setPlayTimeoutWinner(null);
      setPlayClocks({ w: secs, b: secs });
      lastClockTickAtRef.current = Date.now();
      setIsBotThinking(false);
      setGameOverModalDismissed(false);
      recordedGameKeyRef.current = null;
      clearAnnotations();
      if (opp !== 'friend') {
        setActiveChallenge(null);
      }
      if (opp !== 'local') {
        setPlayFlipped(col === 'b');
      }
    },
    [playerColor, playOpponent, playTimeControl, clearAnnotations]
  );

  const launchChallengeGame = useCallback(
    (ch: MatchChallengeRecord) => {
      if (!authUser) return;
      joinedChallengeIdsRef.current.add(ch.id);
      const myColor: Color = ch.challenger_id === authUser.id ? 'w' : 'b';
      const tc = ch.time_control;
      const secs = TIME_CONTROL_SECONDS[tc];
      const existingMoves = ch.moves_san
        .split(/\s+/)
        .map((m) => m.trim())
        .filter(Boolean);

      setActiveChallenge(ch);
      setPlayOpponent('friend');
      setPlayerColor(myColor);
      setPlayTimeControl(tc);
      setPlayInitialFen(STANDARD_FEN);
      setPlayPgnHistory(existingMoves);
      setPlayMoveNotes({});
      setPlayResignedBy(ch.resigned_by);
      setPlayTimeoutWinner(null);
      setPlayClocks({ w: secs, b: secs });
      lastClockTickAtRef.current = Date.now();
      setIsBotThinking(false);
      setShowPlayEval(false);
      setGameOverModalDismissed(false);
      recordedGameKeyRef.current = null;
      setPlayFlipped(myColor === 'b');
      clearAnnotations();
      setFriendsDrawerOpen(false);
      setActiveTab('play');
    },
    [authUser, clearAnnotations]
  );

  // Presence Heartbeat (Online / In-Game)
  useEffect(() => {
    if (!authToken || !authUser) return;
    const isPlayingLive = activeTab === 'play' && !playState.status.isOver;
    const status = isPlayingLive ? 'in_game' : 'online';

    const sendPresence = async () => {
      try {
        const res = await fetch('/api/presence', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status }),
        });
        if (res.ok) {
          const data = (await res.json()) as { chat_disabled?: boolean };
          if (typeof data.chat_disabled === 'boolean') {
            setAuthUser((prev) =>
              prev && prev.chat_disabled !== data.chat_disabled
                ? { ...prev, chat_disabled: data.chat_disabled }
                : prev
            );
          }
        }
      } catch {
        // Ignore transient presence errors
      }
    };

    sendPresence();
    const interval = window.setInterval(sendPresence, 10000);
    return () => window.clearInterval(interval);
  }, [authToken, authUser?.id, activeTab, playState.status.isOver]);

  // Friends & Challenges Polling
  const fetchFriendsAndChallenges = useCallback(async () => {
    if (!authToken || !authUser) return;
    try {
      const res = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        classmates?: ClassmateDirectoryEntry[];
        challenges?: MatchChallengeRecord[];
      };
      if (data.classmates) setClassmates(data.classmates);
      if (data.challenges) {
        setChallenges(data.challenges);
        const acceptedNew = data.challenges.find(
          (c) =>
            c.status === 'accepted' &&
            !joinedChallengeIdsRef.current.has(c.id)
        );
        if (acceptedNew) {
          launchChallengeGame(acceptedNew);
        }
      }
    } catch {
      // Ignore transient poll errors
    }
  }, [authToken, authUser, launchChallengeGame]);

  useEffect(() => {
    if (!authToken || !authUser) return;
    fetchFriendsAndChallenges();
    const interval = window.setInterval(fetchFriendsAndChallenges, 3500);
    return () => window.clearInterval(interval);
  }, [authToken, authUser, fetchFriendsAndChallenges]);

  // Active Friend Match Synchronization Poll
  useEffect(() => {
    if (!authToken || !authUser) return;
    if (playOpponent !== 'friend' || !activeChallenge) return;
    if (activeChallenge.status === 'completed' || activeChallenge.status === 'declined') return;

    const syncMatch = async () => {
      try {
        const res = await fetch(`/api/challenges/${activeChallenge.id}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { challenge?: MatchChallengeRecord };
        const latest = data.challenge;
        if (!latest) return;
        setActiveChallenge(latest);
        const serverMoves = latest.moves_san
          .split(/\s+/)
          .map((m) => m.trim())
          .filter(Boolean);
        setPlayPgnHistory((prev) => {
          if (serverMoves.length > prev.length) {
            soundEngine.play('move');
          }
          return serverMoves.length !== prev.length ? serverMoves : prev;
        });
        if (latest.resigned_by) {
          setPlayResignedBy(latest.resigned_by);
        }
      } catch {
        // Ignore transient sync errors
      }
    };

    const interval = window.setInterval(syncMatch, 1800);
    return () => window.clearInterval(interval);
  }, [authToken, authUser, playOpponent, activeChallenge]);

  const handleSendFriendRequest = useCallback(
    async (targetUserId: string) => {
      if (!authToken) return;
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetUserId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not send friend request.');
      await fetchFriendsAndChallenges();
    },
    [authToken, fetchFriendsAndChallenges]
  );

  const handleRespondFriendRequest = useCallback(
    async (friendshipId: string, accept: boolean) => {
      if (!authToken) return;
      const res = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friendshipId, accept }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not update friend request.');
      await fetchFriendsAndChallenges();
    },
    [authToken, fetchFriendsAndChallenges]
  );

  const handleChallengeFriend = useCallback(
    async (opponentId: string, timeControl: QuickPlayTimeControl) => {
      if (!authToken) return;
      const res = await fetch('/api/challenges', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ opponentId, timeControl }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not send match challenge.');
      await fetchFriendsAndChallenges();
    },
    [authToken, fetchFriendsAndChallenges]
  );

  const handleRespondChallenge = useCallback(
    async (challengeId: string, accept: boolean) => {
      if (!authToken) return;
      const res = await fetch(`/api/challenges/${challengeId}/respond`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accept }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        challenge?: MatchChallengeRecord;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Could not respond to challenge.');
      await fetchFriendsAndChallenges();
      if (accept && data.challenge) {
        launchChallengeGame(data.challenge);
      }
    },
    [authToken, fetchFriendsAndChallenges, launchChallengeGame]
  );

  const handleOpenDirectMessage = useCallback(
    (classmateId: string) => {
      setSelectedDmPeerId(classmateId);
      setOpenMessagesNonce((n) => n + 1);
      if (activeTab !== 'play' && activeTab !== 'home') {
        setActiveTab('home');
      }
    },
    [activeTab]
  );

  const handleAdminToggleStudentChat = useCallback(
    async (studentId: string, currentlyDisabled: boolean) => {
      if (!authToken || authUser?.role !== 'admin' || !adminModeActive) return;
      const res = await fetch(`/api/admin/students/${studentId}/chat`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ disabled: !currentlyDisabled }),
      });
      if (res.ok) {
        await fetchFriendsAndChallenges();
      }
    },
    [authToken, authUser?.role, adminModeActive, fetchFriendsAndChallenges]
  );

  const handleAdminDeleteSocialMessage = useCallback(
    async (messageId: string) => {
      if (!authToken || authUser?.role !== 'admin' || !adminModeActive) return;
      await fetch(`/api/admin/social/messages/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
    },
    [authToken, authUser?.role, adminModeActive]
  );

  const handleOpenModerationQueue = useCallback(() => {
    if (authUser?.role !== 'admin' || !adminModeActive) return;
    setRequestedAdminSubTab('moderation');
    setActiveTab('admin');
  }, [authUser?.role, adminModeActive]);

  // Active Chess Clock Timer (Rapid 10m / Blitz 5m)
  useEffect(() => {
    if (!authToken || !authUser) return;
    if (activeTab !== 'play') return;
    if (playTimeControl === 'untimed') return;
    if (playState.status.isOver) return;
    if (playPgnHistory.length === 0) return;

    lastClockTickAtRef.current = Date.now();
    const side = playState.turn;
    const interval = window.setInterval(() => {
      lastClockTickAtRef.current = Date.now();
      setPlayClocks((prev) => {
        const nextVal = Math.max(0, prev[side] - 1);
        if (nextVal === 0) {
          setPlayTimeoutWinner(side === 'w' ? 'b' : 'w');
          soundEngine.play('end');
        }
        return { ...prev, [side]: nextVal };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [
    authToken,
    authUser,
    activeTab,
    playTimeControl,
    playState.status.isOver,
    playState.turn,
    playPgnHistory.length,
    clockWatchdogNonce,
  ]);

  // Sentinel Frozen Clock Watchdog: detects stalled countdown timer and auto-resyncs
  useEffect(() => {
    if (!authToken || !authUser) return;
    if (activeTab !== 'play' || playTimeControl === 'untimed') return;
    if (playState.status.isOver || playPgnHistory.length === 0) return;

    const watchdog = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) {
        lastClockTickAtRef.current = Date.now();
        return;
      }
      if (Date.now() - lastClockTickAtRef.current > 4000) {
        lastClockTickAtRef.current = Date.now();
        sentinelAgent.reportAutoRepair(
          'clock_watchdog',
          'Frozen match clock detected & resynced',
          `Clock for ${playState.turn === 'w' ? 'White' : 'Black'} paused >4s during live timed play.`,
          'Restarted match clock interval cleanly'
        );
        setClockWatchdogNonce((n) => n + 1);
      }
    }, 3000);

    return () => window.clearInterval(watchdog);
  }, [
    authToken,
    authUser,
    activeTab,
    playTimeControl,
    playState.status.isOver,
    playState.turn,
    playPgnHistory.length,
  ]);

  // Automatically save completed matches to /api/games for Recent Academy Games
  useEffect(() => {
    if (!authToken || !authUser) return;
    if (!playState.status.isOver) return;
    if (playPgnHistory.length === 0 && !playResignedBy && !playTimeoutWinner) return;

    const key = `${playInitialFen}|${playPgnHistory.length}|${playResignedBy || ''}|${playTimeoutWinner || ''}`;
    if (recordedGameKeyRef.current === key) return;
    recordedGameKeyRef.current = key;

    const effectiveColor: Color = playOpponent === 'local' ? 'w' : playerColor;
    let result: AcademyGameResult = 'draw';
    if (playState.status.winner === 'White') {
      result = effectiveColor === 'w' ? 'win' : 'loss';
    } else if (playState.status.winner === 'Black') {
      result = effectiveColor === 'b' ? 'win' : 'loss';
    }

    const opponentLabel =
      playOpponent === 'friend' && activeChallenge
        ? playerColor === 'w'
          ? `Friend · ${activeChallenge.challenged_name}`
          : `Friend · ${activeChallenge.challenger_name}`
        : playOpponent === 'local'
        ? 'Classmate (2P)'
        : playOpponent === 'beginner'
        ? 'Coach Bot · Beginner'
        : playOpponent === 'coach'
        ? 'Coach Bot · Master'
        : 'Coach Bot · Club';

    fetch('/api/games', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        opponentLabel,
        timeControl: TIME_CONTROL_LABELS[playTimeControl],
        playerColor: effectiveColor,
        result,
        resultReason: playState.status.headline,
        initialFen: playInitialFen,
        moves: playPgnHistory,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { game?: AcademyGameRecord } | null) => {
        if (data?.game) {
          setRecentGames((prev) => [data.game!, ...prev].slice(0, 20));
        }
      })
      .catch(() => {
        // Ignore transient save errors
      });
  }, [
    authToken,
    authUser,
    playState.status.isOver,
    playState.status.winner,
    playState.status.headline,
    playInitialFen,
    playPgnHistory,
    playResignedBy,
    playTimeoutWinner,
    playOpponent,
    playerColor,
    playTimeControl,
  ]);

  useEffect(() => {
    if (!authToken || !authUser) return;
    if (activeTab !== 'play') return;
    if (playOpponent === 'local' || playOpponent === 'friend') return;
    if (playState.status.isOver) return;
    if (playState.turn === playerColor) return;

    setIsBotThinking(true);
    const difficulty: BotDifficulty = playOpponent;
    const timer = window.setTimeout(() => {
      try {
        const botChess = new Chess(playState.fen);
        const botMove = pickBotMove(botChess, difficulty);
        if (botMove) {
          const applied = botChess.move(botMove);
          setPlayPgnHistory((prev) => [...prev, applied.san]);
          setBestMoveLabel(null);
          playMoveSound(applied, botChess);
        }
      } catch (err) {
        sentinelAgent.reportRuntimeError(err, 'AI Bot Move Execution');
      } finally {
        setIsBotThinking(false);
      }
    }, 420);

    // Sentinel Stuck AI Bot Watchdog (>8 seconds)
    const stallWatchdog = window.setTimeout(() => {
      try {
        const recoveryChess = new Chess(playState.fen);
        const legal = recoveryChess.moves({ verbose: true });
        if (legal.length > 0) {
          const fallbackMove = legal[0];
          const applied = recoveryChess.move(fallbackMove);
          setPlayPgnHistory((prev) => [...prev, applied.san]);
          playMoveSound(applied, recoveryChess);
          sentinelAgent.reportAutoRepair(
            'bot_watchdog',
            'AI Bot stall auto-recovered (>8s)',
            `Bot turn exceeded 8 seconds on FEN ${playState.fen.slice(0, 32)}…`,
            `Executed safe legal move (${applied.san}) and cleared lock`
          );
        }
      } catch {
        // Ignore if game ended concurrently
      } finally {
        setIsBotThinking(false);
      }
    }, 8200);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(stallWatchdog);
      setIsBotThinking(false);
    };
  }, [
    authToken,
    authUser,
    activeTab,
    playOpponent,
    playState.fen,
    playState.turn,
    playState.status.isOver,
    playerColor,
  ]);

  const handlePlayMove = useCallback(
    ({ from, to, promotion }: { from: Square; to: Square; promotion?: PieceSymbol }): boolean => {
      if (playState.status.isOver) return false;
      if (playOpponent !== 'local' && playState.turn !== playerColor) return false;

      const clone = new Chess(playState.fen);
      try {
        const move = clone.move({ from, to, promotion });
        if (!move) return false;
        setPlayPgnHistory((prev) => [...prev, move.san]);
        clearAnnotations();
        playMoveSound(move, clone);

        if (playOpponent === 'friend' && activeChallenge && authToken) {
          fetch(`/api/challenges/${activeChallenge.id}/move`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ from, to, promotion }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { challenge?: MatchChallengeRecord } | null) => {
              if (data?.challenge) {
                setActiveChallenge(data.challenge);
                const synced = data.challenge.moves_san
                  .split(/\s+/)
                  .map((m) => m.trim())
                  .filter(Boolean);
                setPlayPgnHistory(synced);
              }
            })
            .catch(() => {
              // Ignore transient sync errors; poll recovers cleanly
            });
        }
        return true;
      } catch {
        return false;
      }
    },
    [
      playState.fen,
      playState.status.isOver,
      playState.turn,
      playOpponent,
      playerColor,
      activeChallenge,
      authToken,
      clearAnnotations,
    ]
  );

  const handlePlayUndo = useCallback(() => {
    if (playOpponent === 'friend') return;
    if (playPgnHistory.length === 0) return;
    setPlayResignedBy(null);
    setGameOverModalDismissed(false);
    clearAnnotations();

    if (playOpponent === 'local') {
      setPlayPgnHistory((prev) => prev.slice(0, -1));
      return;
    }

    setPlayPgnHistory((prev) => {
      if (playState.turn === playerColor && prev.length >= 2) {
        return prev.slice(0, -2);
      }
      if (prev.length >= 1) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, [playPgnHistory.length, playOpponent, playState.turn, playerColor, clearAnnotations]);

  const handlePlayResign = useCallback(() => {
    if (playState.status.isOver) return;
    const loser = playOpponent === 'local' ? playState.turn : playerColor;
    setPlayResignedBy(loser);
    setGameOverModalDismissed(false);
    soundEngine.play('end');
    if (playOpponent === 'friend' && activeChallenge && authToken) {
      fetch(`/api/challenges/${activeChallenge.id}/move`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resign: true }),
      }).catch(() => {});
    }
  }, [
    playState.status.isOver,
    playState.turn,
    playOpponent,
    playerColor,
    activeChallenge,
    authToken,
  ]);

  // =========================================================================
  // PUZZLES MODE STATE (Academy Custom Puzzles + Built-in Classics)
  // =========================================================================
  const [puzzleSource, setPuzzleSource] = useState<PuzzleSource>('academy');
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [puzzleMoves, setPuzzleMoves] = useState<string[]>([]);
  const [puzzleFlipped, setPuzzleFlipped] = useState<boolean>(false);
  const [puzzleStatus, setPuzzleStatus] = useState<'solving' | 'wrong' | 'solved' | 'revealed'>(
    'solving'
  );
  const [showPuzzleHint, setShowPuzzleHint] = useState(false);

  const classicPuzzleItems = useMemo<ActivePuzzleItem[]>(
    () =>
      CHESS_PUZZLES.map((p) => ({
        id: p.id,
        isCustom: false,
        title: p.title,
        fen: p.fen,
        solution: p.solution,
        subtitle: p.theme,
        meta: `Rating ${p.rating}`,
        hint: p.hint,
      })),
    []
  );

  const academyPuzzleItems = useMemo<ActivePuzzleItem[]>(
    () =>
      academyPuzzles.map((p) => ({
        id: p.id,
        isCustom: true,
        title: p.title,
        fen: p.fen,
        solution: p.solution_moves
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean),
        subtitle: p.difficulty,
        meta: 'Academy Puzzle',
        hint: p.coach_notes || 'Look closely for tactical checks, captures, and pins.',
      })),
    [academyPuzzles]
  );

  const homeDailyPuzzle = useMemo(() => {
    if (academyPuzzleItems.length > 0) {
      const p = academyPuzzleItems[0];
      return {
        id: p.id,
        title: p.title,
        fen: p.fen,
        solution: p.solution,
        difficulty: p.subtitle,
        coachNotes: p.hint,
        isCustom: true,
      };
    }
    const c = classicPuzzleItems[0];
    return {
      id: c.id,
      title: c.title,
      fen: c.fen,
      solution: c.solution,
      difficulty: c.subtitle,
      coachNotes: c.hint,
      isCustom: false,
    };
  }, [academyPuzzleItems, classicPuzzleItems]);

  const activePuzzleList =
    puzzleSource === 'academy' && academyPuzzleItems.length > 0
      ? academyPuzzleItems
      : classicPuzzleItems;

  const isShowingEmptyAcademy =
    puzzleSource === 'academy' && academyPuzzleItems.length === 0;

  const safePuzzleIdx =
    activePuzzleList.length > 0 ? Math.min(puzzleIdx, activePuzzleList.length - 1) : 0;

  const activePuzzle: ActivePuzzleItem =
    activePuzzleList[safePuzzleIdx] ?? classicPuzzleItems[0];

  const progressByPuzzleId = useMemo(() => {
    const map = new Map<string, StudentProgressRecord>();
    for (const row of studentProgress) {
      map.set(row.puzzle_id, row);
    }
    return map;
  }, [studentProgress]);

  const activeCustomProgress = activePuzzle.isCustom
    ? progressByPuzzleId.get(activePuzzle.id)
    : undefined;

  const recordAcademyPuzzleProgress = useCallback(
    async (puzzleId: string, solved: boolean) => {
      if (!authToken) return;
      try {
        const res = await fetch(`/api/puzzles/${puzzleId}/progress`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ solved }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { progress?: StudentProgressRecord };
        if (data.progress) {
          const updated = data.progress;
          setStudentProgress((prev) => {
            const exists = prev.some((r) => r.puzzle_id === updated.puzzle_id);
            if (exists) {
              return prev.map((r) => (r.puzzle_id === updated.puzzle_id ? updated : r));
            }
            return [...prev, updated];
          });
        }
      } catch {
        // Ignore transient network errors
      }
    },
    [authToken]
  );

  const puzzleState = useMemo(() => {
    const chess = new Chess(activePuzzle.fen);
    let lastMove: LastMoveHighlight | null = null;
    for (const san of puzzleMoves) {
      const m = chess.move(san);
      if (m) lastMove = { from: m.from, to: m.to };
    }
    const solverColor = new Chess(activePuzzle.fen).turn();
    return {
      chess,
      fen: chess.fen(),
      turn: chess.turn(),
      solverColor,
      lastMove,
      captured: getCapturedPieces(chess),
    };
  }, [activePuzzle.fen, puzzleMoves]);

  const selectPuzzle = useCallback(
    (index: number, nextSource?: PuzzleSource) => {
      const src = nextSource ?? puzzleSource;
      const list =
        src === 'academy' && academyPuzzleItems.length > 0
          ? academyPuzzleItems
          : classicPuzzleItems;
      if (list.length === 0) return;
      const normalized = ((index % list.length) + list.length) % list.length;
      const target = list[normalized];
      const side = new Chess(target.fen).turn();
      if (nextSource) setPuzzleSource(nextSource);
      setPuzzleIdx(normalized);
      setPuzzleMoves([]);
      setPuzzleFlipped(side === 'b');
      setPuzzleStatus('solving');
      setShowPuzzleHint(false);
      clearAnnotations();
    },
    [puzzleSource, academyPuzzleItems, classicPuzzleItems, clearAnnotations]
  );

  useEffect(() => {
    const startTurn = new Chess(activePuzzle.fen).turn();
    setPuzzleFlipped(startTurn === 'b');
  }, [activePuzzle.id, activePuzzle.fen]);

  useEffect(() => {
    if (!authToken || !authUser) return;
    if (activeTab !== 'puzzles') return;
    if (puzzleStatus !== 'solving') return;
    const stepIdx = puzzleMoves.length;
    if (stepIdx % 2 === 1 && stepIdx < activePuzzle.solution.length) {
      const timer = window.setTimeout(() => {
        const uci = activePuzzle.solution[stepIdx];
        const clone = new Chess(puzzleState.fen);
        const reply = clone.move({
          from: uci.slice(0, 2) as Square,
          to: uci.slice(2, 4) as Square,
          promotion: uci[4] as PieceSymbol | undefined,
        });
        if (reply) {
          setPuzzleMoves((prev) => [...prev, reply.san]);
          playMoveSound(reply, clone);
        }
      }, 420);
      return () => window.clearTimeout(timer);
    }
  }, [
    authToken,
    authUser,
    activeTab,
    puzzleStatus,
    puzzleMoves.length,
    activePuzzle.solution,
    puzzleState.fen,
  ]);

  const handlePuzzleMove = useCallback(
    ({ from, to, promotion }: { from: Square; to: Square; promotion?: PieceSymbol }): boolean => {
      if (puzzleStatus === 'solved' || puzzleStatus === 'revealed') return false;
      const stepIdx = puzzleMoves.length;
      if (stepIdx % 2 === 1) return false;

      const clone = new Chess(puzzleState.fen);
      let move: Move;
      try {
        const res = clone.move({ from, to, promotion });
        if (!res) return false;
        move = res;
      } catch {
        return false;
      }

      const playedUci = `${from}${to}${promotion ?? ''}`;
      const expectedUci = activePuzzle.solution[stepIdx];

      if (playedUci === expectedUci || clone.isCheckmate()) {
        setPuzzleMoves((prev) => [...prev, move.san]);
        setShowPuzzleHint(false);
        const isFinished = clone.isCheckmate() || stepIdx + 1 >= activePuzzle.solution.length;
        if (isFinished) {
          setPuzzleStatus('solved');
          soundEngine.play('end');
          if (activePuzzle.isCustom) {
            recordAcademyPuzzleProgress(activePuzzle.id, true);
          }
        } else {
          setPuzzleStatus('solving');
          playMoveSound(move, clone);
        }
        return true;
      } else {
        setPuzzleStatus('wrong');
        soundEngine.play('illegal');
        if (activePuzzle.isCustom) {
          recordAcademyPuzzleProgress(activePuzzle.id, false);
        }
        return false;
      }
    },
    [
      puzzleStatus,
      puzzleMoves.length,
      puzzleState.fen,
      activePuzzle,
      recordAcademyPuzzleProgress,
    ]
  );

  const puzzleHintSquares = useMemo<HintHighlight | null>(() => {
    if (!showPuzzleHint || puzzleStatus === 'solved') return null;
    const expected = activePuzzle.solution[puzzleMoves.length];
    if (!expected) return null;
    return {
      from: expected.slice(0, 2) as Square,
      to: expected.slice(2, 4) as Square,
    };
  }, [showPuzzleHint, puzzleStatus, activePuzzle.solution, puzzleMoves.length]);

  const handlePuzzleUndo = useCallback(() => {
    if (puzzleMoves.length === 0) return;
    setPuzzleStatus('solving');
    setPuzzleMoves((prev) =>
      prev.length >= 2 && prev.length % 2 === 0 ? prev.slice(0, -2) : prev.slice(0, -1)
    );
  }, [puzzleMoves.length]);

  const handlePuzzleReveal = useCallback(() => {
    const clone = new Chess(activePuzzle.fen);
    const fullSans: string[] = [];
    for (const uci of activePuzzle.solution) {
      const m = clone.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci[4] as PieceSymbol | undefined,
      });
      if (m) fullSans.push(m.san);
    }
    setPuzzleMoves(fullSans);
    setPuzzleStatus('revealed');
    setShowPuzzleHint(false);
  }, [activePuzzle]);

  // =========================================================================
  // LEARN & PRACTICE MODE STATE (Lessons + Custom Board Setup)
  // =========================================================================
  const [learnSubMode, setLearnSubMode] = useState<LearnSubMode>('lessons');
  const [lessonIdx, setLessonIdx] = useState(0);
  const [lessonMoves, setLessonMoves] = useState<string[]>([]);
  const [lessonFlipped, setLessonFlipped] = useState<boolean>(
    CHESS_LESSONS[0].playerColor === 'b'
  );
  const [lessonFeedback, setLessonFeedback] = useState<{
    kind: 'info' | 'wrong' | 'complete';
    text: string;
  }>({
    kind: 'info',
    text: CHESS_LESSONS[0].summary,
  });
  const [lessonShowHint, setLessonShowHint] = useState(false);

  const activeLesson = CHESS_LESSONS[lessonIdx];

  const lessonState = useMemo(() => {
    const chess = new Chess(activeLesson.initialFen);
    let lastMove: LastMoveHighlight | null = null;
    for (const san of lessonMoves) {
      const m = chess.move(san);
      if (m) lastMove = { from: m.from, to: m.to };
    }
    return {
      chess,
      fen: chess.fen(),
      turn: chess.turn(),
      lastMove,
      captured: getCapturedPieces(chess),
    };
  }, [activeLesson.initialFen, lessonMoves]);

  const selectLesson = useCallback(
    (idx: number) => {
      const normalized =
        ((idx % CHESS_LESSONS.length) + CHESS_LESSONS.length) % CHESS_LESSONS.length;
      const target = CHESS_LESSONS[normalized];
      setLessonIdx(normalized);
      setLessonMoves([]);
      setLessonFlipped(target.playerColor === 'b');
      setLessonFeedback({ kind: 'info', text: target.summary });
      setLessonShowHint(false);
      clearAnnotations();
    },
    [clearAnnotations]
  );

  // Auto-play opponent/coach reply in active lesson when it's not the student's turn
  useEffect(() => {
    if (!authToken || !authUser || activeTab !== 'learn' || learnSubMode !== 'lessons') return;
    const stepIdx = lessonMoves.length;
    if (stepIdx >= activeLesson.steps.length) return;
    if (lessonState.turn === activeLesson.playerColor) return;

    const timer = window.setTimeout(() => {
      const step = activeLesson.steps[stepIdx];
      const clone = new Chess(lessonState.fen);
      const reply = clone.move({
        from: step.uci.slice(0, 2) as Square,
        to: step.uci.slice(2, 4) as Square,
        promotion: step.uci[4] as PieceSymbol | undefined,
      });
      if (reply) {
        setLessonMoves((prev) => [...prev, reply.san]);
        const isLast = stepIdx + 1 >= activeLesson.steps.length;
        setLessonFeedback({
          kind: isLast ? 'complete' : 'info',
          text: step.explanation,
        });
        playMoveSound(reply, clone);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    authToken,
    authUser,
    activeTab,
    learnSubMode,
    lessonMoves.length,
    activeLesson,
    lessonState.turn,
    lessonState.fen,
  ]);

  const handleLessonMove = useCallback(
    ({ from, to, promotion }: { from: Square; to: Square; promotion?: PieceSymbol }): boolean => {
      const stepIdx = lessonMoves.length;
      if (stepIdx >= activeLesson.steps.length) return false;
      if (lessonState.turn !== activeLesson.playerColor) return false;

      const clone = new Chess(lessonState.fen);
      let move: Move;
      try {
        const res = clone.move({ from, to, promotion });
        if (!res) return false;
        move = res;
      } catch {
        return false;
      }

      const playedUci = `${from}${to}${promotion ?? ''}`;
      const expectedStep = activeLesson.steps[stepIdx];

      if (playedUci === expectedStep.uci) {
        setLessonMoves((prev) => [...prev, move.san]);
        setLessonShowHint(false);
        const isLast = stepIdx + 1 >= activeLesson.steps.length;
        setLessonFeedback({
          kind: isLast ? 'complete' : 'info',
          text: expectedStep.explanation,
        });
        playMoveSound(move, clone);
        return true;
      } else {
        setLessonFeedback({
          kind: 'wrong',
          text: expectedStep.hint || 'Not quite — try the recommended move for this lesson.',
        });
        soundEngine.play('illegal');
        return false;
      }
    },
    [lessonMoves.length, activeLesson, lessonState.turn, lessonState.fen]
  );

  const lessonHintSquares = useMemo<HintHighlight | null>(() => {
    if (!lessonShowHint) return null;
    const step = activeLesson.steps[lessonMoves.length];
    if (!step) return null;
    return {
      from: step.uci.slice(0, 2) as Square,
      to: step.uci.slice(2, 4) as Square,
    };
  }, [lessonShowHint, activeLesson.steps, lessonMoves.length]);

  const handleLessonUndo = useCallback(() => {
    if (lessonMoves.length === 0) return;
    setLessonShowHint(false);
    setLessonMoves((prev) => {
      const targetLen =
        lessonState.turn === activeLesson.playerColor && prev.length >= 2
          ? prev.length - 2
          : prev.length - 1;
      const next = prev.slice(0, Math.max(0, targetLen));
      if (next.length === 0) {
        setLessonFeedback({ kind: 'info', text: activeLesson.summary });
      } else {
        const lastStep = activeLesson.steps[next.length - 1];
        setLessonFeedback({ kind: 'info', text: lastStep.explanation });
      }
      return next;
    });
  }, [lessonMoves.length, lessonState.turn, activeLesson]);

  // Position Editor State
  const [editorGrid, setEditorGrid] = useState<CustomBoardGrid>(() => fenToGrid(STANDARD_FEN));
  const [editorTurn, setEditorTurn] = useState<Color>('w');
  const [editorCastling, setEditorCastling] = useState({ K: true, Q: true, k: true, q: true });
  const [editorTool, setEditorTool] = useState<EditorTool>({
    kind: 'piece',
    color: 'w',
    type: 'q',
  });
  const [editorFlipped, setEditorFlipped] = useState(false);
  const [editorFenError, setEditorFenError] = useState<string | null>(null);
  const [editorValidationError, setEditorValidationError] = useState<string | null>(null);

  const editorFen = useMemo(
    () => gridToFen(editorGrid, editorTurn, editorCastling),
    [editorGrid, editorTurn, editorCastling]
  );

  const handleEditorSquareClick = useCallback(
    (square: Square) => {
      const { r, c } = squareToIndices(square);
      setEditorValidationError(null);
      setEditorFenError(null);
      setEditorGrid((prev) => {
        const next = prev.map((row) => [...row]);
        if (editorTool.kind === 'erase') {
          next[r][c] = null;
        } else {
          const existing = next[r][c];
          if (
            existing &&
            existing.color === editorTool.color &&
            existing.type === editorTool.type
          ) {
            next[r][c] = null;
          } else {
            next[r][c] = { color: editorTool.color, type: editorTool.type };
          }
        }
        return next;
      });
    },
    [editorTool]
  );

  const handleEditorMovePiece = useCallback((from: Square, to: Square) => {
    const f = squareToIndices(from);
    const t = squareToIndices(to);
    setEditorGrid((prev) => {
      const next = prev.map((row) => [...row]);
      const piece = next[f.r][f.c];
      if (!piece) return prev;
      next[t.r][t.c] = piece;
      next[f.r][f.c] = null;
      return next;
    });
  }, []);

  const handleEditorLoadFen = useCallback((rawFen: string) => {
    try {
      const parsed = new Chess(rawFen);
      const parts = parsed.fen().split(' ');
      const castlingField = parts[2] ?? '-';
      setEditorGrid(fenToGrid(parsed.fen()));
      setEditorTurn(parsed.turn());
      setEditorCastling({
        K: castlingField.includes('K'),
        Q: castlingField.includes('Q'),
        k: castlingField.includes('k'),
        q: castlingField.includes('q'),
      });
      setEditorFenError(null);
      setEditorValidationError(null);
    } catch {
      setEditorFenError('Invalid FEN string. Ensure both Kings and valid ranks are included.');
    }
  }, []);

  const validateEditorPosition = useCallback((): string | null => {
    let whiteKings = 0;
    let blackKings = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = editorGrid[r][c];
        if (cell?.type === 'k') {
          if (cell.color === 'w') whiteKings++;
          else blackKings++;
        }
      }
    }
    if (whiteKings !== 1 || blackKings !== 1) {
      setEditorValidationError('Place exactly one White King and one Black King.');
      return null;
    }

    try {
      const check = new Chess(editorFen);
      setEditorValidationError(null);
      return check.fen();
    } catch {
      setEditorValidationError(
        'Position is illegal (check pawns on 1st/8th rank or opposing king in check).'
      );
      return null;
    }
  }, [editorGrid, editorFen]);

  const handlePlayFromEditor = useCallback(() => {
    const validFen = validateEditorPosition();
    if (!validFen) return;
    setPlayerColor(editorTurn);
    startNewPlayGame(editorTurn, playOpponent, validFen);
    setPlayFlipped(editorTurn === 'b');
    setActiveTab('play');
    setMobileDrawerOpen(false);
  }, [validateEditorPosition, editorTurn, startNewPlayGame, playOpponent]);

  const handleAnalyzeFromEditor = useCallback(() => {
    const validFen = validateEditorPosition();
    if (!validFen) return;
    setAnalyzeInitialFen(validFen);
    setAnalyzeMoves([]);
    setAnalyzeCursor(0);
    setAnalyzeMoveNotes({});
    setAnalyzeFlipped(editorTurn === 'b');
    clearAnnotations();
    setActiveTab('analyze');
    setMobileDrawerOpen(false);
  }, [validateEditorPosition, editorTurn, clearAnnotations]);

  // =========================================================================
  // ANALYZE MODE STATE
  // =========================================================================
  const [analyzeInitialFen, setAnalyzeInitialFen] = useState<string>(STANDARD_FEN);
  const [analyzeMoves, setAnalyzeMoves] = useState<string[]>([]);
  const [analyzeMoveNotes, setAnalyzeMoveNotes] = useState<Record<number, string>>({});
  const [analyzeCursor, setAnalyzeCursor] = useState<number>(0);
  const [analyzeFlipped, setAnalyzeFlipped] = useState(false);
  const [fenInput, setFenInput] = useState<string>(STANDARD_FEN);
  const [fenError, setFenError] = useState<string | null>(null);
  const [copiedFen, setCopiedFen] = useState(false);

  const analyzeState = useMemo(() => {
    let chess: Chess;
    try {
      chess = new Chess(analyzeInitialFen);
    } catch {
      chess = new Chess(STANDARD_FEN);
    }
    let lastMove: LastMoveHighlight | null = null;
    for (let i = 0; i < analyzeCursor; i++) {
      try {
        const m = chess.move(analyzeMoves[i]);
        if (m) lastMove = { from: m.from, to: m.to };
        else break;
      } catch {
        break;
      }
    }
    const fen = chess.fen();
    const evalCp = evaluatePosition(chess);
    return {
      chess,
      fen,
      turn: chess.turn(),
      lastMove,
      captured: getCapturedPieces(chess),
      status: getGameStatus(chess, null),
      evalCp,
      evalLabel: formatEvalLabel(evalCp, chess),
    };
  }, [analyzeInitialFen, analyzeMoves, analyzeCursor]);

  // Sentinel Board & Move Integrity Monitor for Analyze Mode
  useEffect(() => {
    const check = sentinelAgent.validateAndRecoverSequence(
      analyzeInitialFen,
      analyzeMoves,
      'Analyze Board'
    );
    if (check.recovered) {
      if (check.safeInitialFen !== analyzeInitialFen) setAnalyzeInitialFen(check.safeInitialFen);
      if (check.safeMoves.length !== analyzeMoves.length) {
        setAnalyzeMoves(check.safeMoves);
        setAnalyzeCursor(check.safeMoves.length);
      }
    }
  }, [analyzeInitialFen, analyzeMoves]);

  useEffect(() => {
    setFenInput(analyzeState.fen);
    setFenError(null);
  }, [analyzeState.fen]);

  const handleAnalyzeMove = useCallback(
    ({ from, to, promotion }: { from: Square; to: Square; promotion?: PieceSymbol }): boolean => {
      const clone = new Chess(analyzeState.fen);
      try {
        const move = clone.move({ from, to, promotion });
        if (!move) return false;
        const truncated = analyzeMoves.slice(0, analyzeCursor);
        const nextMoves = [...truncated, move.san];
        setAnalyzeMoves(nextMoves);
        setAnalyzeCursor(nextMoves.length);
        clearAnnotations();
        playMoveSound(move, clone);
        return true;
      } catch {
        return false;
      }
    },
    [analyzeState.fen, analyzeMoves, analyzeCursor, clearAnnotations]
  );

  const handleAnalyzePlayedGame = useCallback(() => {
    setAnalyzeInitialFen(playInitialFen);
    setAnalyzeMoves([...playPgnHistory]);
    setAnalyzeMoveNotes({ ...playMoveNotes });
    setAnalyzeCursor(playPgnHistory.length);
    setAnalyzeFlipped(playFlipped);
    setGameOverModalDismissed(true);
    clearAnnotations();
    setActiveTab('analyze');
  }, [playInitialFen, playPgnHistory, playMoveNotes, playFlipped, clearAnnotations]);

  const handleLoadFen = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validated = new Chess(fenInput.trim());
      setAnalyzeInitialFen(validated.fen());
      setAnalyzeMoves([]);
      setAnalyzeMoveNotes({});
      setAnalyzeCursor(0);
      setFenError(null);
      clearAnnotations();
    } catch {
      setFenError('Invalid FEN string. Check piece placement and turn fields.');
    }
  };

  const handleCopyFen = async () => {
    try {
      await navigator.clipboard.writeText(analyzeState.fen);
      setCopiedFen(true);
      window.setTimeout(() => setCopiedFen(false), 1600);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleAnalyzeReset = useCallback(() => {
    setAnalyzeInitialFen(STANDARD_FEN);
    setAnalyzeMoves([]);
    setAnalyzeMoveNotes({});
    setAnalyzeCursor(0);
    setFenError(null);
    clearAnnotations();
  }, [clearAnnotations]);

  const handleAnalyzeUndo = useCallback(() => {
    if (analyzeCursor > 0) {
      setAnalyzeCursor((c) => Math.max(0, c - 1));
      clearAnnotations();
    }
  }, [analyzeCursor, clearAnnotations]);

  // =========================================================================
  // HINT / BEST MOVE ARROW (PLAY & ANALYZE)
  // =========================================================================
  const handleShowBestMove = useCallback(() => {
    const targetChess =
      activeTab === 'play'
        ? playState.chess
        : activeTab === 'analyze'
        ? analyzeState.chess
        : null;
    if (!targetChess || targetChess.isGameOver()) return;

    const best = findBestMove(targetChess);
    if (!best) return;

    setArrows((prev) => [
      ...prev.filter((a) => !(a.from === best.move.from && a.to === best.move.to)),
      { from: best.move.from, to: best.move.to, color: 'green' },
    ]);
    setBestMoveLabel(`Best: ${best.move.san}`);
  }, [activeTab, playState.chess, analyzeState.chess]);

  useEffect(() => {
    if (!authToken || !authUser || activeTab !== 'analyze') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        setAnalyzeCursor((c) => Math.max(0, c - 1));
      } else if (e.key === 'ArrowRight') {
        setAnalyzeCursor((c) => Math.min(analyzeMoves.length, c + 1));
      } else if (e.key === 'Home') {
        setAnalyzeCursor(0);
      } else if (e.key === 'End') {
        setAnalyzeCursor(analyzeMoves.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [authToken, authUser, activeTab, analyzeMoves.length]);

  // =========================================================================
  // HOME DASHBOARD LAUNCHERS
  // =========================================================================
  const handleQuickStartMatch = useCallback(
    (opponent: QuickPlayOpponent, timeControl: QuickPlayTimeControl) => {
      setPlayOpponent(opponent);
      setPlayTimeControl(timeControl);
      startNewPlayGame(playerColor, opponent, STANDARD_FEN, timeControl);
      clearAnnotations();
      setActiveTab('play');
    },
    [playerColor, startNewPlayGame, clearAnnotations]
  );

  const handleOpenDailyPuzzle = useCallback(() => {
    const targetSrc: PuzzleSource = academyPuzzleItems.length > 0 ? 'academy' : 'classics';
    selectPuzzle(0, targetSrc);
    setActiveTab('puzzles');
  }, [academyPuzzleItems.length, selectPuzzle]);

  const handleOpenLessonFromHome = useCallback(
    (idx: number) => {
      setLearnSubMode('lessons');
      selectLesson(idx);
      setActiveTab('learn');
    },
    [selectLesson]
  );

  const handleReviewAcademyGame = useCallback(
    (game: AcademyGameRecord) => {
      const moves = game.moves_san
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      setAnalyzeInitialFen(game.initial_fen || STANDARD_FEN);
      setAnalyzeMoves(moves);
      setAnalyzeCursor(moves.length);
      setAnalyzeMoveNotes({});
      setAnalyzeFlipped(game.player_color === 'b');
      clearAnnotations();
      setActiveTab('analyze');
    },
    [clearAnnotations]
  );

  const handleLoadFenToAnalyze = useCallback(
    (fen: string) => {
      try {
        const validated = new Chess(fen);
        setAnalyzeInitialFen(validated.fen());
        setAnalyzeMoves([]);
        setAnalyzeCursor(0);
        setAnalyzeMoveNotes({});
        setAnalyzeFlipped(validated.turn() === 'b');
        clearAnnotations();
        setActiveTab('analyze');
      } catch (err) {
        sentinelAgent.reportRuntimeError(err, 'Load Attached FEN');
      }
    },
    [clearAnnotations]
  );

  // =========================================================================
  // RENDER HELPERS
  // =========================================================================

  const isEditorActive = activeTab === 'learn' && learnSubMode === 'editor';

  const currentFlipped =
    activeTab === 'play'
      ? playFlipped
      : activeTab === 'puzzles'
      ? puzzleFlipped
      : activeTab === 'learn'
      ? learnSubMode === 'lessons'
        ? lessonFlipped
        : editorFlipped
      : analyzeFlipped;

  const getPlayerLabel = (side: Color) => {
    if (activeTab === 'play') {
      if (playOpponent === 'friend' && activeChallenge) {
        return side === 'w'
          ? activeChallenge.challenger_name
          : activeChallenge.challenged_name;
      }
      if (playOpponent === 'local') {
        return side === 'w' ? 'White' : 'Black';
      }
      const botLabel =
        playOpponent === 'beginner'
          ? 'Bot · Beginner'
          : playOpponent === 'coach'
          ? 'Bot · Coach'
          : 'Bot · Club';
      return side === playerColor ? 'You' : botLabel;
    }
    if (activeTab === 'puzzles') {
      return side === puzzleState.solverColor ? 'Your Side' : 'Opponent';
    }
    if (activeTab === 'learn' && learnSubMode === 'lessons') {
      return side === activeLesson.playerColor ? 'Student' : 'Coach';
    }
    return side === 'w' ? 'White' : 'Black';
  };

  const topColor: Color = currentFlipped ? 'w' : 'b';
  const bottomColor: Color = currentFlipped ? 'b' : 'w';
  const currentTurn: Color =
    activeTab === 'play'
      ? playState.turn
      : activeTab === 'puzzles'
      ? puzzleState.turn
      : activeTab === 'learn'
      ? learnSubMode === 'lessons'
        ? lessonState.turn
        : editorTurn
      : analyzeState.turn;

  const currentCaptured =
    activeTab === 'play'
      ? playState.captured
      : activeTab === 'puzzles'
      ? puzzleState.captured
      : activeTab === 'learn'
      ? lessonState.captured
      : analyzeState.captured;

  const getSideAdvantage = (side: Color) => {
    if (isEditorActive) return null;
    if (side === 'w' && currentCaptured.whiteAdvantage > 0) {
      return `+${currentCaptured.whiteAdvantage}`;
    }
    if (side === 'b' && currentCaptured.whiteAdvantage < 0) {
      return `+${Math.abs(currentCaptured.whiteAdvantage)}`;
    }
    return null;
  };

  const isCurrentGameOver =
    activeTab === 'play'
      ? playState.status.isOver
      : activeTab === 'puzzles'
      ? puzzleStatus === 'solved' || puzzleStatus === 'revealed'
      : activeTab === 'learn'
      ? learnSubMode === 'lessons' && lessonMoves.length >= activeLesson.steps.length
      : analyzeState.status.isOver;

  const showGameOverModal =
    activeTab === 'play' && playState.status.isOver && !gameOverModalDismissed;

  const currentMovesCount =
    activeTab === 'play'
      ? playPgnHistory.length
      : activeTab === 'puzzles'
      ? puzzleMoves.length
      : activeTab === 'learn'
      ? lessonMoves.length
      : analyzeMoves.length;

  const currentCanUndo =
    activeTab === 'play'
      ? playOpponent !== 'friend' && playPgnHistory.length > 0 && !isBotThinking
      : activeTab === 'puzzles'
      ? puzzleMoves.length > 0 && puzzleStatus !== 'revealed'
      : activeTab === 'learn'
      ? learnSubMode === 'lessons' && lessonMoves.length > 0
      : analyzeCursor > 0;

  const currentCanResign =
    activeTab === 'play'
      ? !playState.status.isOver
      : activeTab === 'puzzles'
      ? puzzleStatus !== 'solved' && puzzleStatus !== 'revealed'
      : false;

  const handleCurrentNew = () => {
    if (activeTab === 'play') startNewPlayGame();
    else if (activeTab === 'puzzles') selectPuzzle(puzzleIdx);
    else if (activeTab === 'learn') {
      if (learnSubMode === 'lessons') selectLesson(lessonIdx);
      else setEditorGrid(fenToGrid(STANDARD_FEN));
    } else handleAnalyzeReset();
  };

  const handleCurrentFlip = () => {
    if (activeTab === 'play') setPlayFlipped((f) => !f);
    else if (activeTab === 'puzzles') setPuzzleFlipped((f) => !f);
    else if (activeTab === 'learn') {
      if (learnSubMode === 'lessons') setLessonFlipped((f) => !f);
      else setEditorFlipped((f) => !f);
    } else setAnalyzeFlipped((f) => !f);
  };

  const handleCurrentUndo = () => {
    if (activeTab === 'play') handlePlayUndo();
    else if (activeTab === 'puzzles') handlePuzzleUndo();
    else if (activeTab === 'learn' && learnSubMode === 'lessons') handleLessonUndo();
    else handleAnalyzeUndo();
  };

  const handleCurrentResign = () => {
    if (activeTab === 'play') handlePlayResign();
    else if (activeTab === 'puzzles') handlePuzzleReveal();
  };

  const showEvalBar =
    activeTab === 'analyze' ||
    (activeTab === 'play' && showPlayEval && playOpponent !== 'friend');

  const activeEvalData =
    activeTab === 'play'
      ? {
          cp: playState.evalCp,
          mate: playState.chess.isCheckmate(),
          turn: playState.turn,
          label: playState.evalLabel,
        }
      : {
          cp: analyzeState.evalCp,
          mate: analyzeState.chess.isCheckmate(),
          turn: analyzeState.turn,
          label: analyzeState.evalLabel,
        };

  const activeMatchRoomId = useMemo(() => {
    if (!authUser) return null;
    if (playOpponent === 'friend' && activeChallenge) {
      return `challenge:${activeChallenge.id}`;
    }
    return `local:${authUser.id}:play`;
  }, [authUser, playOpponent, activeChallenge]);

  const activeMatchOpponentLabel = useMemo(() => {
    if (playOpponent === 'friend' && activeChallenge && authUser) {
      return activeChallenge.challenger_id === authUser.id
        ? activeChallenge.challenged_name
        : activeChallenge.challenger_name;
    }
    if (playOpponent === 'local') return 'Classmate (2P Local)';
    if (playOpponent === 'beginner') return 'Coach Bot · Beginner';
    if (playOpponent === 'coach') return 'Coach Bot · Master';
    return 'Coach Bot · Club';
  }, [playOpponent, activeChallenge, authUser]);

  const renderActiveSidePanel = (compactDrawer = false) => {
    if (activeTab === 'play') {
      return (
        <SidePanel
          turn={playState.turn}
          statusText={playState.status.headline}
          statusSubtext={playState.status.subtext}
          isGameOver={playState.status.isOver}
          captured={playState.captured}
          pieceStyle={settings.pieceStyle}
          moves={playPgnHistory}
          moveNotes={playMoveNotes}
          onChangeMoveNote={(ply, note) =>
            setPlayMoveNotes((prev) => ({ ...prev, [ply]: note }))
          }
          onExportAnnotatedPgn={() => {
            const pgn = buildAnnotatedPgn(playInitialFen, playPgnHistory, playMoveNotes);
            downloadPgnFile(pgn, 'pure-chess-game.pgn');
          }}
          canUndo={playOpponent !== 'friend' && playPgnHistory.length > 0 && !isBotThinking}
          canResign={!playState.status.isOver}
          newGameLabel={playOpponent === 'friend' ? 'Leave Match' : 'New Game'}
          onNewGame={() => {
            if (playOpponent === 'friend') {
              setPlayOpponent('club');
              startNewPlayGame('w', 'club');
            } else {
              startNewPlayGame();
            }
          }}
          onFlipBoard={() => setPlayFlipped((f) => !f)}
          onUndoMove={handlePlayUndo}
          onResign={handlePlayResign}
          compactDrawer={compactDrawer}
          openMessagesNonce={openMessagesNonce}
          messagesSlot={
            authToken && authUser ? (
              <MessagesPanel
                token={authToken}
                user={authUser}
                adminModeActive={adminModeActive}
                classmates={classmates}
                matchRoomId={activeMatchRoomId}
                matchOpponentLabel={activeMatchOpponentLabel}
                defaultChannel="match"
                selectedDmPeerId={selectedDmPeerId}
                onSelectDmPeerId={setSelectedDmPeerId}
                onOpenFriendsDrawer={() => setFriendsDrawerOpen(true)}
                onOpenModerationQueue={handleOpenModerationQueue}
                onTogglePeerChatDisabled={handleAdminToggleStudentChat}
                onDeleteMessage={handleAdminDeleteSocialMessage}
                forceDmNonce={openMessagesNonce}
                compact
              />
            ) : undefined
          }
        >
          {playOpponent === 'friend' && activeChallenge ? (
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div className="font-semibold text-emerald-300 truncate">
                  Live Friend Match · {activeMatchOpponentLabel}
                </div>
                <div className="text-[11px] font-mono-tabular text-slate-400">
                  {TIME_CONTROL_LABELS[playTimeControl]} · Playing{' '}
                  {playerColor === 'w' ? 'White' : 'Black'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFriendsDrawerOpen(true)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 shrink-0 cursor-pointer"
              >
                Friends
              </button>
            </div>
          ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-400">Opponent</span>
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-900/90 rounded-lg border border-white/10">
                {(
                  [
                    { id: 'beginner', label: 'Beginner' },
                    { id: 'club', label: 'Club' },
                    { id: 'coach', label: 'Coach' },
                    { id: 'local', label: '2P' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setPlayOpponent(opt.id);
                      startNewPlayGame(playerColor, opt.id);
                    }}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      playOpponent === opt.id
                        ? 'bg-emerald-500 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-400">Clock</span>
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-900/90 rounded-lg border border-white/10">
                {(
                  [
                    { id: 'rapid10', label: '10 min' },
                    { id: 'blitz5', label: '5 min' },
                    { id: 'untimed', label: 'Untimed' },
                  ] as const
                ).map((tc) => (
                  <button
                    key={tc.id}
                    type="button"
                    onClick={() => {
                      setPlayTimeControl(tc.id);
                      startNewPlayGame(playerColor, playOpponent, STANDARD_FEN, tc.id);
                    }}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      playTimeControl === tc.id
                        ? 'bg-emerald-500 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tc.label}
                  </button>
                ))}
              </div>
            </div>

            {playOpponent !== 'local' && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-400">Play as</span>
                <div className="flex items-center gap-1 p-0.5 bg-slate-900/90 rounded-lg border border-white/10">
                  {(
                    [
                      { id: 'w', label: 'White' },
                      { id: 'b', label: 'Black' },
                    ] as const
                  ).map((side) => (
                    <button
                      key={side.id}
                      type="button"
                      onClick={() => {
                        setPlayerColor(side.id);
                        startNewPlayGame(side.id, playOpponent);
                      }}
                      className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        playerColor === side.id
                          ? 'bg-emerald-500 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {side.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}
        </SidePanel>
      );
    }

    if (activeTab === 'puzzles') {
      return (
        <SidePanel
          turn={puzzleState.turn}
          statusText={
            puzzleStatus === 'solved'
              ? 'Puzzle solved'
              : puzzleStatus === 'revealed'
              ? 'Solution shown'
              : puzzleStatus === 'wrong'
              ? 'Not the best move'
              : `${puzzleState.solverColor === 'w' ? 'White' : 'Black'} to move`
          }
          statusSubtext={
            puzzleStatus === 'wrong'
              ? 'Try another continuation or use Hint.'
              : puzzleStatus === 'solved'
              ? 'Clean tactic. Continue to the next puzzle.'
              : showPuzzleHint
              ? activePuzzle.hint
              : 'Find the strongest tactical sequence.'
          }
          isGameOver={puzzleStatus === 'solved' || puzzleStatus === 'revealed'}
          captured={puzzleState.captured}
          pieceStyle={settings.pieceStyle}
          moves={puzzleMoves}
          canUndo={puzzleMoves.length > 0 && puzzleStatus !== 'revealed'}
          canResign={puzzleStatus !== 'solved' && puzzleStatus !== 'revealed'}
          newGameLabel="Reset Puzzle"
          onNewGame={() => selectPuzzle(safePuzzleIdx)}
          onFlipBoard={() => setPuzzleFlipped((f) => !f)}
          onUndoMove={handlePuzzleUndo}
          onResign={handlePuzzleReveal}
          compactDrawer={compactDrawer}
        >
          <div className="space-y-3">
            {/* Academy vs Classics Source Switcher */}
            <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-900/90 border border-white/10">
              <button
                type="button"
                onClick={() => selectPuzzle(0, 'academy')}
                className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  puzzleSource === 'academy'
                    ? 'bg-emerald-500 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Academy ({academyPuzzleItems.length})
              </button>
              <button
                type="button"
                onClick={() => selectPuzzle(0, 'classics')}
                className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  puzzleSource === 'classics'
                    ? 'bg-emerald-500 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Classics ({classicPuzzleItems.length})
              </button>
            </div>

            {isShowingEmptyAcademy ? (
              <div className="rounded-lg bg-slate-900/75 border border-white/10 px-3 py-2 text-[11px] text-slate-300">
                No Coach puzzles published yet — showing Built-in Classics below.
              </div>
            ) : null}

            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100 truncate">
                {activePuzzle.title}
              </h3>
              <span className="text-xs font-mono-tabular text-slate-400 shrink-0">
                #{safePuzzleIdx + 1}/{activePuzzleList.length}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>{activePuzzle.subtitle}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">{activePuzzle.meta}</span>
              {activeCustomProgress && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`font-mono-tabular ${
                      activeCustomProgress.solved ? 'text-emerald-400 font-medium' : 'text-slate-400'
                    }`}
                  >
                    {activeCustomProgress.solved
                      ? `Solved (${activeCustomProgress.attempts} tries)`
                      : `${activeCustomProgress.attempts} tries`}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => selectPuzzle(safePuzzleIdx - 1)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Prev
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowPuzzleHint((h) => !h)}
                disabled={puzzleStatus === 'solved' || puzzleStatus === 'revealed'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-800 disabled:opacity-40 text-emerald-300 border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                <span>{showPuzzleHint ? 'Hide Hint' : 'Hint'}</span>
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => selectPuzzle(safePuzzleIdx + 1)}
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Next Puzzle
              </motion.button>
            </div>

            {authUser?.role === 'admin' && adminModeActive && (
              <button
                type="button"
                onClick={() => {
                  setRequestedAdminSubTab('studio');
                  setActiveTab('admin');
                  setMobileDrawerOpen(false);
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 border border-indigo-400/30 transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5 shrink-0" />
                <span>Edit / Add Puzzle</span>
              </button>
            )}
          </div>
        </SidePanel>
      );
    }

    if (activeTab === 'learn') {
      const lessonComplete = lessonMoves.length >= activeLesson.steps.length;

      return (
        <div
          className={`flex flex-col h-full overflow-hidden ${
            compactDrawer
              ? 'bg-transparent'
              : 'bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.65)]'
          }`}
        >
          {/* Sub-mode Toggle: Lessons vs Board Setup */}
          <div className="px-4 py-3 border-b border-white/[0.08] bg-slate-950/40">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-900/90 border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setLearnSubMode('lessons');
                  clearAnnotations();
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  learnSubMode === 'lessons'
                    ? 'bg-emerald-500 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Lessons</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLearnSubMode('editor');
                  clearAnnotations();
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  learnSubMode === 'editor'
                    ? 'bg-emerald-500 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Grid2x2 className="w-3.5 h-3.5" />
                <span>Board Setup</span>
              </button>
            </div>
          </div>

          {learnSubMode === 'lessons' ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <SidePanel
                turn={lessonState.turn}
                statusText={
                  lessonComplete
                    ? `${activeLesson.title} · Completed`
                    : lessonState.turn === activeLesson.playerColor
                    ? `Your move (${activeLesson.playerColor === 'w' ? 'White' : 'Black'})`
                    : 'Coach playing reply…'
                }
                statusSubtext={`Step ${Math.min(lessonMoves.length + 1, activeLesson.steps.length)} of ${activeLesson.steps.length}`}
                isGameOver={lessonComplete}
                captured={lessonState.captured}
                pieceStyle={settings.pieceStyle}
                moves={lessonMoves}
                canUndo={lessonMoves.length > 0}
                canResign={false}
                newGameLabel="Restart"
                onNewGame={() => selectLesson(lessonIdx)}
                onFlipBoard={() => setLessonFlipped((f) => !f)}
                onUndoMove={handleLessonUndo}
                onResign={() => {}}
                compactDrawer
              >
                <div className="space-y-3">
                  {/* Lesson Selector */}
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={lessonIdx}
                      onChange={(e) => selectLesson(Number(e.target.value))}
                      aria-label="Select chess lesson"
                      className="flex-1 min-w-0 px-2.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-slate-100 border border-white/15 focus:outline-none focus:border-emerald-400 cursor-pointer"
                    >
                      {CHESS_LESSONS.map((lesson, idx) => (
                        <option key={lesson.id} value={idx}>
                          {idx + 1}. {lesson.title} ({lesson.category})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{activeLesson.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeLesson.level}</span>
                    <span aria-hidden="true">·</span>
                    <span>Play as {activeLesson.playerColor === 'w' ? 'White' : 'Black'}</span>
                  </div>

                  {/* Step Explanation Callout */}
                  <div
                    className={`rounded-xl p-3 border text-xs leading-relaxed ${
                      lessonFeedback.kind === 'wrong'
                        ? 'bg-red-500/10 border-red-500/30 text-red-200'
                        : lessonFeedback.kind === 'complete'
                        ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-100'
                        : 'bg-slate-900/80 border-white/10 text-slate-200'
                    }`}
                  >
                    {lessonFeedback.text}
                  </div>

                  {/* Hint & Next Lesson */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLessonShowHint((h) => !h)}
                      disabled={lessonComplete || lessonState.turn !== activeLesson.playerColor}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-800 disabled:opacity-40 text-emerald-300 border border-white/10 transition-colors cursor-pointer"
                    >
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span>{lessonShowHint ? 'Hide Hint' : 'Hint'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectLesson(lessonIdx + 1)}
                      className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
                    >
                      Next Lesson
                    </button>
                  </div>
                </div>
              </SidePanel>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto chess-scroll p-4">
              <PositionEditor
                selectedTool={editorTool}
                onSelectTool={setEditorTool}
                turn={editorTurn}
                onChangeTurn={setEditorTurn}
                castling={editorCastling}
                onToggleCastling={(flag) =>
                  setEditorCastling((prev) => ({ ...prev, [flag]: !prev[flag] }))
                }
                fenString={editorFen}
                fenError={editorFenError}
                validationError={editorValidationError}
                pieceStyle={settings.pieceStyle}
                onLoadFenString={handleEditorLoadFen}
                onClearBoard={() => {
                  setEditorGrid(createEmptyGrid());
                  setEditorValidationError(null);
                }}
                onResetStandard={() => {
                  setEditorGrid(fenToGrid(STANDARD_FEN));
                  setEditorTurn('w');
                  setEditorCastling({ K: true, Q: true, k: true, q: true });
                  setEditorValidationError(null);
                  setEditorFenError(null);
                }}
                onPlayFromHere={handlePlayFromEditor}
                onAnalyzeFromHere={handleAnalyzeFromEditor}
              />
            </div>
          )}
        </div>
      );
    }

    return (
      <SidePanel
        turn={analyzeState.turn}
        statusText={analyzeState.status.headline}
        statusSubtext={
          analyzeState.status.subtext || 'Play moves for either side or annotate lines.'
        }
        isGameOver={analyzeState.status.isOver}
        captured={analyzeState.captured}
        pieceStyle={settings.pieceStyle}
        moves={analyzeMoves}
        activePlyIndex={analyzeCursor > 0 ? analyzeCursor - 1 : -1}
        canSelectMoves
        onSelectPly={(plyIdx) => setAnalyzeCursor(plyIdx + 1)}
        moveNotes={analyzeMoveNotes}
        onChangeMoveNote={(ply, note) =>
          setAnalyzeMoveNotes((prev) => ({ ...prev, [ply]: note }))
        }
        onExportAnnotatedPgn={() => {
          const pgn = buildAnnotatedPgn(analyzeInitialFen, analyzeMoves, analyzeMoveNotes);
          downloadPgnFile(pgn, 'pure-chess-analysis.pgn');
        }}
        canUndo={analyzeCursor > 0}
        canResign={false}
        newGameLabel="New Game"
        onNewGame={handleAnalyzeReset}
        onFlipBoard={() => setAnalyzeFlipped((f) => !f)}
        onUndoMove={handleAnalyzeUndo}
        onResign={() => {}}
        compactDrawer={compactDrawer}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAnalyzeCursor(0)}
                disabled={analyzeCursor === 0}
                aria-label="First position"
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 disabled:opacity-35 text-slate-200 border border-white/10 transition-colors cursor-pointer"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setAnalyzeCursor((c) => Math.max(0, c - 1))}
                disabled={analyzeCursor === 0}
                aria-label="Previous move"
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 disabled:opacity-35 text-slate-200 border border-white/10 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setAnalyzeCursor((c) => Math.min(analyzeMoves.length, c + 1))
                }
                disabled={analyzeCursor >= analyzeMoves.length}
                aria-label="Next move"
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 disabled:opacity-35 text-slate-200 border border-white/10 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setAnalyzeCursor(analyzeMoves.length)}
                disabled={analyzeCursor >= analyzeMoves.length}
                aria-label="Last move"
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 disabled:opacity-35 text-slate-200 border border-white/10 transition-colors cursor-pointer"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs font-mono-tabular text-slate-300">
              Eval <span className="font-semibold text-white">{analyzeState.evalLabel}</span>
            </div>
          </div>

          <form onSubmit={handleLoadFen} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={fenInput}
                onChange={(e) => setFenInput(e.target.value)}
                aria-label="FEN position string"
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-[11px] font-mono-tabular bg-slate-950/80 text-slate-200 border border-white/10 focus:outline-none focus:border-emerald-400"
              />
              <button
                type="submit"
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Load
              </button>
              <button
                type="button"
                onClick={handleCopyFen}
                aria-label="Copy FEN"
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-white/10 transition-colors shrink-0 cursor-pointer"
              >
                {copiedFen ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            {fenError && <p className="text-[11px] text-red-400">{fenError}</p>}
          </form>
        </div>
      </SidePanel>
    );
  };

  // Show loading or strict Private Academy Gatekeeper when unauthenticated
  if (!authStatus) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#090D16] text-slate-200 px-4">
        {authLoadError ? (
          <div className="max-w-sm rounded-2xl bg-slate-900/80 border border-white/15 p-6 text-center space-y-3">
            <p className="text-sm font-medium text-red-300">{authLoadError}</p>
            <button
              type="button"
              onClick={fetchAuthStatus}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-white cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <div className="text-sm text-slate-400">Connecting to Pure Chess Academy…</div>
        )}
      </div>
    );
  }

  if (!authToken || !authUser) {
    return (
      <AcademyAuthGate
        noticeMessage={authNotice}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const isScrollableTab = activeTab === 'home' || activeTab === 'admin';

  return (
    <div
      className={`relative flex flex-col bg-[#0F1014] text-slate-100 md:pl-[76px] lg:pl-[232px] ${
        isScrollableTab
          ? 'min-h-[100dvh] pb-16 md:pb-0 overflow-x-hidden'
          : 'h-[100dvh] pb-14 overflow-hidden md:h-auto md:min-h-screen md:pb-0 md:overflow-x-hidden md:overflow-y-visible'
      }`}
    >
      <SidebarNav
        activeTab={activeTab}
        user={authUser}
        adminModeActive={adminModeActive}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setAnnotationMode(false);
          clearAnnotations();
        }}
        onOpenFriends={() => setFriendsDrawerOpen(true)}
        onlineClassmatesCount={
          classmates.filter((c) => c.presence_status !== 'offline').length
        }
        pendingSocialCount={
          classmates.filter(
            (c) =>
              c.friendship_status === 'pending' &&
              c.friendship_direction === 'incoming'
          ).length +
          challenges.filter(
            (ch) => ch.status === 'pending' && ch.challenged_id === authUser.id
          ).length
        }
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSystemHealth={
          authUser.role === 'admin' && adminModeActive
            ? () => {
                setRequestedAdminSubTab('health');
                setActiveTab('admin');
              }
            : undefined
        }
        onLogout={handleLogout}
      />

      {/* Incoming Live Match Challenge Toast Banner */}
      {(() => {
        const incoming = challenges.find(
          (c) => c.status === 'pending' && c.challenged_id === authUser.id
        );
        if (!incoming) return null;
        return (
          <div className="relative z-20 mx-3 mt-2 sm:mx-6 rounded-xl bg-[#18181B] border border-emerald-500/40 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5 text-xs">
              <Swords className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong className="text-zinc-100">{incoming.challenger_name}</strong>{' '}
                <span className="text-zinc-300">
                  challenged you to a {TIME_CONTROL_LABELS[incoming.time_control]} match!
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleRespondChallenge(incoming.id, true)}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                Accept &amp; Play
              </button>
              <button
                type="button"
                onClick={() => handleRespondChallenge(incoming.id, false)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 cursor-pointer"
              >
                Decline
              </button>
            </div>
          </div>
        );
      })()}

      {/* Main Chess Workspace */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex-1 flex flex-col min-h-0"
      >
        {/* Main Responsive Arena */}
        {activeTab === 'home' ? (
          <main className="flex-1 w-full">
            <HomeDashboard
              token={authToken}
              user={authUser}
              adminModeActive={adminModeActive}
              boardTheme={settings.boardTheme}
              pieceStyle={settings.pieceStyle}
              showCoordinates={settings.showCoordinates}
              latestPuzzle={homeDailyPuzzle}
              nextLesson={activeLesson}
              nextLessonIndex={lessonIdx}
              studentProgress={studentProgress}
              recentGames={recentGames}
              classmates={classmates}
              activeMatchRoomId={activeMatchRoomId}
              activeMatchOpponentLabel={activeMatchOpponentLabel}
              selectedDmPeerId={selectedDmPeerId}
              onSelectDmPeerId={setSelectedDmPeerId}
              onOpenFriendsDrawer={() => setFriendsDrawerOpen(true)}
              onOpenModerationQueue={handleOpenModerationQueue}
              onTogglePeerChatDisabled={handleAdminToggleStudentChat}
              onDeleteMessage={handleAdminDeleteSocialMessage}
              onStartMatch={handleQuickStartMatch}
              onOpenDailyPuzzle={handleOpenDailyPuzzle}
              onOpenLesson={handleOpenLessonFromHome}
              onReviewGame={handleReviewAcademyGame}
            />
          </main>
        ) : activeTab === 'admin' && authUser.role === 'admin' && adminModeActive ? (
          <main className="flex-1 max-w-[1160px] w-full mx-auto px-3 sm:px-6 py-4 md:py-7">
            <AdminPanel
              token={authToken}
              boardTheme={settings.boardTheme}
              pieceStyle={settings.pieceStyle}
              showCoordinates={settings.showCoordinates}
              requestedSubTab={requestedAdminSubTab}
              onClearRequestedSubTab={() => setRequestedAdminSubTab(null)}
              onOpenFenInAnalyze={handleLoadFenToAnalyze}
              onPuzzlesChanged={fetchAcademyPuzzles}
            />
          </main>
        ) : (
        <main className="flex-1 min-h-0 max-w-[1160px] w-full mx-auto px-2 sm:px-6 py-1.5 md:py-7 flex flex-col justify-center md:block">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_370px] gap-4 lg:gap-6 items-start">
            {/* Left Column: Board + Compact Player Bars + Coaching Toolbar */}
            <div className="flex flex-col items-center w-full">
              <div className="w-full max-w-[min(calc(100vw-16px),calc(100dvh-276px))] md:max-w-[min(74vh,600px)] flex flex-col gap-1.5 md:gap-2.5">
                {/* Top Player Bar */}
                <div className="flex items-center justify-between px-1 h-6 md:h-7">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-3 h-3 rounded-sm border shrink-0 ${
                        topColor === 'w'
                          ? 'bg-[#F1F5F9] border-white/50'
                          : 'bg-slate-800 border-slate-500'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="text-xs sm:text-sm font-medium text-slate-200 truncate">
                      {getPlayerLabel(topColor)}
                    </span>
                    {getSideAdvantage(topColor) && (
                      <span className="text-xs font-mono-tabular font-semibold text-emerald-400">
                        {getSideAdvantage(topColor)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isEditorActive && !isCurrentGameOver && currentTurn === topColor && (
                      <span className="text-[11px] sm:text-xs font-medium text-emerald-400">
                        {activeTab === 'play' && isBotThinking ? 'Thinking…' : 'Active turn'}
                      </span>
                    )}
                    {activeTab === 'play' && playTimeControl !== 'untimed' && (
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-mono-tabular font-semibold border ${
                          !playState.status.isOver && currentTurn === topColor
                            ? 'bg-zinc-800 text-white border-emerald-500/40'
                            : 'bg-zinc-900 text-zinc-400 border-white/10'
                        }`}
                      >
                        {formatClock(playClocks[topColor])}
                      </span>
                    )}
                  </div>
                </div>

                {/* Board + Optional Eval Bar */}
                <div className="relative flex items-stretch gap-2 w-full">
                  {showEvalBar && (
                    <EvalBar
                      centipawns={activeEvalData.cp}
                      isCheckmate={activeEvalData.mate}
                      turn={activeEvalData.turn}
                      flipped={currentFlipped}
                      label={activeEvalData.label}
                    />
                  )}

                  <div className="relative flex-1 min-w-0">
                    {activeTab === 'play' && (
                      <Chessboard
                        fen={playState.fen}
                        flipped={playFlipped}
                        interactive={!playState.status.isOver && !isBotThinking}
                        allowedColor={playOpponent === 'local' ? 'both' : playerColor}
                        boardTheme={settings.boardTheme}
                        pieceStyle={settings.pieceStyle}
                        showLegalMoves={settings.showLegalMoves}
                        showCoordinates={settings.showCoordinates}
                        autoQueen={settings.autoQueen}
                        lastMove={playState.lastMove}
                        arrows={arrows}
                        highlights={highlights}
                        annotationMode={annotationMode}
                        annotationColor={annotationColor}
                        onToggleArrow={handleToggleArrow}
                        onToggleHighlight={handleToggleHighlight}
                        onMove={handlePlayMove}
                      />
                    )}

                    {activeTab === 'puzzles' && (
                      <Chessboard
                        fen={puzzleState.fen}
                        flipped={puzzleFlipped}
                        interactive={
                          puzzleStatus !== 'solved' &&
                          puzzleStatus !== 'revealed' &&
                          puzzleMoves.length % 2 === 0
                        }
                        allowedColor={puzzleState.solverColor}
                        boardTheme={settings.boardTheme}
                        pieceStyle={settings.pieceStyle}
                        showLegalMoves={settings.showLegalMoves}
                        showCoordinates={settings.showCoordinates}
                        autoQueen={settings.autoQueen}
                        lastMove={puzzleState.lastMove}
                        hintHighlight={puzzleHintSquares}
                        arrows={arrows}
                        highlights={highlights}
                        annotationMode={annotationMode}
                        annotationColor={annotationColor}
                        onToggleArrow={handleToggleArrow}
                        onToggleHighlight={handleToggleHighlight}
                        onMove={handlePuzzleMove}
                      />
                    )}

                    {activeTab === 'learn' && learnSubMode === 'lessons' && (
                      <Chessboard
                        fen={lessonState.fen}
                        flipped={lessonFlipped}
                        interactive={
                          lessonMoves.length < activeLesson.steps.length &&
                          lessonState.turn === activeLesson.playerColor
                        }
                        allowedColor={activeLesson.playerColor}
                        boardTheme={settings.boardTheme}
                        pieceStyle={settings.pieceStyle}
                        showLegalMoves={settings.showLegalMoves}
                        showCoordinates={settings.showCoordinates}
                        autoQueen={settings.autoQueen}
                        lastMove={lessonState.lastMove}
                        hintHighlight={lessonHintSquares}
                        arrows={arrows}
                        highlights={highlights}
                        annotationMode={annotationMode}
                        annotationColor={annotationColor}
                        onToggleArrow={handleToggleArrow}
                        onToggleHighlight={handleToggleHighlight}
                        onMove={handleLessonMove}
                      />
                    )}

                    {activeTab === 'learn' && learnSubMode === 'editor' && (
                      <Chessboard
                        fen={STANDARD_FEN}
                        customBoard={editorGrid}
                        flipped={editorFlipped}
                        interactive={false}
                        boardTheme={settings.boardTheme}
                        pieceStyle={settings.pieceStyle}
                        showCoordinates={settings.showCoordinates}
                        editorMode
                        onEditorSquareClick={handleEditorSquareClick}
                        onEditorMovePiece={handleEditorMovePiece}
                        onMove={() => false}
                      />
                    )}

                    {activeTab === 'analyze' && (
                      <Chessboard
                        fen={analyzeState.fen}
                        flipped={analyzeFlipped}
                        interactive={!analyzeState.status.isOver}
                        allowedColor="both"
                        boardTheme={settings.boardTheme}
                        pieceStyle={settings.pieceStyle}
                        showLegalMoves={settings.showLegalMoves}
                        showCoordinates={settings.showCoordinates}
                        autoQueen={settings.autoQueen}
                        lastMove={analyzeState.lastMove}
                        arrows={arrows}
                        highlights={highlights}
                        annotationMode={annotationMode}
                        annotationColor={annotationColor}
                        onToggleArrow={handleToggleArrow}
                        onToggleHighlight={handleToggleHighlight}
                        onMove={handleAnalyzeMove}
                      />
                    )}

                    {/* Modern Game Over Modal */}
                    <AnimatePresence>
                      {showGameOverModal && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs rounded-xl p-4"
                          role="dialog"
                          aria-modal="true"
                          aria-label="Game Over"
                        >
                          <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.94, y: 8 }}
                            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                            className="relative w-full max-w-[310px] rounded-2xl bg-slate-900/90 backdrop-blur-md border border-white/15 p-5 sm:p-6 shadow-2xl text-center"
                          >
                            <button
                              type="button"
                              onClick={() => setGameOverModalDismissed(true)}
                              aria-label="Close game over summary"
                              className="absolute top-3 right-3 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>

                            <div className="mx-auto mb-3 w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center text-emerald-400">
                              <Trophy className="w-5 h-5" />
                            </div>

                            <h3 className="text-base sm:text-lg font-bold text-slate-50 tracking-tight">
                              {playState.status.headline}
                            </h3>
                            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                              {playState.status.subtext}
                            </p>

                            <div className="mt-2.5 text-xs font-mono-tabular text-slate-400">
                              {Math.ceil(playPgnHistory.length / 2)}{' '}
                              {Math.ceil(playPgnHistory.length / 2) === 1 ? 'move' : 'moves'} played
                            </div>

                            <div className="mt-4 flex flex-col gap-2">
                              <motion.button
                                type="button"
                                whileHover={{ y: -1 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => startNewPlayGame()}
                                className="flex items-center justify-center gap-2 w-full min-h-[42px] py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-indigo-500 shadow-lg shadow-emerald-950/40 cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Play Again</span>
                              </motion.button>

                              <div className="grid grid-cols-2 gap-2">
                                <motion.button
                                  type="button"
                                  whileHover={{ y: -1 }}
                                  whileTap={{ scale: 0.97 }}
                                  onClick={handleAnalyzePlayedGame}
                                  className="flex items-center justify-center gap-1.5 min-h-[40px] py-2 px-3 rounded-xl text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-white/10 cursor-pointer"
                                >
                                  <Microscope className="w-3.5 h-3.5" />
                                  <span>Analyze</span>
                                </motion.button>
                                <motion.button
                                  type="button"
                                  whileHover={{ y: -1 }}
                                  whileTap={{ scale: 0.97 }}
                                  onClick={() => setGameOverModalDismissed(true)}
                                  className="min-h-[40px] py-2 px-3 rounded-xl text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-white/10 cursor-pointer"
                                >
                                  View Board
                                </motion.button>
                              </div>
                            </div>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Bottom Player Bar */}
                <div className="flex items-center justify-between px-1 h-6 md:h-7">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-3 h-3 rounded-sm border shrink-0 ${
                        bottomColor === 'w'
                          ? 'bg-[#F1F5F9] border-white/50'
                          : 'bg-slate-800 border-slate-500'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="text-xs sm:text-sm font-medium text-slate-200 truncate">
                      {getPlayerLabel(bottomColor)}
                    </span>
                    {getSideAdvantage(bottomColor) && (
                      <span className="text-xs font-mono-tabular font-semibold text-emerald-400">
                        {getSideAdvantage(bottomColor)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isEditorActive && !isCurrentGameOver && currentTurn === bottomColor && (
                      <span className="text-[11px] sm:text-xs font-medium text-emerald-400">
                        {activeTab === 'play' && isBotThinking ? 'Thinking…' : 'Active turn'}
                      </span>
                    )}
                    {activeTab === 'play' && playTimeControl !== 'untimed' && (
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-mono-tabular font-semibold border ${
                          !playState.status.isOver && currentTurn === bottomColor
                            ? 'bg-zinc-800 text-white border-emerald-500/40'
                            : 'bg-zinc-900 text-zinc-400 border-white/10'
                        }`}
                      >
                        {formatClock(playClocks[bottomColor])}
                      </span>
                    )}
                  </div>
                </div>

                {/* Coaching Annotation & Best-Move Toolbar */}
                {!isEditorActive && (
                  <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => setAnnotationMode((m) => !m)}
                        aria-pressed={annotationMode}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer touch-manipulation ${
                          annotationMode
                            ? 'bg-indigo-500/25 border-indigo-400 text-indigo-200'
                            : 'bg-slate-900/75 border-white/10 text-slate-300 hover:bg-slate-800'
                        }`}
                        title="Draw arrows & highlights (or right-click on desktop)"
                      >
                        <Pencil className="w-3 h-3 shrink-0" />
                        <span>{annotationMode ? 'Drawing' : 'Arrows'}</span>
                      </button>

                      {/* Color swatches */}
                      <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-slate-900/75 border border-white/10">
                        {(
                          [
                            { id: 'green', bg: 'bg-emerald-400' },
                            { id: 'red', bg: 'bg-red-400' },
                            { id: 'yellow', bg: 'bg-amber-400' },
                          ] as const
                        ).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setAnnotationColor(c.id)}
                            aria-label={`${c.id} arrow color`}
                            className={`w-3.5 h-3.5 rounded-full ${c.bg} transition-transform cursor-pointer ${
                              annotationColor === c.id
                                ? 'ring-2 ring-white scale-110'
                                : 'opacity-50 hover:opacity-85'
                            }`}
                          />
                        ))}
                      </div>

                      {(arrows.length > 0 || highlights.length > 0) && (
                        <button
                          type="button"
                          onClick={clearAnnotations}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-900/75 hover:bg-slate-800 text-slate-300 border border-white/10 transition-colors cursor-pointer touch-manipulation"
                        >
                          <Eraser className="w-3 h-3" />
                          <span className="hidden sm:inline">Clear Arrows</span>
                          <span className="sm:hidden">Clear</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {bestMoveLabel && (
                        <span className="text-[11px] font-mono-tabular font-semibold text-emerald-400 mr-1">
                          {bestMoveLabel}
                        </span>
                      )}

                      {activeTab === 'play' && playOpponent !== 'friend' && (
                        <button
                          type="button"
                          onClick={() => setShowPlayEval((s) => !s)}
                          aria-pressed={showPlayEval}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer touch-manipulation ${
                            showPlayEval
                              ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                              : 'bg-slate-900/75 border-white/10 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <BarChart3 className="w-3 h-3" />
                          <span className="hidden sm:inline">Eval</span>
                        </button>
                      )}

                      {((activeTab === 'play' && playOpponent !== 'friend') ||
                        activeTab === 'analyze') && (
                        <button
                          type="button"
                          onClick={handleShowBestMove}
                          disabled={
                            isCurrentGameOver ||
                            (activeTab === 'play' &&
                              playOpponent !== 'local' &&
                              playState.turn !== playerColor)
                          }
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer touch-manipulation"
                        >
                          <Sparkles className="w-3 h-3 shrink-0" />
                          <span>Best Move</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Compact Mobile Contextual Prompt for Learn & Editor */}
                {activeTab === 'learn' && (
                  <div className="md:hidden flex items-center justify-between gap-2 px-1 pt-0.5 text-xs">
                    {learnSubMode === 'lessons' ? (
                      <>
                        <div className="truncate text-slate-300 font-medium">
                          {activeLesson.title} · {lessonFeedback.text}
                        </div>
                        <button
                          type="button"
                          onClick={() => setMobileDrawerOpen(true)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0 touch-manipulation"
                        >
                          Lessons
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="truncate text-slate-300 font-medium">
                          Tap pieces &amp; setup inside Panel
                        </div>
                        <button
                          type="button"
                          onClick={() => setMobileDrawerOpen(true)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0 touch-manipulation"
                        >
                          Palette
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column (Desktop/Tablet >=768px): Frosted Glass Side Panel */}
            <div className="hidden md:block w-full md:h-[min(calc(74vh+92px),692px)]">
              {renderActiveSidePanel(false)}
            </div>
          </div>
        </main>
        )}

        {/* Mobile Compact Board Action Bar (<768px, sits cleanly above mobile bottom nav) */}
        {!isScrollableTab && (
        <div
          className="md:hidden shrink-0 border-t border-white/10 bg-[#141418]/95 backdrop-blur-md px-2 py-0.5"
          role="toolbar"
          aria-label="Game actions"
        >
          <div className="grid grid-cols-5 gap-1">
            <button
              type="button"
              onClick={handleCurrentNew}
              className="flex flex-col items-center justify-center min-h-[44px] rounded-xl text-emerald-400 active:bg-white/5 touch-manipulation"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-[10px] font-medium mt-0.5 leading-none">
                {activeTab === 'puzzles' || activeTab === 'learn' ? 'Reset' : 'New'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCurrentUndo}
              disabled={!currentCanUndo}
              className="flex flex-col items-center justify-center min-h-[44px] rounded-xl text-slate-200 disabled:opacity-35 active:bg-white/5 touch-manipulation"
            >
              <Undo2 className="w-4 h-4" />
              <span className="text-[10px] font-medium mt-0.5 leading-none">Undo</span>
            </button>

            <button
              type="button"
              onClick={handleCurrentFlip}
              className="flex flex-col items-center justify-center min-h-[44px] rounded-xl text-slate-200 active:bg-white/5 touch-manipulation"
            >
              <ArrowUpDown className="w-4 h-4" />
              <span className="text-[10px] font-medium mt-0.5 leading-none">Flip</span>
            </button>

            <button
              type="button"
              onClick={handleCurrentResign}
              disabled={!currentCanResign}
              className="flex flex-col items-center justify-center min-h-[44px] rounded-xl text-slate-200 disabled:opacity-35 active:bg-white/5 touch-manipulation"
            >
              <Flag className="w-4 h-4" />
              <span className="text-[10px] font-medium mt-0.5 leading-none">
                {activeTab === 'puzzles' ? 'Solve' : 'Resign'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="flex flex-col items-center justify-center min-h-[44px] rounded-xl text-slate-100 bg-white/[0.06] active:bg-white/10 touch-manipulation"
            >
              <List className="w-4 h-4" />
              <span className="text-[10px] font-medium mt-0.5 leading-none font-mono-tabular">
                {activeTab === 'learn' ? 'Tools' : `Moves (${currentMovesCount})`}
              </span>
            </button>
          </div>
        </div>
        )}
      </motion.div>

      {/* Mobile Slide-Up Drawer */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setMobileDrawerOpen(false)}
            className="md:hidden fixed inset-0 z-50 flex items-end bg-slate-950/70 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-label="Match panel and coaching tools"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 38 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-h-[84dvh] flex flex-col bg-slate-900/95 backdrop-blur-xl border-t border-white/15 rounded-t-3xl overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 pt-3 pb-2 border-b border-white/[0.08]">
                <span className="w-9 h-1 rounded-full bg-white/20 mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
                <span className="text-xs font-semibold text-slate-300 pt-1">
                  {activeTab === 'learn' ? 'Learn & Board Setup' : 'Match Panel'}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="Close panel"
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {renderActiveSidePanel(true)}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live AI + Human Coach Assistant Drawer on Play, Puzzles & Analyze */}
      {(activeTab === 'play' || activeTab === 'puzzles' || activeTab === 'analyze') && (
        <CoachAssistantDrawer
          token={authToken}
          user={authUser}
          mode={activeTab}
          currentFen={
            activeTab === 'play'
              ? playState.fen
              : activeTab === 'puzzles'
              ? puzzleState.fen
              : analyzeState.fen
          }
          moves={
            activeTab === 'play'
              ? playPgnHistory
              : activeTab === 'puzzles'
              ? puzzleMoves
              : analyzeMoves.slice(0, analyzeCursor)
          }
          contextLabel={
            activeTab === 'play'
              ? `Play · ${TIME_CONTROL_LABELS[playTimeControl]}`
              : activeTab === 'puzzles'
              ? `Puzzle · ${activePuzzle.title}`
              : 'Analyze Board'
          }
          puzzleHint={activeTab === 'puzzles' ? activePuzzle.hint : undefined}
          onLoadPositionToAnalyze={handleLoadFenToAnalyze}
        />
      )}

      {/* Friends & Classmates Directory Slide-Over Drawer */}
      <FriendsDrawer
        open={friendsDrawerOpen}
        onClose={() => setFriendsDrawerOpen(false)}
        classmates={classmates}
        challenges={challenges}
        currentUserId={authUser.id}
        onSendFriendRequest={handleSendFriendRequest}
        onRespondFriendRequest={handleRespondFriendRequest}
        onChallengeFriend={handleChallengeFriend}
        onRespondChallenge={handleRespondChallenge}
        onOpenDirectMessage={handleOpenDirectMessage}
      />

      {/* Customization Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        userRole={authUser.role}
        adminModeActive={adminModeActive}
        onToggleAdminMode={handleToggleAdminMode}
        onLogout={handleLogout}
        onUpdate={updateSettings}
        onReset={resetSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
