import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'student';
export type StorageMode = 'supabase' | 'memory-fallback';
export type PresenceStatus = 'online' | 'in_game' | 'offline';
export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

export interface AcademyUserRow {
  id: string;
  login_id: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  session_approved: boolean;
  pending_approval: boolean;
  last_login_request: string | null;
  chat_disabled?: boolean;
  presence_status?: PresenceStatus;
  last_seen_at?: string | null;
  created_at?: string;
}

export interface SanitizedUser {
  id: string;
  login_id: string;
  full_name: string;
  role: UserRole;
  session_approved: boolean;
  pending_approval: boolean;
  last_login_request: string | null;
  chat_disabled: boolean;
  presence_status: PresenceStatus;
  last_seen_at: string | null;
}

export interface CustomPuzzleRow {
  id: string;
  title: string;
  fen: string;
  solution_moves: string;
  difficulty: string;
  coach_notes: string;
  created_at: string;
}

export interface StudentProgressRow {
  id: string;
  user_id: string;
  puzzle_id: string;
  solved: boolean;
  attempts: number;
  completed_at: string | null;
}

export type GameResult = 'win' | 'loss' | 'draw';

export interface AcademyGameRow {
  id: string;
  user_id: string;
  opponent_label: string;
  time_control: string;
  player_color: 'w' | 'b';
  result: GameResult;
  result_reason: string;
  initial_fen: string;
  moves_san: string;
  move_count: number;
  played_at: string;
}

export interface CoachMessageRow {
  id: string;
  student_id: string;
  sender_id: string;
  sender_role: UserRole;
  sender_name: string;
  message_text: string;
  attached_fen: string | null;
  attached_context: string;
  created_at: string;
}

export interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
}

export interface SocialMessageRow {
  id: string;
  channel_type: 'dm' | 'match';
  sender_id: string;
  recipient_id: string | null;
  match_room_id: string | null;
  sender_name: string;
  sender_login_id: string;
  message_text: string;
  flagged: boolean;
  flag_reason: string;
  created_at: string;
}

export interface MatchChallengeRow {
  id: string;
  challenger_id: string;
  challenger_name: string;
  challenger_login_id: string;
  challenged_id: string;
  challenged_name: string;
  challenged_login_id: string;
  time_control: 'rapid10' | 'blitz5' | 'untimed';
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  moves_san: string;
  resigned_by: 'w' | 'b' | null;
  created_at: string;
  updated_at: string;
}

const PRESENCE_STALE_MS = 25_000;

export function computeLivePresence(row: AcademyUserRow): PresenceStatus {
  if (row.role === 'student' && !row.session_approved) {
    return 'offline';
  }
  if (!row.last_seen_at) return 'offline';
  const lastSeenMs = Date.parse(row.last_seen_at);
  if (Number.isNaN(lastSeenMs) || Date.now() - lastSeenMs > PRESENCE_STALE_MS) {
    return 'offline';
  }
  if (row.presence_status === 'in_game') return 'in_game';
  if (row.presence_status === 'offline') return 'offline';
  return 'online';
}

export function sanitizeUser(row: AcademyUserRow): SanitizedUser {
  return {
    id: row.id,
    login_id: row.login_id,
    full_name: row.full_name,
    role: row.role,
    session_approved: row.session_approved,
    pending_approval: row.pending_approval,
    last_login_request: row.last_login_request,
    chat_disabled: Boolean(row.chat_disabled),
    presence_status: computeLivePresence(row),
    last_seen_at: row.last_seen_at ?? null,
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derivedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, expectedBuf);
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table')
  );
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return error.code === '42703' || error.code === 'PGRST204' || msg.includes('column');
}

export class AcademyStore {
  private supabase: SupabaseClient | null = null;
  private mode: StorageMode = 'memory-fallback';
  private fallbackReason: string = 'Supabase credentials not configured.';

  private memUsers = new Map<string, AcademyUserRow>();
  private memPuzzles = new Map<string, CustomPuzzleRow>();
  private memProgress = new Map<string, StudentProgressRow>();
  private memGames = new Map<string, AcademyGameRow>();
  private memCoachMessages = new Map<string, CoachMessageRow>();
  private memFriendships = new Map<string, FriendshipRow>();
  private memSocialMessages = new Map<string, SocialMessageRow>();
  private memChallenges = new Map<string, MatchChallengeRow>();
  private memPresenceOverlay = new Map<
    string,
    { presence_status: PresenceStatus; last_seen_at: string | null; chat_disabled?: boolean }
  >();

