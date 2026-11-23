import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus,
  CheckCircle2,
  XCircle,
  ShieldOff,
  Trash2,
  KeyRound,
  RefreshCw,
  Database,
  Copy,
  Check,
  Puzzle,
  Users,
  Radio,
  Play,
  CircleDot,
  Undo2,
  RotateCcw,
  Shuffle,
  Activity,
  MessageSquare,
  Send,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Microscope,
} from 'lucide-react';
import { Chessboard, type CustomBoardGrid } from './Chessboard';
import { PositionEditor, type EditorTool } from './PositionEditor';
import { MiniFenBoard } from './CoachAssistantDrawer';
import { SUPABASE_SETUP_SQL } from '../data/supabaseSql';
import { sentinelAgent } from '../lib/autoHealAgent';
import type { BoardThemeId, PieceStyleId } from '../types/settings';
import type { AdminOverviewPayload, CoachMessageRecord } from '../types/academy';

export type AdminSubTab =
  | 'requests'
  | 'students'
  | 'studio'
  | 'inbox'
  | 'moderation'
  | 'health';

interface AdminPanelProps {
  token: string;
  boardTheme: BoardThemeId;
  pieceStyle: PieceStyleId;
  showCoordinates: boolean;
  requestedSubTab?: AdminSubTab | null;
  onClearRequestedSubTab?: () => void;
  onOpenFenInAnalyze?: (fen: string) => void;
  onPuzzlesChanged: () => void;
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
        if (c < 8) grid[r][c] = { color, type };
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
      if (!cell) empty++;
      else {
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

export const AdminPanel: React.FC<AdminPanelProps> = ({
  token,
  boardTheme,
  pieceStyle,
  showCoordinates,
  requestedSubTab,
  onClearRequestedSubTab,
  onOpenFenInAnalyze,
  onPuzzlesChanged,
}) => {
  const [subTab, setSubTab] = useState<AdminSubTab>(requestedSubTab || 'requests');
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Sentinel & Diagnostics state
  const sentinel = useSyncExternalStore(sentinelAgent.subscribe, sentinelAgent.getSnapshot);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [runningDiag, setRunningDiag] = useState(false);
  const [diagSummary, setDiagSummary] = useState<string | null>(null);

  // Coach Inbox state
  const [inboxMessages, setInboxMessages] = useState<CoachMessageRecord[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [coachReplyInput, setCoachReplyInput] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    if (requestedSubTab) {
      setSubTab(requestedSubTab);
      onClearRequestedSubTab?.();
    }
  }, [requestedSubTab, onClearRequestedSubTab]);

  // Student Account Manager form state
  const [newLoginId, setNewLoginId] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  // In-memory only (current Admin session) so newly issued/reset credentials can be copied cleanly
  const [issuedCredentials, setIssuedCredentials] = useState<Record<string, string>>({});
  const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);
  const [copiedBulk, setCopiedBulk] = useState(false);

