import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import {
  AcademyStore,
  computeLivePresence,
  hashPassword,
  sanitizeUser,
  verifyPassword,
  type AcademyUserRow,
  type PresenceStatus,
  type UserRole,
} from './server/academyStore.ts';
import { checkMessageSafety } from './server/moderation.ts';

interface TokenPayload {
  userId: string;
  loginId: string;
  role: UserRole;
  exp: number;
}

interface AuthenticatedRequest extends Request {
  authUser?: AcademyUserRow;
  tokenPayload?: TokenPayload;
}

const PORT = 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function signToken(payload: Omit<TokenPayload, 'exp'>): string {
  const full: TokenPayload = { ...payload, exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.userId || !parsed.role || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

function timingSafeTextEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function validateAndNormalizePuzzleMoves(fen: string, rawMoves: string): string {
  const chess = new Chess(fen);
  const tokens = rawMoves
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error('At least one solution move is required.');
  }

  const normalizedUci: string[] = [];
  for (const token of tokens) {
    let moveObj = null;
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(token)) {
      moveObj = chess.move({
        from: token.slice(0, 2).toLowerCase() as Square,
        to: token.slice(2, 4).toLowerCase() as Square,
        promotion: token[4]?.toLowerCase() as PieceSymbol | undefined,
      });
    } else {
      moveObj = chess.move(token);
    }

    if (!moveObj) {
      throw new Error(`Illegal solution move "${token}" for this position.`);
    }
    normalizedUci.push(`${moveObj.from}${moveObj.to}${moveObj.promotion ?? ''}`);
  }

  return normalizedUci.join(',');
}