  private applyOverlay(user: AcademyUserRow): AcademyUserRow {
    const ov = this.memPresenceOverlay.get(user.id);
    if (!ov) return user;
    return {
      ...user,
      presence_status: ov.presence_status ?? user.presence_status,
      last_seen_at: ov.last_seen_at !== undefined ? ov.last_seen_at : user.last_seen_at,
      chat_disabled: ov.chat_disabled !== undefined ? ov.chat_disabled : user.chat_disabled,
    };
  }

  constructor() {
    this.seedFallbackExamples();
  }

  private seedFallbackExamples() {
    const now = new Date().toISOString();
    const defaultAdminId = (process.env.ACADEMY_DEFAULT_ADMIN_ID || 'ADMIN01').trim().toUpperCase();
    const defaultAdminPass = process.env.ACADEMY_DEFAULT_ADMIN_PASS || 'admin123';
    const defaultStudentId = (process.env.ACADEMY_DEFAULT_STUDENT_ID || 'STUDENT01').trim().toUpperCase();
    const defaultStudentPass = process.env.ACADEMY_DEFAULT_STUDENT_PASS || 'pass123';

    const adminRow: AcademyUserRow = {
      id: crypto.randomUUID(),
      login_id: defaultAdminId,
      password_hash: hashPassword(defaultAdminPass),
      full_name: 'Academy Admin',
      role: 'admin',
      session_approved: true,
      pending_approval: false,
      last_login_request: null,
      presence_status: 'offline',
      created_at: now,
    };
    const studentRow: AcademyUserRow = {
      id: crypto.randomUUID(),
      login_id: defaultStudentId,
      password_hash: hashPassword(defaultStudentPass),
      full_name: 'Student Player',
      role: 'student',
      session_approved: true,
      pending_approval: false,
      last_login_request: null,
      presence_status: 'offline',
      created_at: now,
    };
    this.memUsers.set(adminRow.id, adminRow);
    this.memUsers.set(studentRow.id, studentRow);

    // Seed starter coach puzzle in memory-fallback mode so the studio is immediately testable
    const p1: CustomPuzzleRow = {
      id: crypto.randomUUID(),
      title: 'Academy Warmup: Back Rank Deflection',
      fen: '3r2k1/5ppp/8/8/8/8/4QPPP/4R1K1 w - - 0 1',
      solution_moves: 'e2e8,d8e8,e1e8',
      difficulty: 'Beginner',
      coach_notes: 'Look at how the Black rook on d8 is overloaded defending e8.',
      created_at: now,
    };
    this.memPuzzles.set(p1.id, p1);
  }

  private async ensureDefaultUsers(): Promise<void> {
    const defaultAdminId = (process.env.ACADEMY_DEFAULT_ADMIN_ID || 'ADMIN01').trim().toUpperCase();
    const defaultAdminPass = process.env.ACADEMY_DEFAULT_ADMIN_PASS || 'admin123';
    const defaultStudentId = (process.env.ACADEMY_DEFAULT_STUDENT_ID || 'STUDENT01').trim().toUpperCase();
    const defaultStudentPass = process.env.ACADEMY_DEFAULT_STUDENT_PASS || 'pass123';

    try {
      const existingAdmin = await this.findUserByLoginId(defaultAdminId);
      if (!existingAdmin) {
        await this.createUser({
          loginId: defaultAdminId,
          password: defaultAdminPass,
          fullName: 'Academy Admin',
          role: 'admin',
        });
      }
      const existingStudent = await this.findUserByLoginId(defaultStudentId);
      if (!existingStudent) {
        await this.createUser({
          loginId: defaultStudentId,
          password: defaultStudentPass,
          fullName: 'Student Player',
          role: 'student',
        });
      }
    } catch {
      // Non-fatal if default accounts already exist or schema differs
    }
  }

  async init(): Promise<void> {
    const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
    const key = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      ''
    ).trim();

    if (!url || !key) {
      this.supabase = null;
      this.mode = 'memory-fallback';
      this.fallbackReason =
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set. Running with local in-memory academy fallback.';
      await this.ensureDefaultUsers();
      return;
    }

    try {
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: uErr } = await client.from('academy_users').select('id').limit(1);
      if (uErr) {
        this.supabase = null;
        this.mode = 'memory-fallback';
        this.fallbackReason = isMissingTableError(uErr)
          ? 'Connected to Supabase, but academy_users / custom_puzzles / student_progress tables are not created yet. Run the SQL Setup script.'
          : `Supabase connection error: ${uErr.message}`;
        await this.ensureDefaultUsers();
        return;
      }
      const { error: pErr } = await client.from('custom_puzzles').select('id').limit(1);
      const { error: prErr } = await client.from('student_progress').select('id').limit(1);
      if (pErr || prErr) {
        this.supabase = null;
        this.mode = 'memory-fallback';
        this.fallbackReason =
          'One or more academy tables (custom_puzzles / student_progress) are missing in Supabase. Run the SQL Setup script.';
        await this.ensureDefaultUsers();
        return;
      }