  // Admin Puzzle Studio state
  const [studioGrid, setStudioGrid] = useState<CustomBoardGrid>(() =>
    fenToGrid('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1')
  );
  const [studioTurn, setStudioTurn] = useState<Color>('w');
  const [studioCastling, setStudioCastling] = useState({ K: false, Q: false, k: false, q: false });
  const [studioTool, setStudioTool] = useState<EditorTool>({
    kind: 'piece',
    color: 'w',
    type: 'r',
  });
  const [studioMode, setStudioMode] = useState<'setup' | 'record' | 'test'>('setup');
  const [recordedMoves, setRecordedMoves] = useState<{ uci: string; san: string }[]>([]);
  const [testMoves, setTestMoves] = useState<string[]>([]);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);
  const [puzzleTitle, setPuzzleTitle] = useState('');
  const [puzzleDifficulty, setPuzzleDifficulty] = useState('Intermediate');
  const [puzzleNotes, setPuzzleNotes] = useState('');
  const [studioFenError, setStudioFenError] = useState<string | null>(null);
  const [studioValidationError, setStudioValidationError] = useState<string | null>(null);
  const [publishingPuzzle, setPublishingPuzzle] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  const generatePasscode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = new Uint8Array(8);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  };

  const fetchOverview = useCallback(async () => {
    try {
      const [ovRes, msgRes] = await Promise.all([
        fetch('/api/admin/overview', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/coach/messages', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (ovRes.ok) {
        const data = (await ovRes.json()) as AdminOverviewPayload;
        setOverview(data);
      }
      if (msgRes.ok) {
        const msgData = (await msgRes.json()) as { messages?: CoachMessageRecord[] };
        if (msgData.messages) setInboxMessages(msgData.messages);
      }
    } catch {
      // Ignore transient poll errors
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOverview();
    const interval = window.setInterval(fetchOverview, 3000);
    return () => window.clearInterval(interval);
  }, [fetchOverview]);

  useEffect(() => {
    if (!selectedStudentId && overview?.students && overview.students.length > 0) {
      const withMsgs = overview.students.find((s) =>
        inboxMessages.some((m) => m.student_id === s.id)
      );
      setSelectedStudentId(withMsgs?.id ?? overview.students[0].id);
    }
  }, [overview?.students, inboxMessages, selectedStudentId]);

  const handleSendCoachReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !coachReplyInput.trim()) return;
    setSendingReply(true);
    setActionError(null);
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
            studentId: selectedStudentId,
            messageText: coachReplyInput.trim(),
          }),
        },
        'Admin Coach Reply'
      );
      const data = (await res.json().catch(() => ({}))) as {
        message?: CoachMessageRecord;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Failed to send reply.');
      if (data.message) {
        setInboxMessages((prev) => [...prev, data.message!]);
      }
      setCoachReplyInput('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to send reply.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleRunDiagnostics = async () => {
    setRunningDiag(true);
    setDiagSummary(null);
    try {
      const chessCheck = new Chess(STANDARD_FEN);
      const legalCount = chessCheck.moves().length;
      const res = await sentinelAgent.resilientFetch(
        '/api/auth/status',
        undefined,
        'System Health Ping'
      );
      const ok = res.ok && legalCount === 20;
      sentinelAgent.touchHeartbeat();
      setDiagSummary(
        ok
          ? `All checks passed: Chess engine (${legalCount} opening moves verified) · Backend HTTP ${res.status} · Storage: ${overview?.storageMode ?? 'active'}.`
          : `Backend ping returned HTTP ${res.status}. Review server status.`
      );
    } catch (err) {
      sentinelAgent.reportUnresolved(
        'session_network',
        'Manual health ping failed',
        err instanceof Error ? err.message : 'Unable to reach /api/auth/status',
        'Diagnostics probe detected unreachable backend'
      );
      setDiagSummary('Diagnostics detected a backend connectivity issue and logged it below.');
    } finally {
      setRunningDiag(false);
    }
  };

  const postAdminAction = async <T = Record<string, unknown>>(
    url: string,
    method = 'POST',
    body?: unknown
  ): Promise<T> => {
    setActionError(null);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Action failed.');
    }
    await fetchOverview();
    return data;
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingStudent(true);
    setActionError(null);
    const createdPass = newPassword;
    try {
      const result = await postAdminAction<{ user?: { id: string } }>(
        '/api/admin/students',
        'POST',
        {
          loginId: newLoginId,
          fullName: newFullName,
          password: createdPass,
        }
      );
      if (result.user?.id) {
        setIssuedCredentials((prev) => ({
          ...prev,
          [result.user!.id]: createdPass,
        }));
      }
      setNewLoginId('');
      setNewFullName('');
      setNewPassword('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to create student.');
    } finally {
      setCreatingStudent(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    const nextPass = resetPasswordValue;
    try {
      await postAdminAction(`/api/admin/students/${userId}/password`, 'PATCH', {
        password: nextPass,
      });
      setIssuedCredentials((prev) => ({ ...prev, [userId]: nextPass }));
      setResetTargetId(null);
      setResetPasswordValue('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Password reset failed.');
    }
  };

  const handleCopyStudentCredentials = async (st: {
    id: string;
    login_id: string;
    full_name: string;
  }) => {
    const pass = issuedCredentials[st.id];
    const text = pass
      ? `Pure Chess Academy · ${st.full_name}\nLogin ID: ${st.login_id}\nPassword: ${pass}`
      : `Pure Chess Academy · ${st.full_name}\nLogin ID: ${st.login_id}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStudentId(st.id);
      window.setTimeout(() => setCopiedStudentId(null), 1600);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleCopyAllCredentials = async () => {
    if (!overview) return;
    const lines = overview.students.map((st) => {
      const pass = issuedCredentials[st.id];
      return pass
        ? `${st.full_name} — Login ID: ${st.login_id} | Password: ${pass}`
        : `${st.full_name} — Login ID: ${st.login_id}`;
    });
    if (lines.length === 0) return;
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedBulk(true);
      window.setTimeout(() => setCopiedBulk(false), 1800);
    } catch {
      // Ignore clipboard errors
    }
  };

  // Studio Helpers
  const studioBaseFen = useMemo(
    () => gridToFen(studioGrid, studioTurn, studioCastling),
    [studioGrid, studioTurn, studioCastling]
  );

  const studioActiveFen = useMemo(() => {
    if (studioMode === 'setup') return STANDARD_FEN;
    try {
      const c = new Chess(studioBaseFen);
      if (studioMode === 'record') {
        for (const m of recordedMoves) {
          c.move({
            from: m.uci.slice(0, 2) as Square,
            to: m.uci.slice(2, 4) as Square,
            promotion: m.uci[4] as PieceSymbol | undefined,
          });
        }
      } else if (studioMode === 'test') {
        for (const san of testMoves) {
          c.move(san);
        }
      }
      return c.fen();
    } catch {
      return STANDARD_FEN;
    }
  }, [studioMode, studioBaseFen, recordedMoves, testMoves]);

  const validateStudioBaseFen = (): boolean => {
    let wk = 0;
    let bk = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = studioGrid[r][c];
        if (cell?.type === 'k') {
          if (cell.color === 'w') wk++;
          else bk++;
        }
      }
    }
    if (wk !== 1 || bk !== 1) {
      setStudioValidationError('Place exactly one White King and one Black King first.');
      return false;
    }
    try {
      new Chess(studioBaseFen);
      setStudioValidationError(null);
      return true;
    } catch {
      setStudioValidationError('Position is illegal (check pawns on 1st/8th rank or illegal check).');
      return false;
    }
  };

  const handleStudioLoadFen = (raw: string) => {
    try {
      const c = new Chess(raw);
      const castlingField = c.fen().split(' ')[2] ?? '-';
      setStudioGrid(fenToGrid(c.fen()));
      setStudioTurn(c.turn());
      setStudioCastling({
        K: castlingField.includes('K'),
        Q: castlingField.includes('Q'),
        k: castlingField.includes('k'),
        q: castlingField.includes('q'),
      });
      setRecordedMoves([]);
      setTestMoves([]);
      setStudioMode('setup');
      setStudioFenError(null);
      setStudioValidationError(null);
    } catch {
      setStudioFenError('Invalid FEN string.');
    }
  };

  const handleStudioSquareClick = (sq: Square) => {
    const { r, c } = squareToIndices(sq);
    setStudioValidationError(null);
    setStudioGrid((prev) => {
      const next = prev.map((row) => [...row]);
      if (studioTool.kind === 'erase') {
        next[r][c] = null;
      } else {
        const existing = next[r][c];
        if (
          existing &&
          existing.color === studioTool.color &&
          existing.type === studioTool.type
        ) {
          next[r][c] = null;
        } else {
          next[r][c] = { color: studioTool.color, type: studioTool.type };
        }
      }
      return next;
    });
  };

  const handleStudioMovePiece = (from: Square, to: Square) => {
    const f = squareToIndices(from);
    const t = squareToIndices(to);
    setStudioGrid((prev) => {
      const next = prev.map((row) => [...row]);
      const piece = next[f.r][f.c];
      if (!piece) return prev;
      next[t.r][t.c] = piece;
      next[f.r][f.c] = null;
      return next;
    });
  };

  const handleRecordMove = ({
    from,
    to,
    promotion,
  }: {
    from: Square;
    to: Square;
    promotion?: PieceSymbol;
  }): boolean => {
    try {
      const c = new Chess(studioActiveFen);
      const m = c.move({ from, to, promotion });
      if (!m) return false;
      const uci = `${m.from}${m.to}${m.promotion ?? ''}`;
      setRecordedMoves((prev) => [...prev, { uci, san: m.san }]);
      return true;
    } catch {
      return false;
    }
  };

  const handleTestPuzzleMove = ({
    from,
    to,
    promotion,
  }: {
    from: Square;
    to: Square;
    promotion?: PieceSymbol;
  }): boolean => {
    const stepIdx = testMoves.length;
    if (stepIdx >= recordedMoves.length) return false;
    try {
      const c = new Chess(studioActiveFen);
      const m = c.move({ from, to, promotion });
      if (!m) return false;
      const playedUci = `${m.from}${m.to}${m.promotion ?? ''}`;
      const expected = recordedMoves[stepIdx];
      if (playedUci === expected.uci || c.isCheckmate()) {
        const nextMoves = [...testMoves, m.san];
        // Auto-play next opponent move if there is one
        if (!c.isCheckmate() && stepIdx + 1 < recordedMoves.length) {
          const opp = recordedMoves[stepIdx + 1];
          const oppM = c.move({
            from: opp.uci.slice(0, 2) as Square,
            to: opp.uci.slice(2, 4) as Square,
            promotion: opp.uci[4] as PieceSymbol | undefined,
          });
          if (oppM) nextMoves.push(oppM.san);
        }
        setTestMoves(nextMoves);
        if (c.isCheckmate() || nextMoves.length >= recordedMoves.length) {
          setTestFeedback('Test passed! Puzzle solution verified.');
        } else {
          setTestFeedback(`Good (${m.san}) — continue the sequence.`);
        }
        return true;
      } else {
        setTestFeedback(`Incorrect (${m.san}). Expected ${expected.san}.`);
        return false;
      }
    } catch {
      return false;
    }
  };

  const handlePublishPuzzle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStudioBaseFen()) return;
    if (recordedMoves.length === 0) {
      setStudioValidationError('Record at least 1 solution move before publishing.');
      return;
    }
    setPublishingPuzzle(true);
    setStudioValidationError(null);
    setPublishSuccess(null);
    try {
      await postAdminAction('/api/admin/puzzles', 'POST', {
        title: puzzleTitle,
        fen: studioBaseFen,
        solution_moves: recordedMoves.map((m) => m.uci).join(','),
        difficulty: puzzleDifficulty,
        coach_notes: puzzleNotes,
      });
      setPuzzleTitle('');
      setPuzzleNotes('');
      setRecordedMoves([]);
      setTestMoves([]);
      setStudioMode('setup');
      setPublishSuccess('Puzzle published to the Academy Puzzles tab.');
      onPuzzlesChanged();
    } catch (err) {
      setStudioValidationError(err instanceof Error ? err.message : 'Failed to publish puzzle.');
    } finally {
      setPublishingPuzzle(false);
    }
  };

  const progressByStudent = useMemo(() => {
    const map = new Map<string, { solved: number; attempts: number }>();
    if (!overview) return map;
    for (const row of overview.progress) {
      const cur = map.get(row.user_id) ?? { solved: 0, attempts: 0 };
      cur.attempts += row.attempts;
      if (row.solved) cur.solved += 1;
      map.set(row.user_id, cur);
    }
    return map;
  }, [overview]);

  const progressByPuzzle = useMemo(() => {
    const map = new Map<string, { solvedCount: number; attemptCount: number }>();
    if (!overview) return map;
    for (const row of overview.progress) {
      const cur = map.get(row.puzzle_id) ?? { solvedCount: 0, attemptCount: 0 };
      cur.attemptCount += row.attempts;
      if (row.solved) cur.solvedCount += 1;
      map.set(row.puzzle_id, cur);
    }
    return map;
  }, [overview]);

  return (
    <div className="space-y-5 pb-16 md:pb-6">
      {/* Top Admin Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900/70 backdrop-blur-md border border-white/10 px-4 sm:px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-100">
              {overview?.storageMode === 'supabase'
                ? 'Supabase Connected'
                : 'In-Memory Fallback Active'}
            </span>
          </div>
          {overview?.storageMode !== 'supabase' && (
            <span className="text-xs text-amber-300/90">
              {overview?.fallbackReason || 'Run SQL Setup in Supabase to persist across restarts.'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSqlModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 transition-colors cursor-pointer"
          >
            SQL Setup Script
          </button>
          <button
            type="button"
            onClick={async () => {
              await postAdminAction('/api/admin/recheck-supabase');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            {
              id: 'requests',
              label: 'Live Access Requests',
              icon: Radio,
              count: overview?.pendingRequests.length ?? 0,
            },
            {
              id: 'students',
              label: 'Student Accounts',
              icon: Users,
              count: overview?.students.length ?? 0,
            },
            {
              id: 'studio',
              label: 'Admin Puzzle Studio',
              icon: Puzzle,
              count: overview?.puzzles.length ?? 0,
            },
            {
              id: 'inbox',
              label: 'Coach Inbox',
              icon: MessageSquare,
              count: inboxMessages.length,
            },
            {
              id: 'moderation',
              label: 'Moderation & Chat',
              icon: ShieldAlert,
              count: overview?.flaggedMessages?.length ?? 0,
            },
            {
              id: 'health',
              label: 'System Health & Bug Agent',
              icon: Activity,
              count: sentinel.events.length,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-white'
                  : 'bg-[#18181B] border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  tab.id === 'health' && sentinel.unresolvedCount > 0
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              />
              <span>{tab.label}</span>
              <span className="font-mono-tabular text-xs text-slate-300">({tab.count})</span>
            </button>
          );
        })}
      </div>

      {actionError && (
        <div className="rounded-xl bg-red-500/15 border border-red-500/35 px-4 py-3 text-xs text-red-200">
          {actionError}
        </div>
      )}

      {loading && !overview ? (
        <div className="rounded-2xl bg-slate-900/60 border border-white/10 p-8 text-center text-sm text-slate-400">
          Loading Academy Control Center…
        </div>
      ) : null}

      {/* ================================================================= */}
      {/* SECTION 1: LIVE ACCESS REQUESTS & ACTIVE STUDENTS                 */}
      {/* ================================================================= */}
      {subTab === 'requests' && overview && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Pending Approval Queue */}
          <div className="rounded-2xl bg-slate-900/70 backdrop-blur-md border border-white/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Pending Approval Queue
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Students waiting for permission to enter the platform
                </p>
              </div>
              <span className="text-xs font-mono-tabular text-amber-300">
                {overview.pendingRequests.length} waiting
              </span>
            </div>

            <div className="divide-y divide-white/[0.07]">
              {overview.pendingRequests.length === 0 ? (
                <div className="px-5 py-10 text-center text-xs text-slate-500">
                  No students currently waiting for approval.
                </div>
              ) : (
                overview.pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold font-mono-tabular text-slate-100">
                          {req.login_id}
                        </span>
                        <span className="text-xs text-slate-400 truncate">
                          {req.full_name}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Requested{' '}
                        {req.last_login_request
                          ? new Date(req.last_login_request).toLocaleTimeString()
                          : 'just now'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() =>
                          postAdminAction(`/api/admin/requests/${req.id}/approve`).catch(
                            (err) => setActionError(err.message)
                          )
                        }
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-white transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Grant Access</span>
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() =>
                          postAdminAction(`/api/admin/requests/${req.id}/deny`).catch((err) =>
                            setActionError(err.message)
                          )
                        }
                        className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-200 border border-white/10 transition-colors cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Deny</span>
                      </motion.button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Approved Sessions */}
          <div className="rounded-2xl bg-slate-900/70 backdrop-blur-md border border-white/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Active Student Sessions
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Revoking access logs the student out immediately
                </p>
              </div>
              <span className="text-xs font-mono-tabular text-emerald-400">
                {overview.activeStudents.length} active
              </span>
            </div>

            <div className="divide-y divide-white/[0.07]">
              {overview.activeStudents.length === 0 ? (
                <div className="px-5 py-10 text-center text-xs text-slate-500">
                  No students are currently signed in.
                </div>
              ) : (
                overview.activeStudents.map((st) => (
                  <div
                    key={st.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold font-mono-tabular text-emerald-300">
                          {st.login_id}
                        </span>
                        <span className="text-xs text-slate-300 truncate">
                          {st.full_name}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Session active
                      </div>
                    </div>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() =>
                        postAdminAction(`/api/admin/students/${st.id}/revoke`).catch((err) =>
                          setActionError(err.message)
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-500/30 transition-colors shrink-0 cursor-pointer whitespace-nowrap"
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      <span>Force Log Out / Revoke</span>
                    </motion.button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SECTION 2: STUDENT ACCOUNT MANAGER                                */}
      {/* ================================================================= */}
      {subTab === 'students' && overview && (
        <div className="grid grid-cols-1 lg:grid-cols-[350px_minmax(0,1fr)] gap-5 items-start">
          {/* Add New Student Form */}
          <form
            onSubmit={handleCreateStudent}
            className="rounded-2xl bg-[#18181B] border border-white/10 p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-100">
                Add New Student
              </h2>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Student Full Name
              </label>
              <input
                type="text"
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Arjun Patel"
                className="w-full px-3 py-2 rounded-xl text-xs bg-[#121216] text-slate-100 border border-white/10 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Custom Login ID
              </label>
              <input
                type="text"
                required
                value={newLoginId}
                onChange={(e) => setNewLoginId(e.target.value.toUpperCase())}
                placeholder="STU_ARJUN"
                className="w-full px-3 py-2 rounded-xl text-xs font-mono-tabular bg-[#121216] text-slate-100 border border-white/10 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setNewPassword(generatePasscode())}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  <Shuffle className="w-3 h-3" />
                  <span>Generate</span>
                </button>
              </div>
              <input
                type="text"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 4 characters"
                className="w-full px-3 py-2 rounded-xl text-xs font-mono-tabular bg-[#121216] text-slate-100 border border-white/10 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <motion.button
              type="submit"
              disabled={creatingStudent}
              whileTap={{ scale: 0.97 }}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              {creatingStudent ? 'Creating…' : 'Create Student Login'}
            </motion.button>
          </form>

          {/* Student Roster & Quick/Bulk Credential Copy */}
          <div className="rounded-2xl bg-[#18181B] border border-white/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Student Accounts &amp; Progress
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Copy Login IDs or freshly issued credentials to share with students
                </p>
              </div>

              <div className="flex items-center gap-2">
                {overview.students.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyAllCredentials}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedBulk ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedBulk ? 'Copied All' : 'Bulk Copy'}</span>
                  </button>
                )}
                <span className="text-xs font-mono-tabular text-slate-400">
                  {overview.students.length} total
                </span>
              </div>
            </div>

            <div className="divide-y divide-white/[0.07]">
              {overview.students.length === 0 ? (
                <div className="px-5 py-10 text-center text-xs text-slate-500">
                  No student accounts created yet. Use the form on the left to invite your first student.
                </div>
              ) : (
                overview.students.map((st) => {
                  const stats = progressByStudent.get(st.id) ?? { solved: 0, attempts: 0 };
                  const statusLabel = st.session_approved
                    ? 'Active'
                    : st.pending_approval
                    ? 'Waiting'
                    : 'Offline';
                  const hasIssuedPass = Boolean(issuedCredentials[st.id]);

                  return (
                    <div key={st.id} className="px-5 py-3.5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-semibold font-mono-tabular text-slate-100">
                              {st.login_id}
                            </span>
                            <span className="text-xs text-slate-300">{st.full_name}</span>
                            <span className="text-xs text-slate-500">·</span>
                            <span
                              className={`text-xs font-medium ${
                                st.session_approved
                                  ? 'text-emerald-400'
                                  : st.pending_approval
                                  ? 'text-amber-300'
                                  : 'text-slate-500'
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono-tabular text-slate-400 mt-0.5">
                            Puzzles solved: {stats.solved} · Attempts: {stats.attempts}
                            {hasIssuedPass ? ' · Password ready to copy' : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyStudentCredentials(st)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors whitespace-nowrap cursor-pointer"
                          >
                            {copiedStudentId === st.id ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {copiedStudentId === st.id
                                ? 'Copied'
                                : hasIssuedPass
                                ? 'Copy Credentials'
                                : 'Copy ID'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setResetTargetId(resetTargetId === st.id ? null : st.id);
                              setResetPasswordValue('');
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-slate-200 border border-white/10 transition-colors whitespace-nowrap cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Reset Password</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              postAdminAction(
                                `/api/admin/students/${st.id}`,
                                'DELETE'
                              ).catch((err) => setActionError(err.message))
                            }
                            aria-label={`Delete ${st.login_id}`}
                            className="p-2 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-slate-400 hover:text-red-300 border border-white/10 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {resetTargetId === st.id && (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            value={resetPasswordValue}
                            onChange={(e) => setResetPasswordValue(e.target.value)}
                            placeholder="New password (min 4 chars)"
                            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-mono-tabular bg-[#121216] text-slate-100 border border-white/15 focus:outline-none focus:border-emerald-400"
                          />
                          <button
                            type="button"
                            onClick={() => setResetPasswordValue(generatePasscode())}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-emerald-300 border border-white/10 cursor-pointer"
                          >
                            Generate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetPassword(st.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SECTION 3: ADMIN PUZZLE STUDIO                                    */}
      {/* ================================================================= */}
      {subTab === 'studio' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
            {/* Left: Interactive Studio Board */}
            <div className="flex flex-col items-center">
              <div className="w-full max-w-[540px] space-y-2.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900/90 border border-white/10">
                    <button
                      type="button"
                      onClick={() => setStudioMode('setup')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        studioMode === 'setup'
                          ? 'bg-emerald-500 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      1. Setup Board
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (validateStudioBaseFen()) {
                          setStudioMode('record');
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        studioMode === 'record'
                          ? 'bg-indigo-500 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <CircleDot className="w-3.5 h-3.5" />
                      <span>2. Record Solution</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (validateStudioBaseFen() && recordedMoves.length > 0) {
                          setTestMoves([]);
                          setTestFeedback('Play the recorded solution to test.');
                          setStudioMode('test');
                        } else if (recordedMoves.length === 0) {
                          setStudioValidationError('Record at least 1 solution move first.');
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        studioMode === 'test'
                          ? 'bg-emerald-500 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>3. Test</span>
                    </button>
                  </div>
                </div>

                {studioMode === 'setup' ? (
                  <Chessboard
                    fen={STANDARD_FEN}
                    customBoard={studioGrid}
                    boardTheme={boardTheme}
                    pieceStyle={pieceStyle}
                    showCoordinates={showCoordinates}
                    interactive={false}
                    editorMode
                    onEditorSquareClick={handleStudioSquareClick}
                    onEditorMovePiece={handleStudioMovePiece}
                    onMove={() => false}
                  />
                ) : (
                  <Chessboard
                    fen={studioActiveFen}
                    boardTheme={boardTheme}
                    pieceStyle={pieceStyle}
                    showCoordinates={showCoordinates}
                    showLegalMoves
                    interactive
                    allowedColor="both"
                    onMove={studioMode === 'record' ? handleRecordMove : handleTestPuzzleMove}
                  />
                )}

                {studioMode === 'test' && testFeedback && (
                  <div className="rounded-xl bg-slate-900/80 border border-white/10 px-4 py-2.5 text-xs text-slate-200 flex items-center justify-between">
                    <span>{testFeedback}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setTestMoves([]);
                        setTestFeedback('Play the recorded solution to test.');
                      }}
                      className="text-emerald-400 hover:underline cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Studio Controls & Publish Form */}
            <div className="rounded-2xl bg-slate-900/70 backdrop-blur-md border border-white/10 p-5 space-y-5">
              {studioMode === 'setup' && (
                <PositionEditor
                  selectedTool={studioTool}
                  onSelectTool={setStudioTool}
                  turn={studioTurn}
                  onChangeTurn={(t) => {
                    setStudioTurn(t);
                    setRecordedMoves([]);
                  }}
                  castling={studioCastling}
                  onToggleCastling={(f) =>
                    setStudioCastling((prev) => ({ ...prev, [f]: !prev[f] }))
                  }
                  fenString={studioBaseFen}
                  fenError={studioFenError}
                  validationError={studioValidationError}
                  pieceStyle={pieceStyle}
                  onLoadFenString={handleStudioLoadFen}
                  onClearBoard={() => {
                    setStudioGrid(createEmptyGrid());
                    setRecordedMoves([]);
                    setStudioValidationError(null);
                  }}
                  onResetStandard={() => {
                    setStudioGrid(fenToGrid(STANDARD_FEN));
                    setStudioTurn('w');
                    setStudioCastling({ K: true, Q: true, k: true, q: true });
                    setRecordedMoves([]);
                    setStudioValidationError(null);
                  }}
                  onPlayFromHere={() => {
                    if (validateStudioBaseFen()) setStudioMode('record');
                  }}
                  onAnalyzeFromHere={() => {
                    if (validateStudioBaseFen() && recordedMoves.length > 0) {
                      setTestMoves([]);
                      setStudioMode('test');
                    }
                  }}
                />
              )}

              {studioMode !== 'setup' && (
                <div className="space-y-3 rounded-xl bg-slate-950/50 border border-white/10 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">
                      Recorded Solution Sequence
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={recordedMoves.length === 0}
                        onClick={() => setRecordedMoves((prev) => prev.slice(0, -1))}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-slate-800 text-slate-200 disabled:opacity-40 cursor-pointer"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>Undo</span>
                      </button>
                      <button
                        type="button"
                        disabled={recordedMoves.length === 0}
                        onClick={() => {
                          setRecordedMoves([]);
                          setTestMoves([]);
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-slate-800 text-slate-200 disabled:opacity-40 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Clear</span>
                      </button>
                    </div>
                  </div>

                  {recordedMoves.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      Play the solution moves directly on the board (alternating solver and opponent replies).
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 font-mono-tabular text-xs">
                      {recordedMoves.map((m, i) => (
                        <span
                          key={`${m.uci}-${i}`}
                          className="px-2 py-1 rounded-md bg-slate-800 text-emerald-300 border border-white/10"
                        >
                          {i + 1}. {m.san}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Metadata & Publish Form */}
              <form onSubmit={handlePublishPuzzle} className="space-y-3 pt-2 border-t border-white/[0.08]">
                <h3 className="text-xs font-semibold text-slate-200">
                  Puzzle Details &amp; Publish
                </h3>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Puzzle Title
                  </label>
                  <input
                    type="text"
                    required
                    value={puzzleTitle}
                    onChange={(e) => setPuzzleTitle(e.target.value)}
                    placeholder="e.g., Smothered Mate Drill #4"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-950/80 text-slate-100 border border-white/10 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Difficulty
                    </label>
                    <select
                      value={puzzleDifficulty}
                      onChange={(e) => setPuzzleDifficulty(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-950/80 text-slate-100 border border-white/10 focus:outline-none focus:border-emerald-400"
                    >
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                      <option value="Master">Master</option>
                    </select>
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className="text-[11px] font-mono-tabular text-slate-400 pb-2">
                      Moves recorded: <span className="text-slate-100">{recordedMoves.length}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Coach Hints / Notes
                  </label>
                  <textarea
                    rows={2}
                    value={puzzleNotes}
                    onChange={(e) => setPuzzleNotes(e.target.value)}
                    placeholder="Hint shown to students if they ask for help..."
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-950/80 text-slate-100 border border-white/10 focus:outline-none focus:border-emerald-400 resize-none"
                  />
                </div>

                {studioValidationError && studioMode !== 'setup' && (
                  <p className="text-xs text-red-400">{studioValidationError}</p>
                )}
                {publishSuccess && (
                  <p className="text-xs text-emerald-400">{publishSuccess}</p>
                )}

                <motion.button
                  type="submit"
                  disabled={publishingPuzzle}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-500 to-indigo-500 text-white shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {publishingPuzzle ? 'Publishing…' : 'Publish to Academy Puzzles'}
                </motion.button>
              </form>
            </div>
          </div>

          {/* Published Custom Puzzles Table */}
          <div className="rounded-2xl bg-slate-900/70 backdrop-blur-md border border-white/10 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                Published Academy Puzzles
              </h3>
              <span className="text-xs font-mono-tabular text-slate-400">
                {overview.puzzles.length} puzzles
              </span>
            </div>

            <div className="divide-y divide-white/[0.07]">
              {overview.puzzles.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-slate-500">
                  No custom puzzles published yet.
                </div>
              ) : (
                overview.puzzles.map((pz) => {
                  const pStats = progressByPuzzle.get(pz.id) ?? {
                    solvedCount: 0,
                    attemptCount: 0,
                  };
                  return (
                    <div
                      key={pz.id}
                      className="px-5 py-3.5 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100 truncate">
                            {pz.title}
                          </span>
                          <span className="text-xs text-slate-500">·</span>
                          <span className="text-xs text-emerald-400">{pz.difficulty}</span>
                        </div>
                        <div className="text-[11px] font-mono-tabular text-slate-400 mt-0.5 truncate">
                          Solution: {pz.solution_moves} · Solved by {pStats.solvedCount} student(s) ({pStats.attemptCount} attempts)
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          await postAdminAction(
                            `/api/admin/puzzles/${pz.id}`,
                            'DELETE'
                          ).catch((err) => setActionError(err.message));
                          onPuzzlesChanged();
                        }}
                        aria-label={`Delete ${pz.title}`}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-300 border border-white/10 transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SECTION 4: COACH INBOX (LIVE STUDENT QUESTIONS & BOARD REPLIES)  */}
      {/* ================================================================= */}
      {subTab === 'inbox' && overview && (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
          {/* Student Thread List */}
          <div className="rounded-2xl bg-[#18181B] border border-white/10 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-white/[0.08]">
              <h2 className="text-sm font-semibold text-zinc-100">Student Threads</h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Select a student to view questions or reply
              </p>
            </div>
            <div className="divide-y divide-white/[0.06] max-h-[460px] overflow-y-auto chess-scroll">
              {overview.students.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-zinc-500">
                  Create a student account first to start messaging.
                </div>
              ) : (
                overview.students.map((st) => {
                  const threadMsgs = inboxMessages.filter((m) => m.student_id === st.id);
                  const lastMsg = threadMsgs[threadMsgs.length - 1];
                  const active = selectedStudentId === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStudentId(st.id)}
                      className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                        active ? 'bg-zinc-800/90' : 'hover:bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-100 truncate">
                          {st.full_name}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-zinc-400 shrink-0">
                          {threadMsgs.length}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono-tabular text-zinc-500 mt-0.5">
                        {st.login_id}
                      </div>
                      {lastMsg && (
                        <div className="text-[11px] text-zinc-400 truncate mt-1">
                          {lastMsg.sender_role === 'admin' ? 'You: ' : ''}
                          {lastMsg.message_text}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Selected Student Thread */}
          <div className="rounded-2xl bg-[#18181B] border border-white/10 overflow-hidden flex flex-col h-[520px]">
            {(() => {
              const targetStudent = overview.students.find((s) => s.id === selectedStudentId);
              const thread = inboxMessages.filter((m) => m.student_id === selectedStudentId);

              if (!targetStudent) {
                return (
                  <div className="flex-1 flex items-center justify-center p-6 text-xs text-zinc-500">
                    Select a student thread on the left to read messages.
                  </div>
                );
              }

              return (
                <>
                  <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between bg-[#141417]">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100">
                        {targetStudent.full_name}
                      </h3>
                      <p className="text-[11px] font-mono-tabular text-zinc-400">
                        {targetStudent.login_id}
                      </p>
                    </div>
                    <span className="text-xs font-mono-tabular text-zinc-400">
                      {thread.length} {thread.length === 1 ? 'message' : 'messages'}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto chess-scroll p-4 space-y-3">
                    {thread.length === 0 ? (
                      <div className="py-12 text-center text-xs text-zinc-500">
                        No messages with {targetStudent.full_name} yet. Send a coaching note below.
                      </div>
                    ) : (
                      thread.map((msg) => {
                        const isCoach = msg.sender_role === 'admin';
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isCoach ? 'items-end' : 'items-start'} space-y-1`}
                          >
                            <div className="text-[10px] text-zinc-500 px-1">
                              {isCoach ? 'You (Coach)' : msg.sender_name} ·{' '}
                              {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                            <div
                              className={`max-w-[82%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed space-y-2 ${
                                isCoach
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-zinc-900 border border-white/10 text-zinc-100'
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">{msg.message_text}</p>
                              {msg.attached_fen && (
                                <div className="flex items-center gap-3 p-2 rounded-lg bg-black/25 border border-white/10">
                                  <MiniFenBoard fen={msg.attached_fen} size={64} />
                                  <div className="min-w-0 space-y-1">
                                    <div className="text-[11px] font-medium text-zinc-200 truncate">
                                      {msg.attached_context || 'Attached Board'}
                                    </div>
                                    {onOpenFenInAnalyze && (
                                      <button
                                        type="button"
                                        onClick={() => onOpenFenInAnalyze(msg.attached_fen!)}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 hover:underline cursor-pointer"
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
                  </div>

                  <form
                    onSubmit={handleSendCoachReply}
                    className="p-3.5 border-t border-white/[0.08] bg-[#141417] flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={coachReplyInput}
                      onChange={(e) => setCoachReplyInput(e.target.value)}
                      placeholder={`Reply to ${targetStudent.full_name}…`}
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl text-xs bg-zinc-900 text-zinc-100 border border-white/10 focus:outline-none focus:border-emerald-400"
                    />
                    <button
                      type="submit"
                      disabled={sendingReply || !coachReplyInput.trim()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors shrink-0 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Reply</span>
                    </button>
                  </form>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SECTION 4B: ACADEMY SAFETY MODERATION & CHAT CONTROLS             */}
      {/* ================================================================= */}
      {subTab === 'moderation' && overview && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)] gap-5 items-start">
          {/* Flagged Messages Queue */}
          <div className="rounded-2xl bg-[#18181B] border border-white/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  Flagged Messages Queue
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Blocked automatically by the Academy profanity, link &amp; spam filter before delivery
                </p>
              </div>
              <span className="text-xs font-mono-tabular text-amber-300">
                {overview.flaggedMessages?.length ?? 0} flagged
              </span>
            </div>

            {!overview.flaggedMessages || overview.flaggedMessages.length === 0 ? (
              <div className="px-5 py-12 text-center space-y-1.5">
                <p className="text-xs font-medium text-emerald-400">
                  No flagged messages in queue.
                </p>
                <p className="text-xs text-zinc-500">
                  Any blocked profanity, external link, or spam flood attempts appear here for Admin review.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.07]">
                {overview.flaggedMessages.map((msg) => {
                  const senderStudent = overview.students.find((s) => s.id === msg.sender_id);
                  const isChatDisabled = Boolean(senderStudent?.chat_disabled);
                  return (
                    <div key={msg.id} className="px-5 py-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-semibold text-zinc-100">
                            {msg.sender_name}
                          </span>
                          <span className="font-mono-tabular text-zinc-400">
                            ({msg.sender_login_id})
                          </span>
                          <span className="text-zinc-600">·</span>
                          <span className="text-amber-300 font-medium">
                            {msg.channel_type === 'match' ? 'Match Chat' : 'Direct Message'}
                          </span>
                          <span className="text-zinc-600">·</span>
                          <span className="font-mono-tabular text-[11px] text-zinc-400">
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-xl bg-red-500/10 border border-red-500/25 px-3 py-2 text-xs text-red-100 break-words">
                        &ldquo;{msg.message_text}&rdquo;
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <span className="text-[11px] text-amber-300">
                          Reason: {msg.flag_reason}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          {senderStudent && (
                            <button
                              type="button"
                              onClick={() =>
                                postAdminAction(
                                  `/api/admin/students/${senderStudent.id}/chat`,
                                  'PATCH',
                                  { disabled: !isChatDisabled }
                                ).catch((err) => setActionError(err.message))
                              }
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                                isChatDisabled
                                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                                  : 'bg-red-500/15 hover:bg-red-500/25 text-red-200 border-red-500/30'
                              }`}
                            >
                              {isChatDisabled ? 'Re-enable Chat' : 'Disable Student Chat'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              postAdminAction(
                                `/api/admin/moderation/${msg.id}/dismiss`
                              ).catch((err) => setActionError(err.message))
                            }
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition-colors cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Per-Student Chat Access Controls */}
          <div className="rounded-2xl bg-[#18181B] border border-white/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.08]">
              <h2 className="text-sm font-semibold text-zinc-100">
                Student Chat Permissions
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Disable or restore Match Chat &amp; Friends DM per student
              </p>
            </div>

            {overview.students.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs text-zinc-500">
                No student accounts created yet.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.07]">
                {overview.students.map((st) => {
                  const disabled = Boolean(st.chat_disabled);
                  return (
                    <div
                      key={st.id}
                      className="px-5 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-100 truncate">
                          {st.full_name}
                        </div>
                        <div className="text-[11px] font-mono-tabular text-zinc-400">
                          {st.login_id} ·{' '}
                          <span className={disabled ? 'text-red-300' : 'text-emerald-400'}>
                            {disabled ? 'Chat Disabled' : 'Chat Active'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          postAdminAction(`/api/admin/students/${st.id}/chat`, 'PATCH', {
                            disabled: !disabled,
                          }).catch((err) => setActionError(err.message))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 cursor-pointer ${
                          disabled
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/40'
                            : 'bg-zinc-800 hover:bg-red-500/20 text-zinc-200 hover:text-red-200 border-white/10'
                        }`}
                      >
                        {disabled ? 'Enable Chat' : 'Disable Chat'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SECTION 5: SYSTEM HEALTH & BUG AGENT ("SENTINEL BOT")             */}
      {/* ================================================================= */}
      {subTab === 'health' && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-[#18181B] border border-white/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                {sentinel.health === 'healthy' ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <h2 className="text-base font-semibold text-zinc-50">
                  Sentinel Auto-Heal Agent ·{' '}
                  <span
                    className={
                      sentinel.health === 'healthy' ? 'text-emerald-400' : 'text-amber-300'
                    }
                  >
                    {sentinel.health === 'healthy'
                      ? 'System Healthy'
                      : sentinel.health === 'auto_fixed'
                      ? 'Auto-Fixed Issues'
                      : 'Attention Needed'}
                  </span>
                </h2>
              </div>
              <p className="text-xs text-zinc-400">
                Monitors board FEN integrity, bot stalls (&gt;8s), frozen match clocks, dropped requests, and runtime exceptions.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-mono-tabular text-zinc-300">
                <span>Auto-Repaired: {sentinel.autoFixCount}</span>
                <span className="text-zinc-600">·</span>
                <span>Unresolved: {sentinel.unresolvedCount}</span>
                <span className="text-zinc-600">·</span>
                <span>
                  Backend: {overview?.storageMode === 'supabase' ? 'Supabase' : 'Memory Fallback'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRunDiagnostics}
                disabled={runningDiag}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${runningDiag ? 'animate-spin' : ''}`} />
                <span>{runningDiag ? 'Checking…' : 'Run Diagnostics'}</span>
              </button>
              {sentinel.events.length > 0 && (
                <button
                  type="button"
                  onClick={() => sentinelAgent.clearEvents()}
                  className="px-3 py-2 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Clear Log
                </button>
              )}
            </div>
          </div>

          {diagSummary && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-xs text-emerald-200">
              {diagSummary}
            </div>
          )}

          {/* Live Diagnostic Events Feed */}
          <div className="rounded-2xl bg-[#18181B] border border-white/10 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">
                Caught Errors &amp; Auto-Repair Log
              </h3>
              <span className="text-xs font-mono-tabular text-zinc-400">
                {sentinel.events.length} {sentinel.events.length === 1 ? 'event' : 'events'}
              </span>
            </div>

            {sentinel.events.length === 0 ? (
              <div className="px-5 py-12 text-center space-y-1.5">
                <p className="text-xs font-medium text-emerald-400">
                  Zero runtime issues detected in this session.
                </p>
                <p className="text-xs text-zinc-500">
                  Sentinel automatically logs any FEN repairs, stalled AI turns, clock resyncs, or dropped API retries here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.07]">
                {sentinel.events.map((ev) => (
                  <div key={ev.id} className="px-5 py-4 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {ev.severity === 'auto_repaired' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Auto-Repaired</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>Unresolved</span>
                            </span>
                          )}
                          <span className="text-zinc-600">·</span>
                          <span className="font-semibold text-zinc-100">{ev.title}</span>
                          <span className="text-zinc-600">·</span>
                          <span className="font-mono-tabular text-[11px] text-zinc-400">
                            {new Date(ev.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-300 break-words">{ev.details}</p>
                        {ev.repairAction && (
                          <p className="text-[11px] text-zinc-400">
                            Action: <span className="text-zinc-200">{ev.repairAction}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {ev.severity === 'unresolved' && (
                          <button
                            type="button"
                            onClick={() => sentinelAgent.markResolved(ev.id)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition-colors cursor-pointer"
                          >
                            Mark Resolved
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(ev.fixPrompt);
                              setCopiedPromptId(ev.id);
                              window.setTimeout(() => setCopiedPromptId(null), 1800);
                            } catch {
                              // Ignore clipboard errors
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/30 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {copiedPromptId === ev.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {copiedPromptId === ev.id ? 'Copied Prompt' : 'Copy Fix Prompt'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SQL Setup Script Modal */}
      <AnimatePresence>
        {sqlModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSqlModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Supabase SQL Setup Script"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[85dvh] flex flex-col rounded-2xl bg-slate-900 border border-white/15 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Supabase Database Setup SQL
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Run this in Supabase Dashboard → SQL Editor, then click Sync
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
                      setCopiedSql(true);
                      window.setTimeout(() => setCopiedSql(false), 1600);
                    } catch {
                      // Ignore clipboard errors
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-white cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Copied SQL' : 'Copy SQL'}</span>
                </button>
              </div>
              <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono-tabular text-slate-200 bg-slate-950/80 leading-relaxed">
                {SUPABASE_SETUP_SQL}
              </pre>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