async function startServer() {
  const app = express();
  const store = new AcademyStore();
  await store.init();

  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ type: 'text/plain', limit: '32kb' }));

  const envAdminPassword = () => (process.env.ACADEMY_ADMIN_PASSWORD || '').trim();
  const envAdminLoginId = () =>
    (process.env.ACADEMY_ADMIN_LOGIN_ID || 'COACH_ADMIN').trim().toUpperCase();

  // Middleware: Verify Bearer token and load live DB user
  const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Session expired or invalid.' });
      return;
    }
    try {
      const user = await store.findUserById(payload.userId);
      if (!user) {
        res.status(401).json({ error: 'Account no longer exists.' });
        return;
      }
      req.authUser = user;
      req.tokenPayload = payload;
      next();
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Auth lookup failed.' });
    }
  };

  const requireApproved = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    await requireAuth(req, res, () => {
      const user = req.authUser!;
      if (user.role !== 'admin' && !user.session_approved) {
        res.status(403).json({ error: 'Waiting for Coach/Admin session approval.' });
        return;
      }
      next();
    });
  };

  const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      if (req.authUser?.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required.' });
        return;
      }
      next();
    });
  };

  // =========================================================================
  // AUTH & GATEKEEPER ROUTES
  // =========================================================================

  app.get('/api/auth/status', async (_req: Request, res: Response) => {
    try {
      const status = store.getStatus();
      const rtUrl = (process.env.VITE_SUPABASE_URL || '').trim();
      const rtKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
      const validRtUrl = /^https?:\/\/.+/i.test(rtUrl);

      res.json({
        needsAdminBootstrap: false,
        envAdminLoginHint: null,
        ...status,
        realtimeConfig: {
          url: status.storageMode === 'supabase' && validRtUrl ? rtUrl : '',
          anonKey: status.storageMode === 'supabase' && validRtUrl ? rtKey : '',
        },
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Status check failed.' });
    }
  });

  app.post('/api/auth/bootstrap-admin', async (req: Request, res: Response) => {
    try {
      const hasAdmin = await store.hasAdminUser();
      if (envAdminPassword() || hasAdmin) {
        res.status(409).json({ error: 'Admin account is already initialized.' });
        return;
      }

      const loginId = String(req.body?.loginId || '').trim().toUpperCase();
      const fullName = String(req.body?.fullName || 'Head Coach').trim();
      const password = String(req.body?.password || '');

      if (!/^[A-Z0-9_-]{3,32}$/.test(loginId)) {
        res.status(400).json({
          error: 'Admin Login ID must be 3–32 characters (letters, numbers, _ or -).',
        });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }

      const admin = await store.createUser({
        loginId,
        password,
        fullName: fullName || 'Head Coach',
        role: 'admin',
      });

      const token = signToken({ userId: admin.id, loginId: admin.login_id, role: 'admin' });
      res.status(201).json({
        status: 'approved',
        token,
        user: sanitizeUser(admin),
        ...store.getStatus(),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Setup failed.' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const loginId = String(req.body?.loginId || '').trim().toUpperCase();
      const password = String(req.body?.password || '');

      if (!loginId || !password) {
        res.status(400).json({ error: 'Login ID and password are required.' });
        return;
      }

      // Check environment-configured Admin passcode override first
      const configuredAdminPass = envAdminPassword();
      const configuredAdminId = envAdminLoginId();
      if (configuredAdminPass && loginId === configuredAdminId) {
        if (!timingSafeTextEqual(password, configuredAdminPass)) {
          res.status(401).json({ error: 'Invalid Login ID or password.' });
          return;
        }
        let adminRow = await store.findUserByLoginId(configuredAdminId);
        if (!adminRow) {
          adminRow = await store.createUser({
            loginId: configuredAdminId,
            password: configuredAdminPass,
            fullName: 'Academy Coach',
            role: 'admin',
          });
        } else {
          adminRow =
            (await store.updateUserSession(adminRow.id, {
              session_approved: true,
              pending_approval: false,
              last_login_request: new Date().toISOString(),
            })) || adminRow;
        }

        const token = signToken({
          userId: adminRow.id,
          loginId: adminRow.login_id,
          role: 'admin',
        });
        res.json({
          status: 'approved',
          token,
          user: sanitizeUser(adminRow),
          ...store.getStatus(),
        });
        return;
      }

      const user = await store.findUserByLoginId(loginId);
      if (!user || !verifyPassword(password, user.password_hash)) {
        res.status(401).json({ error: 'Invalid Login ID or password.' });
        return;
      }

      const now = new Date().toISOString();
      const updated =
        (await store.updateUserSession(user.id, {
          session_approved: true,
          pending_approval: false,
          last_login_request: now,
        })) || user;

      const token = signToken({
        userId: updated.id,
        loginId: updated.login_id,
        role: updated.role,
      });
      await store.updatePresence(updated.id, 'online');

      res.json({
        status: 'approved',
        token,
        user: sanitizeUser(updated),
        ...store.getStatus(),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Login failed.' });
    }
  });

  app.get('/api/auth/session-status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const approved = user.role === 'admin' || Boolean(user.session_approved);
    res.json({
      approved,
      pending: Boolean(user.pending_approval),
      user: sanitizeUser(user),
      ...store.getStatus(),
    });
  });

  app.post('/api/auth/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    if (user.role === 'student') {
      await store.updateUserSession(user.id, {
        session_approved: false,
        pending_approval: false,
      });
    }
    await store.updatePresence(user.id, 'offline');
    res.json({ ok: true });
  });

  app.post('/api/auth/logout-beacon', async (req: Request, res: Response) => {
    try {
      let token = '';
      if (typeof req.body === 'string') {
        const parsed = JSON.parse(req.body) as { token?: string };
        token = String(parsed?.token || '');
      } else if (req.body && typeof req.body === 'object') {
        token = String((req.body as { token?: string }).token || '');
      }
      const payload = verifyToken(token);
      if (payload) {
        if (payload.role === 'student') {
          await store.updateUserSession(payload.userId, {
            session_approved: false,
            pending_approval: false,
          });
        }
        await store.updatePresence(payload.userId, 'offline');
      }
    } catch {
      // Ignore malformed beacon
    }
    res.status(204).end();
  });

  // =========================================================================
  // PROTECTED PUZZLE & PROGRESS ROUTES (Approved Students & Admin)
  // =========================================================================

  app.get('/api/puzzles', requireApproved, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const [puzzles, progress] = await Promise.all([
        store.listCustomPuzzles(),
        store.listProgressForUser(user.id),
      ]);
      res.json({ puzzles, progress });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load puzzles.' });
    }
  });

  app.post(
    '/api/puzzles/:puzzleId/progress',
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.authUser!;
        const puzzleId = String(req.params.puzzleId || '').trim();
        const solved = Boolean(req.body?.solved);
        if (!puzzleId) {
          res.status(400).json({ error: 'Puzzle ID is required.' });
          return;
        }
        const row = await store.recordPuzzleAttempt(user.id, puzzleId, solved);
        res.json({ progress: row });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to record puzzle progress.',
        });
      }
    }
  );

  // =========================================================================
  // RECENT ACADEMY GAMES ROUTES (Approved Students & Admin)
  // =========================================================================

  app.get('/api/games', requireApproved, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const games = await store.listGamesForUser(user.id);
      res.json({ games });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load games.' });
    }
  });

  app.post('/api/games', requireApproved, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const opponentLabel = String(req.body?.opponentLabel || 'Coach Bot').trim().slice(0, 64);
      const timeControl = String(req.body?.timeControl || 'Untimed').trim().slice(0, 32);
      const playerColor = req.body?.playerColor === 'b' ? 'b' : 'w';
      const rawResult = String(req.body?.result || '').toLowerCase();
      const result = rawResult === 'win' || rawResult === 'loss' || rawResult === 'draw' ? rawResult : null;
      const resultReason = String(req.body?.resultReason || '').trim().slice(0, 80);
      const initialFenRaw = String(
        req.body?.initialFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      ).trim();
      const movesArray = Array.isArray(req.body?.moves)
        ? (req.body.moves as unknown[]).map((m) => String(m).trim()).filter(Boolean)
        : [];

      if (!result) {
        res.status(400).json({ error: 'Valid game result (win, loss, draw) is required.' });
        return;
      }

      let validatedFen = '';
      try {
        const chess = new Chess(initialFenRaw);
        validatedFen = chess.fen();
        for (const san of movesArray) {
          chess.move(san);
        }
      } catch {
        res.status(400).json({ error: 'Invalid FEN or move sequence.' });
        return;
      }

      const row = await store.recordGame({
        userId: user.id,
        opponentLabel: opponentLabel || 'Coach Bot',
        timeControl: timeControl || 'Untimed',
        playerColor,
        result,
        resultReason,
        initialFen: validatedFen,
        movesSan: movesArray.join(' '),
        moveCount: Math.ceil(movesArray.length / 2),
      });

      res.status(201).json({ game: row });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save game.' });
    }
  });

  // =========================================================================
  // LIVE STUDENT <-> ACADEMY COACH MESSAGING ROUTES
  // =========================================================================

  app.get(
    '/api/coach/messages',
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.authUser!;
        if (user.role === 'student') {
          const messages = await store.listCoachMessagesForStudent(user.id);
          res.json({ messages });
          return;
        }

        const studentIdQuery = String(req.query.studentId || '').trim();
        if (studentIdQuery) {
          const messages = await store.listCoachMessagesForStudent(studentIdQuery);
          res.json({ messages });
          return;
        }

        const messages = await store.listAllCoachMessages();
        res.json({ messages });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to load coach messages.',
        });
      }
    }
  );

  app.post(
    '/api/coach/messages',
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.authUser!;
        const messageText = String(req.body?.messageText || '').trim().slice(0, 1500);
        const attachedContext = String(req.body?.attachedContext || '').trim().slice(0, 120);
        const rawFen =
          typeof req.body?.attachedFen === 'string' ? req.body.attachedFen.trim() : '';

        if (!messageText) {
          res.status(400).json({ error: 'Message text cannot be empty.' });
          return;
        }

        let validatedFen: string | null = null;
        if (rawFen) {
          try {
            validatedFen = new Chess(rawFen).fen();
          } catch {
            res.status(400).json({ error: 'Attached board FEN is invalid.' });
            return;
          }
        }

        let targetStudentId = user.id;
        if (user.role === 'admin') {
          const requestedStudentId = String(req.body?.studentId || '').trim();
          if (!requestedStudentId) {
            res.status(400).json({ error: 'Target studentId is required for coach replies.' });
            return;
          }
          const targetStudent = await store.findUserById(requestedStudentId);
          if (!targetStudent) {
            res.status(404).json({ error: 'Student account not found.' });
            return;
          }
          targetStudentId = targetStudent.id;
        }

        const message = await store.createCoachMessage({
          studentId: targetStudentId,
          senderId: user.id,
          senderRole: user.role,
          senderName: user.full_name || user.login_id,
          messageText,
          attachedFen: validatedFen,
          attachedContext,
        });

        res.status(201).json({ message });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to send coach message.',
        });
      }
    }
  );

  // =========================================================================
  // PRESENCE, FRIENDS DIRECTORY, LIVE CHALLENGES & SAFE SOCIAL CHAT ROUTES
  // =========================================================================

  app.post('/api/presence', requireApproved, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const raw = String(req.body?.status || 'online');
      const status: PresenceStatus =
        raw === 'in_game' ? 'in_game' : raw === 'offline' ? 'offline' : 'online';
      await store.updatePresence(user.id, status);
      res.json({ ok: true, chat_disabled: Boolean(user.chat_disabled) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Presence update failed.' });
    }
  });

  app.get('/api/friends', requireApproved, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const [students, friendships, challenges] = await Promise.all([
        store.listStudents(),
        store.listFriendshipsForUser(user.id),
        store.listChallengesForUser(user.id),
      ]);

      const classmates = students
        .filter((s) => s.id !== user.id)
        .map((s) => {
          const rel = friendships.find(
            (f) =>
              (f.requester_id === user.id && f.addressee_id === s.id) ||
              (f.requester_id === s.id && f.addressee_id === user.id)
          );
          const effectiveStatus =
            rel && rel.status !== 'declined' ? rel.status : ('none' as const);
          const direction =
            effectiveStatus === 'none' || !rel
              ? ('none' as const)
              : rel.requester_id === user.id
              ? ('outgoing' as const)
              : ('incoming' as const);

          return {
            id: s.id,
            login_id: s.login_id,
            full_name: s.full_name,
            presence_status: computeLivePresence(s),
            chat_disabled: Boolean(s.chat_disabled),
            friendship_id: effectiveStatus === 'none' || !rel ? null : rel.id,
            friendship_status: effectiveStatus,
            friendship_direction: direction,
          };
        })
        .sort((a, b) => {
          const rank = (p: PresenceStatus) => (p === 'online' ? 0 : p === 'in_game' ? 1 : 2);
          const rDiff = rank(a.presence_status) - rank(b.presence_status);
          return rDiff !== 0 ? rDiff : a.full_name.localeCompare(b.full_name);
        });

      res.json({ classmates, challenges });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load friends.' });
    }
  });

  app.post(
    '/api/friends/request',
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.authUser!;
        const targetUserId = String(req.body?.targetUserId || '').trim();
        if (!targetUserId || targetUserId === user.id) {
          res.status(400).json({ error: 'Valid classmate ID is required.' });
          return;
        }
        const target = await store.findUserById(targetUserId);
        if (!target) {
          res.status(404).json({ error: 'Classmate account not found.' });
          return;
        }
        const friendship = await store.upsertFriendRequest(user.id, targetUserId);
        res.status(201).json({ friendship });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Friend request failed.' });
      }
    }
  );

  app.post(
    '/api/friends/respond',
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.authUser!;
        const friendshipId = String(req.body?.friendshipId || '').trim();
        const accept = Boolean(req.body?.accept);
        if (!friendshipId) {
          res.status(400).json({ error: 'Friendship ID is required.' });
          return;
        }
        const updated = await store.respondFriendRequest(friendshipId, user.id, accept);
        if (!updated) {
          res.status(404).json({ error: 'Friend request not found or unauthorized.' });
          return;
        }
        res.json({ friendship: updated });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Respond failed.' });
      }
    }
  );

  app.get('/api/challenges', requireApproved, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const challenges = await store.listChallengesForUser(req.authUser!.id);
      res.json({ challenges });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load challenges.' });
    }
  });

  app.post('/api/challenges', requireApproved, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const opponentId = String(req.body?.opponentId || '').trim();
      const rawTc = String(req.body?.timeControl || 'rapid10');
      const timeControl =
        rawTc === 'blitz5' ? 'blitz5' : rawTc === 'untimed' ? 'untimed' : 'rapid10';

      if (!opponentId || opponentId === user.id) {
        res.status(400).json({ error: 'Select a valid online friend to challenge.' });
        return;
      }

      const opponent = await store.findUserById(opponentId);
      if (!opponent) {
        res.status(404).json({ error: 'Opponent not found.' });
        return;
      }

      const oppPresence = computeLivePresence(opponent);
      if (oppPresence === 'offline') {
        res.status(400).json({ error: `${opponent.full_name} is currently offline.` });
        return;
      }

      const challenge = await store.createMatchChallenge({
        challengerId: user.id,
        challengerName: user.full_name || user.login_id,
        challengerLoginId: user.login_id,
        challengedId: opponent.id,
        challengedName: opponent.full_name || opponent.login_id,
        challengedLoginId: opponent.login_id,
        timeControl,
      });

      res.status(201).json({ challenge });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Challenge failed.' });
    }
  });

  app.post(
    '/api/challenges/:challengeId/respond',
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.authUser!;
        const challengeId = String(req.params.challengeId || '').trim();
        const accept = Boolean(req.body?.accept);
        const challenge = await store.getChallengeById(challengeId);

        if (!challenge) {
          res.status(404).json({ error: 'Challenge not found.' });
          return;
        }
        if (challenge.challenged_id !== user.id) {
          res.status(403).json({ error: 'Only the challenged player can respond.' });
          return;
        }
        if (challenge.status !== 'pending') {
          res.json({ challenge });
          return;
        }

        const updated = await store.updateMatchChallenge(challengeId, {
          status: accept ? 'accepted' : 'declined',
        });
        if (accept) {
          await Promise.all([
            store.updatePresence(challenge.challenger_id, 'in_game'),
            store.updatePresence(challenge.challenged_id, 'in_game'),
          ]);
        }
        res.json({ challenge: updated });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Response failed.' });
      }
    }
  );

  app.get(
    '/api/challenges/:challengeId',
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.authUser!;
        const challengeId = String(req.params.challengeId || '').trim();
        const challenge = await store.getChallengeById(challengeId);
        if (!challenge) {
          res.status(404).json({ error: 'Match not found.' });
          return;
        }
        if (
          challenge.challenger_id !== user.id &&
          challenge.challenged_id !== user.id &&
          user.role !== 'admin'
        ) {
          res.status(403).json({ error: 'Access denied.' });
          return;
        }
        res.json({ challenge });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Load match failed.' });
      }
    }
  );

  app.post(
    '/api/challenges/:challengeId/move',
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.authUser!;
        const challengeId = String(req.params.challengeId || '').trim();
        const challenge = await store.getChallengeById(challengeId);
        if (!challenge) {
          res.status(404).json({ error: 'Match not found.' });
          return;
        }

        const isWhite = challenge.challenger_id === user.id;
        const isBlack = challenge.challenged_id === user.id;
        if (!isWhite && !isBlack) {
          res.status(403).json({ error: 'You are not a participant in this match.' });
          return;
        }
        if (challenge.status !== 'accepted') {
          res.status(400).json({ error: 'Match is no longer active.' });
          return;
        }

        const playerColor = isWhite ? 'w' : 'b';
        if (req.body?.resign) {
          const updated = await store.updateMatchChallenge(challengeId, {
            resigned_by: playerColor,
            status: 'completed',
          });
          res.json({ challenge: updated });
          return;
        }

        const from = String(req.body?.from || '').toLowerCase() as Square;
        const to = String(req.body?.to || '').toLowerCase() as Square;
        const promotion = req.body?.promotion
          ? (String(req.body.promotion).toLowerCase() as PieceSymbol)
          : undefined;

        const chess = new Chess();
        const existingMoves = challenge.moves_san
          .split(/\s+/)
          .map((m) => m.trim())
          .filter(Boolean);
        for (const san of existingMoves) {
          chess.move(san);
        }

        if (chess.turn() !== playerColor) {
          res.status(409).json({ error: 'Wait for your opponent to move.' });
          return;
        }

        let applied = null;
        try {
          applied = chess.move({ from, to, promotion });
        } catch {
          applied = null;
        }
        if (!applied) {
          res.status(400).json({ error: 'Illegal chess move.' });
          return;
        }

        const nextMoves = [...existingMoves, applied.san].join(' ');
        const nextStatus = chess.isGameOver() ? 'completed' : 'accepted';
        const updated = await store.updateMatchChallenge(challengeId, {
          moves_san: nextMoves,
          status: nextStatus,
        });
        res.json({ challenge: updated });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Move failed.' });
      }
    }
  );

  app.get(
    '/api/social/messages',
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.authUser!;
        const channelType = req.query.channelType === 'match' ? 'match' : 'dm';
        const peerId = String(req.query.peerId || '').trim();
        const matchRoomId = String(req.query.matchRoomId || '').trim();

        if (channelType === 'dm') {
          if (!peerId) {
            res.json({ messages: [] });
            return;
          }
          const messages = await store.listSocialMessages({
            channelType: 'dm',
            userId: user.id,
            peerId,
          });
          res.json({ messages });
          return;
        }

        if (!matchRoomId) {
          res.json({ messages: [] });
          return;
        }

        if (matchRoomId.startsWith('challenge:')) {
          const chId = matchRoomId.slice('challenge:'.length);
          const ch = await store.getChallengeById(chId);
          if (
            !ch ||
            (ch.challenger_id !== user.id &&
              ch.challenged_id !== user.id &&
              user.role !== 'admin')
          ) {
            res.status(403).json({ error: 'Access denied to this match chat.' });
            return;
          }
        } else if (!matchRoomId.startsWith(`local:${user.id}`)) {
          res.status(403).json({ error: 'Access denied to this match room.' });
          return;
        }

        const messages = await store.listSocialMessages({
          channelType: 'match',
          userId: user.id,
          matchRoomId,
        });
        res.json({ messages });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load messages.' });
      }
    }
  );

  app.post(
    '/api/social/messages',
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.authUser!;
        if (user.chat_disabled && user.role !== 'admin') {
          res.status(403).json({
            error: 'Chat has been disabled for your account by an Academy Admin.',
          });
          return;
        }

        const channelType = req.body?.channelType === 'match' ? 'match' : 'dm';
        const recipientId =
          typeof req.body?.recipientId === 'string' ? req.body.recipientId.trim() : null;
        const matchRoomId =
          typeof req.body?.matchRoomId === 'string' ? req.body.matchRoomId.trim() : null;
        const rawText = String(req.body?.messageText || '');

        if (channelType === 'dm') {
          if (!recipientId || recipientId === user.id) {
            res.status(400).json({ error: 'Select a valid classmate for direct messaging.' });
            return;
          }
          const peer = await store.findUserById(recipientId);
          if (!peer) {
            res.status(404).json({ error: 'Recipient not found.' });
            return;
          }
        } else {
          if (!matchRoomId) {
            res.status(400).json({ error: 'Match room ID is required.' });
            return;
          }
          if (matchRoomId.startsWith('challenge:')) {
            const chId = matchRoomId.slice('challenge:'.length);
            const ch = await store.getChallengeById(chId);
            if (!ch || (ch.challenger_id !== user.id && ch.challenged_id !== user.id)) {
              res.status(403).json({ error: 'You are not a participant in this match.' });
              return;
            }
          } else if (!matchRoomId.startsWith(`local:${user.id}`)) {
            res.status(403).json({ error: 'Unauthorized match chat room.' });
            return;
          }
        }

        const moderation = checkMessageSafety(user.id, rawText);
        if (!moderation.allowed) {
          if (moderation.flagged && moderation.cleanText) {
            await store.createSocialMessage({
              channelType,
              senderId: user.id,
              recipientId: channelType === 'dm' ? recipientId : null,
              matchRoomId: channelType === 'match' ? matchRoomId : null,
              senderName: user.full_name || user.login_id,
              senderLoginId: user.login_id,
              messageText: moderation.cleanText,
              flagged: true,
              flagReason: moderation.reason,
            });
          }
          res.status(422).json({
            error: `Blocked by Academy safety filter: ${moderation.reason}`,
            flagged: moderation.flagged,
          });
          return;
        }

        const message = await store.createSocialMessage({
          channelType,
          senderId: user.id,
          recipientId: channelType === 'dm' ? recipientId : null,
          matchRoomId: channelType === 'match' ? matchRoomId : null,
          senderName: user.full_name || user.login_id,
          senderLoginId: user.login_id,
          messageText: moderation.cleanText,
          flagged: false,
          flagReason: '',
        });

        res.status(201).json({ message });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send message.' });
      }
    }
  );

  // =========================================================================
  // ADMIN-ONLY CONTROL CENTER ROUTES
  // =========================================================================

  app.get('/api/admin/overview', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const [students, puzzles, progress, flaggedMessages] = await Promise.all([
        store.listStudents(),
        store.listCustomPuzzles(),
        store.listAllProgress(),
        store.listFlaggedSocialMessages(),
      ]);

      const sanitized = students.map(sanitizeUser);
      res.json({
        pendingRequests: sanitized.filter((s) => s.pending_approval && !s.session_approved),
        activeStudents: sanitized.filter((s) => s.session_approved),
        students: sanitized,
        puzzles,
        progress,
        flaggedMessages,
        ...store.getStatus(),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Admin load failed.' });
    }
  });

  app.patch(
    '/api/admin/students/:userId/chat',
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = String(req.params.userId || '').trim();
        const disabled = Boolean(req.body?.disabled);
        const updated = await store.setStudentChatDisabled(userId, disabled);
        if (!updated) {
          res.status(404).json({ error: 'Student not found.' });
          return;
        }
        res.json({ user: sanitizeUser(updated) });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Chat update failed.' });
      }
    }
  );

  app.post(
    '/api/admin/moderation/:messageId/dismiss',
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const messageId = String(req.params.messageId || '').trim();
        const ok = await store.dismissFlaggedMessage(messageId);
        if (!ok) {
          res.status(404).json({ error: 'Flagged message not found.' });
          return;
        }
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Dismiss failed.' });
      }
    }
  );

  app.delete(
    '/api/admin/social/messages/:messageId',
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const messageId = String(req.params.messageId || '').trim();
        const ok = await store.deleteSocialMessage(messageId);
        if (!ok) {
          res.status(404).json({ error: 'Message not found.' });
          return;
        }
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Delete message failed.' });
      }
    }
  );

  app.post(
    '/api/admin/requests/:userId/approve',
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = String(req.params.userId || '');
      const updated = await store.updateUserSession(userId, {
        session_approved: true,
        pending_approval: false,
      });
      if (!updated) {
        res.status(404).json({ error: 'Student not found.' });
        return;
      }
      await store.updatePresence(userId, 'online');
      res.json({ user: sanitizeUser(updated) });
    }
  );

  app.post(
    '/api/admin/requests/:userId/deny',
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = String(req.params.userId || '');
      const updated = await store.updateUserSession(userId, {
        session_approved: false,
        pending_approval: false,
      });
      if (!updated) {
        res.status(404).json({ error: 'Student not found.' });
        return;
      }
      await store.updatePresence(userId, 'offline');
      res.json({ user: sanitizeUser(updated) });
    }
  );

  app.post(
    '/api/admin/students/:userId/revoke',
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = String(req.params.userId || '');
      const updated = await store.updateUserSession(userId, {
        session_approved: false,
        pending_approval: false,
      });
      if (!updated) {
        res.status(404).json({ error: 'Student not found.' });
        return;
      }
      await store.updatePresence(userId, 'offline');
      res.json({ user: sanitizeUser(updated) });
    }
  );

  app.post('/api/admin/students', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const loginId = String(req.body?.loginId || '').trim().toUpperCase();
      const fullName = String(req.body?.fullName || '').trim();
      const password = String(req.body?.password || '');

      if (!/^[A-Z0-9_-]{3,32}$/.test(loginId)) {
        res.status(400).json({
          error: 'Login ID must be 3–32 characters (letters, numbers, _ or -).',
        });
        return;
      }
      if (!fullName) {
        res.status(400).json({ error: 'Student full name is required.' });
        return;
      }
      if (password.length < 4) {
        res.status(400).json({ error: 'Password must be at least 4 characters.' });
        return;
      }

      const created = await store.createUser({
        loginId,
        password,
        fullName,
        role: 'student',
      });
      res.status(201).json({ user: sanitizeUser(created) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Create student failed.' });
    }
  });

  app.patch(
    '/api/admin/students/:userId/password',
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = String(req.params.userId || '');
      const password = String(req.body?.password || '');
      if (password.length < 4) {
        res.status(400).json({ error: 'New password must be at least 4 characters.' });
        return;
      }
      const existing = await store.findUserById(userId);
      if (!existing || existing.role !== 'student') {
        res.status(404).json({ error: 'Student not found.' });
        return;
      }
      const updated = await store.updateUserSession(userId, {
        password_hash: hashPassword(password),
      });
      res.json({ user: updated ? sanitizeUser(updated) : null });
    }
  );

  app.delete(
    '/api/admin/students/:userId',
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = String(req.params.userId || '');
      const ok = await store.deleteStudent(userId);
      if (!ok) {
        res.status(404).json({ error: 'Student not found.' });
        return;
      }
      res.json({ ok: true });
    }
  );

  app.post('/api/admin/puzzles', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const title = String(req.body?.title || '').trim();
      const fen = String(req.body?.fen || '').trim();
      const solutionMovesRaw = String(req.body?.solution_moves || '').trim();
      const difficulty = String(req.body?.difficulty || 'Intermediate').trim();
      const coachNotes = String(req.body?.coach_notes || '').trim();

      if (!title) {
        res.status(400).json({ error: 'Puzzle title is required.' });
        return;
      }

      let validatedFen = '';
      try {
        validatedFen = new Chess(fen).fen();
      } catch {
        res.status(400).json({ error: 'Invalid FEN position.' });
        return;
      }

      const normalizedSolution = validateAndNormalizePuzzleMoves(validatedFen, solutionMovesRaw);
      const created = await store.createCustomPuzzle({
        title,
        fen: validatedFen,
        solution_moves: normalizedSolution,
        difficulty,
        coach_notes: coachNotes,
      });

      res.status(201).json({ puzzle: created });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid puzzle.' });
    }
  });

  app.delete(
    '/api/admin/puzzles/:puzzleId',
    requireAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const puzzleId = String(req.params.puzzleId || '');
      const ok = await store.deleteCustomPuzzle(puzzleId);
      if (!ok) {
        res.status(404).json({ error: 'Puzzle not found.' });
        return;
      }
      res.json({ ok: true });
    }
  );

  app.post(
    '/api/admin/recheck-supabase',
    requireAdmin,
    async (_req: AuthenticatedRequest, res: Response) => {
      await store.init();
      res.json(store.getStatus());
    }
  );

  // =========================================================================
  // VITE / STATIC SERVING
  // =========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pure Chess Academy server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