      this.supabase = client;
      this.mode = 'supabase';
      this.fallbackReason = '';
      await this.ensureDefaultUsers();
    } catch (err) {
      this.supabase = null;
      this.mode = 'memory-fallback';
      this.fallbackReason =
        err instanceof Error ? err.message : 'Unable to connect to Supabase.';
      await this.ensureDefaultUsers();
    }
  }

  getStatus() {
    return {
      storageMode: this.mode,
      fallbackReason: this.fallbackReason,
    };
  }

  private handleSupabaseFallback(error: { code?: string; message?: string } | null) {
    if (isMissingTableError(error)) {
      this.mode = 'memory-fallback';
      this.supabase = null;
      this.fallbackReason =
        'Supabase tables missing. Switched to in-memory fallback until SQL schema is created.';
      return true;
    }
    return false;
  }

  async hasAdminUser(): Promise<boolean> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('academy_users')
        .select('id')
        .eq('role', 'admin')
        .limit(1);
      if (!error) return Boolean(data && data.length > 0);
      if (!this.handleSupabaseFallback(error)) throw new Error(error.message);
    }

    for (const u of this.memUsers.values()) {
      if (u.role === 'admin') return true;
    }
    return false;
  }

  async findUserByLoginId(loginId: string): Promise<AcademyUserRow | null> {
    const normalized = loginId.trim().toUpperCase();
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('academy_users')
        .select('*')
        .eq('login_id', normalized)
        .maybeSingle();
      if (!error) return (data as AcademyUserRow | null) ?? null;
      if (!this.handleSupabaseFallback(error)) throw new Error(error.message);
    }

    for (const u of this.memUsers.values()) {
      if (u.login_id === normalized) return { ...u };
    }
    return null;
  }

  async findUserById(userId: string): Promise<AcademyUserRow | null> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('academy_users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!error) return data ? this.applyOverlay(data as AcademyUserRow) : null;
      if (!this.handleSupabaseFallback(error)) throw new Error(error.message);
    }

    const found = this.memUsers.get(userId);
    return found ? this.applyOverlay({ ...found }) : null;
  }

  async createUser(input: {
    loginId: string;
    password: string;
    fullName: string;
    role: UserRole;
  }): Promise<AcademyUserRow> {
    const normalizedId = input.loginId.trim().toUpperCase();
    const passwordHash = hashPassword(input.password);
    const now = new Date().toISOString();

    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('academy_users')
        .insert({
          login_id: normalizedId,
          password_hash: passwordHash,
          full_name: input.fullName.trim(),
          role: input.role,
          session_approved: true,
          pending_approval: false,
          last_login_request: null,
        })
        .select('*')
        .single();
      if (!error && data) return data as AcademyUserRow;
      if (!this.handleSupabaseFallback(error)) throw new Error(error?.message || 'Insert failed');
    }

    for (const existing of this.memUsers.values()) {
      if (existing.login_id === normalizedId) {
        throw new Error(`Login ID "${normalizedId}" already exists.`);
      }
    }

    const row: AcademyUserRow = {
      id: crypto.randomUUID(),
      login_id: normalizedId,
      password_hash: passwordHash,
      full_name: input.fullName.trim(),
      role: input.role,
      session_approved: true,
      pending_approval: false,
      last_login_request: null,
      created_at: now,
    };
    this.memUsers.set(row.id, row);
    return { ...row };
  }

  async updateUserSession(
    userId: string,
    patch: {
      session_approved?: boolean;
      pending_approval?: boolean;
      last_login_request?: string | null;
      password_hash?: string;
    }
  ): Promise<AcademyUserRow | null> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('academy_users')
        .update(patch)
        .eq('id', userId)
        .select('*')
        .maybeSingle();
      if (!error) return (data as AcademyUserRow | null) ?? null;
      if (!this.handleSupabaseFallback(error)) throw new Error(error.message);
    }

    const existing = this.memUsers.get(userId);
    if (!existing) return null;
    const updated: AcademyUserRow = { ...existing, ...patch };
    this.memUsers.set(userId, updated);
    return { ...updated };
  }

  async deleteStudent(userId: string): Promise<boolean> {
    if (this.supabase && this.mode === 'supabase') {
      const { error } = await this.supabase
        .from('academy_users')
        .delete()
        .eq('id', userId)
        .eq('role', 'student');
      if (!error) return true;
      if (!this.handleSupabaseFallback(error)) throw new Error(error.message);
    }

    const existing = this.memUsers.get(userId);
    if (!existing || existing.role !== 'student') return false;
    this.memUsers.delete(userId);
    for (const [k, pr] of this.memProgress.entries()) {
      if (pr.user_id === userId) this.memProgress.delete(k);
    }
    return true;
  }

  async listStudents(): Promise<AcademyUserRow[]> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('academy_users')
        .select('*')
        .eq('role', 'student')
        .order('login_id', { ascending: true });
      if (!error && data) return (data as AcademyUserRow[]).map((u) => this.applyOverlay(u));
      if (!this.handleSupabaseFallback(error)) throw new Error(error?.message || 'Query failed');
    }

    return Array.from(this.memUsers.values())
      .filter((u) => u.role === 'student')
      .map((u) => this.applyOverlay(u))
      .sort((a, b) => a.login_id.localeCompare(b.login_id));
  }

  async listCustomPuzzles(): Promise<CustomPuzzleRow[]> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('custom_puzzles')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) return data as CustomPuzzleRow[];
      if (!this.handleSupabaseFallback(error)) throw new Error(error?.message || 'Query failed');
    }

    return Array.from(this.memPuzzles.values()).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  }

  async createCustomPuzzle(input: {
    title: string;
    fen: string;
    solution_moves: string;
    difficulty: string;
    coach_notes: string;
  }): Promise<CustomPuzzleRow> {
    const now = new Date().toISOString();
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('custom_puzzles')
        .insert({
          title: input.title.trim(),
          fen: input.fen.trim(),
          solution_moves: input.solution_moves.trim(),
          difficulty: input.difficulty.trim(),
          coach_notes: input.coach_notes.trim(),
        })
        .select('*')
        .single();
      if (!error && data) return data as CustomPuzzleRow;
      if (!this.handleSupabaseFallback(error)) throw new Error(error?.message || 'Insert failed');
    }

    const row: CustomPuzzleRow = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      fen: input.fen.trim(),
      solution_moves: input.solution_moves.trim(),
      difficulty: input.difficulty.trim(),
      coach_notes: input.coach_notes.trim(),
      created_at: now,
    };
    this.memPuzzles.set(row.id, row);
    return { ...row };
  }

  async deleteCustomPuzzle(puzzleId: string): Promise<boolean> {
    if (this.supabase && this.mode === 'supabase') {
      const { error } = await this.supabase
        .from('custom_puzzles')
        .delete()
        .eq('id', puzzleId);
      if (!error) return true;
      if (!this.handleSupabaseFallback(error)) throw new Error(error.message);
    }

    const deleted = this.memPuzzles.delete(puzzleId);
    for (const [k, pr] of this.memProgress.entries()) {
      if (pr.puzzle_id === puzzleId) this.memProgress.delete(k);
    }
    return deleted;
  }

  async listProgressForUser(userId: string): Promise<StudentProgressRow[]> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('student_progress')
        .select('*')
        .eq('user_id', userId);
      if (!error && data) return data as StudentProgressRow[];
      if (!this.handleSupabaseFallback(error)) throw new Error(error?.message || 'Query failed');
    }

    return Array.from(this.memProgress.values()).filter((p) => p.user_id === userId);
  }

  async listAllProgress(): Promise<StudentProgressRow[]> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase.from('student_progress').select('*');
      if (!error && data) return data as StudentProgressRow[];
      if (!this.handleSupabaseFallback(error)) throw new Error(error?.message || 'Query failed');
    }

    return Array.from(this.memProgress.values());
  }

  async recordPuzzleAttempt(
    userId: string,
    puzzleId: string,
    solvedNow: boolean
  ): Promise<StudentProgressRow> {
    const now = new Date().toISOString();
    if (this.supabase && this.mode === 'supabase') {
      const { data: existing, error: selErr } = await this.supabase
        .from('student_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('puzzle_id', puzzleId)
        .maybeSingle();

      if (!selErr) {
        const prev = existing as StudentProgressRow | null;
        const nextSolved = Boolean(prev?.solved) || solvedNow;
        const nextAttempts = (prev?.attempts ?? 0) + 1;
        const nextCompletedAt = prev?.completed_at || (solvedNow ? now : null);

        if (prev) {
          const { data: updated, error: updErr } = await this.supabase
            .from('student_progress')
            .update({
              solved: nextSolved,
              attempts: nextAttempts,
              completed_at: nextCompletedAt,
            })
            .eq('id', prev.id)
            .select('*')
            .single();
          if (!updErr && updated) return updated as StudentProgressRow;
          if (!this.handleSupabaseFallback(updErr)) throw new Error(updErr?.message || 'Update failed');
        } else {
          const { data: inserted, error: insErr } = await this.supabase
            .from('student_progress')
            .insert({
              user_id: userId,
              puzzle_id: puzzleId,
              solved: nextSolved,
              attempts: 1,
              completed_at: nextCompletedAt,
            })
            .select('*')
            .single();
          if (!insErr && inserted) return inserted as StudentProgressRow;
          if (!this.handleSupabaseFallback(insErr)) throw new Error(insErr?.message || 'Insert failed');
        }
      } else if (!this.handleSupabaseFallback(selErr)) {
        throw new Error(selErr.message);
      }
    }

    const key = `${userId}:${puzzleId}`;
    const existing = this.memProgress.get(key);
    const nextRow: StudentProgressRow = {
      id: existing?.id ?? crypto.randomUUID(),
      user_id: userId,
      puzzle_id: puzzleId,
      solved: Boolean(existing?.solved) || solvedNow,
      attempts: (existing?.attempts ?? 0) + 1,
      completed_at: existing?.completed_at || (solvedNow ? now : null),
    };
    this.memProgress.set(key, nextRow);
    return { ...nextRow };
  }

  async listGamesForUser(userId: string): Promise<AcademyGameRow[]> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('academy_games')
        .select('*')
        .eq('user_id', userId)
        .order('played_at', { ascending: false })
        .limit(20);
      if (!error && data) return data as AcademyGameRow[];
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    return Array.from(this.memGames.values())
      .filter((g) => g.user_id === userId)
      .sort((a, b) => b.played_at.localeCompare(a.played_at))
      .slice(0, 20);
  }

  async recordGame(input: {
    userId: string;
    opponentLabel: string;
    timeControl: string;
    playerColor: 'w' | 'b';
    result: GameResult;
    resultReason: string;
    initialFen: string;
    movesSan: string;
    moveCount: number;
  }): Promise<AcademyGameRow> {
    const now = new Date().toISOString();
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('academy_games')
        .insert({
          user_id: input.userId,
          opponent_label: input.opponentLabel.trim(),
          time_control: input.timeControl.trim(),
          player_color: input.playerColor,
          result: input.result,
          result_reason: input.resultReason.trim(),
          initial_fen: input.initialFen.trim(),
          moves_san: input.movesSan.trim(),
          move_count: input.moveCount,
          played_at: now,
        })
        .select('*')
        .single();
      if (!error && data) return data as AcademyGameRow;
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    const row: AcademyGameRow = {
      id: crypto.randomUUID(),
      user_id: input.userId,
      opponent_label: input.opponentLabel.trim(),
      time_control: input.timeControl.trim(),
      player_color: input.playerColor,
      result: input.result,
      result_reason: input.resultReason.trim(),
      initial_fen: input.initialFen.trim(),
      moves_san: input.movesSan.trim(),
      move_count: input.moveCount,
      played_at: now,
    };
    this.memGames.set(row.id, row);
    return { ...row };
  }

  async listCoachMessagesForStudent(studentId: string): Promise<CoachMessageRow[]> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('coach_messages')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (!error && data) return data as CoachMessageRow[];
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    return Array.from(this.memCoachMessages.values())
      .filter((m) => m.student_id === studentId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-100);
  }

  async listAllCoachMessages(): Promise<CoachMessageRow[]> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('coach_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(300);
      if (!error && data) return data as CoachMessageRow[];
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    return Array.from(this.memCoachMessages.values())
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-300);
  }

  async createCoachMessage(input: {
    studentId: string;
    senderId: string;
    senderRole: UserRole;
    senderName: string;
    messageText: string;
    attachedFen: string | null;
    attachedContext: string;
  }): Promise<CoachMessageRow> {
    const now = new Date().toISOString();
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('coach_messages')
        .insert({
          student_id: input.studentId,
          sender_id: input.senderId,
          sender_role: input.senderRole,
          sender_name: input.senderName.trim(),
          message_text: input.messageText.trim(),
          attached_fen: input.attachedFen,
          attached_context: input.attachedContext.trim(),
          created_at: now,
        })
        .select('*')
        .single();
      if (!error && data) return data as CoachMessageRow;
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    const row: CoachMessageRow = {
      id: crypto.randomUUID(),
      student_id: input.studentId,
      sender_id: input.senderId,
      sender_role: input.senderRole,
      sender_name: input.senderName.trim(),
      message_text: input.messageText.trim(),
      attached_fen: input.attachedFen,
      attached_context: input.attachedContext.trim(),
      created_at: now,
    };
    this.memCoachMessages.set(row.id, row);
    return { ...row };
  }

  // =========================================================================
  // PRESENCE, FRIENDSHIPS, SOCIAL MESSAGING & LIVE CHALLENGES
  // =========================================================================

  async updatePresence(userId: string, status: PresenceStatus): Promise<void> {
    const now = status === 'offline' ? null : new Date().toISOString();
    const prevOv = this.memPresenceOverlay.get(userId);
    this.memPresenceOverlay.set(userId, {
      ...prevOv,
      presence_status: status,
      last_seen_at: now,
    });

    if (this.supabase && this.mode === 'supabase') {
      const { error } = await this.supabase
        .from('academy_users')
        .update({
          presence_status: status,
          last_seen_at: now,
        })
        .eq('id', userId);
      if (!error) return;
      if (isMissingColumnError(error)) {
        return;
      }
      if (!this.handleSupabaseFallback(error)) {
        throw new Error(error.message);
      }
    }

    const existing = this.memUsers.get(userId);
    if (existing) {
      this.memUsers.set(userId, {
        ...existing,
        presence_status: status,
        last_seen_at: now,
      });
    }
  }

  async setStudentChatDisabled(
    userId: string,
    disabled: boolean
  ): Promise<AcademyUserRow | null> {
    const prevOv = this.memPresenceOverlay.get(userId);
    this.memPresenceOverlay.set(userId, {
      presence_status: prevOv?.presence_status ?? 'online',
      last_seen_at: prevOv?.last_seen_at ?? null,
      chat_disabled: disabled,
    });

    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('academy_users')
        .update({ chat_disabled: disabled })
        .eq('id', userId)
        .eq('role', 'student')
        .select('*')
        .maybeSingle();
      if (!error) return data ? this.applyOverlay(data as AcademyUserRow) : null;
      if (isMissingColumnError(error)) {
        return this.findUserById(userId);
      }
      if (!this.handleSupabaseFallback(error)) {
        throw new Error(error.message);
      }
    }

    const existing = this.memUsers.get(userId);
    if (!existing || existing.role !== 'student') return null;
    const updated: AcademyUserRow = { ...existing, chat_disabled: disabled };
    this.memUsers.set(userId, updated);
    return this.applyOverlay({ ...updated });
  }

  async listFriendshipsForUser(userId: string): Promise<FriendshipRow[]> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('friendships')
        .select('*')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
      if (!error && data) return data as FriendshipRow[];
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    return Array.from(this.memFriendships.values()).filter(
      (f) => f.requester_id === userId || f.addressee_id === userId
    );
  }

  async upsertFriendRequest(
    requesterId: string,
    addresseeId: string
  ): Promise<FriendshipRow> {
    const now = new Date().toISOString();
    const existingList = await this.listFriendshipsForUser(requesterId);
    const existing = existingList.find(
      (f) =>
        (f.requester_id === requesterId && f.addressee_id === addresseeId) ||
        (f.requester_id === addresseeId && f.addressee_id === requesterId)
    );

    if (existing) {
      if (existing.status === 'accepted') return existing;
      // If peer already requested us, accepting automatically connects both friends
      const nextStatus: FriendshipStatus =
        existing.requester_id === addresseeId && existing.status === 'pending'
          ? 'accepted'
          : 'pending';
      const nextRequester = nextStatus === 'pending' ? requesterId : existing.requester_id;
      const nextAddressee = nextStatus === 'pending' ? addresseeId : existing.addressee_id;

      if (this.supabase && this.mode === 'supabase') {
        const { data, error } = await this.supabase
          .from('friendships')
          .update({
            requester_id: nextRequester,
            addressee_id: nextAddressee,
            status: nextStatus,
            updated_at: now,
          })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (!error && data) return data as FriendshipRow;
        if (error && !isMissingTableError(error)) throw new Error(error.message);
      }

      const updated: FriendshipRow = {
        ...existing,
        requester_id: nextRequester,
        addressee_id: nextAddressee,
        status: nextStatus,
        updated_at: now,
      };
      this.memFriendships.set(updated.id, updated);
      return { ...updated };
    }

    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('friendships')
        .insert({
          requester_id: requesterId,
          addressee_id: addresseeId,
          status: 'pending',
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();
      if (!error && data) return data as FriendshipRow;
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    const row: FriendshipRow = {
      id: crypto.randomUUID(),
      requester_id: requesterId,
      addressee_id: addresseeId,
      status: 'pending',
      created_at: now,
      updated_at: now,
    };
    this.memFriendships.set(row.id, row);
    return { ...row };
  }

  async respondFriendRequest(
    friendshipId: string,
    actingUserId: string,
    accept: boolean
  ): Promise<FriendshipRow | null> {
    const now = new Date().toISOString();
    const nextStatus: FriendshipStatus = accept ? 'accepted' : 'declined';

    if (this.supabase && this.mode === 'supabase') {
      const { data: existing, error: selErr } = await this.supabase
        .from('friendships')
        .select('*')
        .eq('id', friendshipId)
        .maybeSingle();
      if (!selErr) {
        const row = existing as FriendshipRow | null;
        if (!row || row.addressee_id !== actingUserId) return null;
        const { data: updated, error: updErr } = await this.supabase
          .from('friendships')
          .update({ status: nextStatus, updated_at: now })
          .eq('id', friendshipId)
          .select('*')
          .single();
        if (!updErr && updated) return updated as FriendshipRow;
        if (updErr && !isMissingTableError(updErr)) throw new Error(updErr.message);
      } else if (!isMissingTableError(selErr)) {
        throw new Error(selErr.message);
      }
    }

    const existing = this.memFriendships.get(friendshipId);
    if (!existing || existing.addressee_id !== actingUserId) return null;
    const updated: FriendshipRow = { ...existing, status: nextStatus, updated_at: now };
    this.memFriendships.set(friendshipId, updated);
    return { ...updated };
  }

  async listSocialMessages(input: {
    channelType: 'dm' | 'match';
    userId: string;
    peerId?: string;
    matchRoomId?: string;
  }): Promise<SocialMessageRow[]> {
    if (this.supabase && this.mode === 'supabase') {
      if (input.channelType === 'match' && input.matchRoomId) {
        const { data, error } = await this.supabase
          .from('social_messages')
          .select('*')
          .eq('channel_type', 'match')
          .eq('match_room_id', input.matchRoomId)
          .eq('flagged', false)
          .order('created_at', { ascending: true })
          .limit(120);
        if (!error && data) return data as SocialMessageRow[];
        if (error && !isMissingTableError(error)) throw new Error(error.message);
      } else if (input.channelType === 'dm' && input.peerId) {
        const { data, error } = await this.supabase
          .from('social_messages')
          .select('*')
          .eq('channel_type', 'dm')
          .eq('flagged', false)
          .or(
            `and(sender_id.eq.${input.userId},recipient_id.eq.${input.peerId}),and(sender_id.eq.${input.peerId},recipient_id.eq.${input.userId})`
          )
          .order('created_at', { ascending: true })
          .limit(120);
        if (!error && data) return data as SocialMessageRow[];
        if (error && !isMissingTableError(error)) throw new Error(error.message);
      }
    }

    return Array.from(this.memSocialMessages.values())
      .filter((m) => {
        if (m.flagged) return false;
        if (input.channelType === 'match') {
          return m.channel_type === 'match' && m.match_room_id === input.matchRoomId;
        }
        return (
          m.channel_type === 'dm' &&
          ((m.sender_id === input.userId && m.recipient_id === input.peerId) ||
            (m.sender_id === input.peerId && m.recipient_id === input.userId))
        );
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-120);
  }

  async listFlaggedSocialMessages(): Promise<SocialMessageRow[]> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('social_messages')
        .select('*')
        .eq('flagged', true)
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && data) return data as SocialMessageRow[];
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    return Array.from(this.memSocialMessages.values())
      .filter((m) => m.flagged)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100);
  }

  async dismissFlaggedMessage(messageId: string): Promise<boolean> {
    if (this.supabase && this.mode === 'supabase') {
      const { error } = await this.supabase
        .from('social_messages')
        .delete()
        .eq('id', messageId)
        .eq('flagged', true);
      if (!error) return true;
      if (!isMissingTableError(error)) throw new Error(error.message);
    }

    const row = this.memSocialMessages.get(messageId);
    if (!row || !row.flagged) return false;
    return this.memSocialMessages.delete(messageId);
  }

  async deleteSocialMessage(messageId: string): Promise<boolean> {
    if (this.supabase && this.mode === 'supabase') {
      const { error } = await this.supabase
        .from('social_messages')
        .delete()
        .eq('id', messageId);
      if (!error) return true;
      if (!isMissingTableError(error)) throw new Error(error.message);
    }

    return this.memSocialMessages.delete(messageId);
  }

  async createSocialMessage(input: {
    channelType: 'dm' | 'match';
    senderId: string;
    recipientId: string | null;
    matchRoomId: string | null;
    senderName: string;
    senderLoginId: string;
    messageText: string;
    flagged: boolean;
    flagReason: string;
  }): Promise<SocialMessageRow> {
    const now = new Date().toISOString();
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('social_messages')
        .insert({
          channel_type: input.channelType,
          sender_id: input.senderId,
          recipient_id: input.recipientId,
          match_room_id: input.matchRoomId,
          sender_name: input.senderName.trim(),
          sender_login_id: input.senderLoginId.trim(),
          message_text: input.messageText.trim(),
          flagged: input.flagged,
          flag_reason: input.flagReason.trim(),
          created_at: now,
        })
        .select('*')
        .single();
      if (!error && data) return data as SocialMessageRow;
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    const row: SocialMessageRow = {
      id: crypto.randomUUID(),
      channel_type: input.channelType,
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      match_room_id: input.matchRoomId,
      sender_name: input.senderName.trim(),
      sender_login_id: input.senderLoginId.trim(),
      message_text: input.messageText.trim(),
      flagged: input.flagged,
      flag_reason: input.flagReason.trim(),
      created_at: now,
    };
    this.memSocialMessages.set(row.id, row);
    return { ...row };
  }

  async createMatchChallenge(input: {
    challengerId: string;
    challengerName: string;
    challengerLoginId: string;
    challengedId: string;
    challengedName: string;
    challengedLoginId: string;
    timeControl: 'rapid10' | 'blitz5' | 'untimed';
  }): Promise<MatchChallengeRow> {
    const now = new Date().toISOString();
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('match_challenges')
        .insert({
          challenger_id: input.challengerId,
          challenger_name: input.challengerName,
          challenger_login_id: input.challengerLoginId,
          challenged_id: input.challengedId,
          challenged_name: input.challengedName,
          challenged_login_id: input.challengedLoginId,
          time_control: input.timeControl,
          status: 'pending',
          moves_san: '',
          resigned_by: null,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();
      if (!error && data) return data as MatchChallengeRow;
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    const row: MatchChallengeRow = {
      id: crypto.randomUUID(),
      challenger_id: input.challengerId,
      challenger_name: input.challengerName,
      challenger_login_id: input.challengerLoginId,
      challenged_id: input.challengedId,
      challenged_name: input.challengedName,
      challenged_login_id: input.challengedLoginId,
      time_control: input.timeControl,
      status: 'pending',
      moves_san: '',
      resigned_by: null,
      created_at: now,
      updated_at: now,
    };
    this.memChallenges.set(row.id, row);
    return { ...row };
  }

  async listChallengesForUser(userId: string): Promise<MatchChallengeRow[]> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('match_challenges')
        .select('*')
        .or(`challenger_id.eq.${userId},challenged_id.eq.${userId}`)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (!error && data) return data as MatchChallengeRow[];
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    return Array.from(this.memChallenges.values())
      .filter((c) => c.challenger_id === userId || c.challenged_id === userId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 20);
  }

  async getChallengeById(challengeId: string): Promise<MatchChallengeRow | null> {
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('match_challenges')
        .select('*')
        .eq('id', challengeId)
        .maybeSingle();
      if (!error) return (data as MatchChallengeRow | null) ?? null;
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    const found = this.memChallenges.get(challengeId);
    return found ? { ...found } : null;
  }

  async updateMatchChallenge(
    challengeId: string,
    patch: Partial<
      Pick<MatchChallengeRow, 'status' | 'moves_san' | 'resigned_by' | 'updated_at'>
    >
  ): Promise<MatchChallengeRow | null> {
    const nextPatch = { ...patch, updated_at: patch.updated_at || new Date().toISOString() };
    if (this.supabase && this.mode === 'supabase') {
      const { data, error } = await this.supabase
        .from('match_challenges')
        .update(nextPatch)
        .eq('id', challengeId)
        .select('*')
        .maybeSingle();
      if (!error) return (data as MatchChallengeRow | null) ?? null;
      if (error && !isMissingTableError(error)) throw new Error(error.message);
    }

    const existing = this.memChallenges.get(challengeId);
    if (!existing) return null;
    const updated: MatchChallengeRow = { ...existing, ...nextPatch };
    this.memChallenges.set(challengeId, updated);
    return { ...updated };
  }
}
