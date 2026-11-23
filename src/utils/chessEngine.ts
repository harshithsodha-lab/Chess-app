import { Chess, type Color, type Move, type PieceSymbol } from 'chess.js';

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

export const MATERIAL_DISPLAY_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

// Piece-square tables from White's perspective (rank 8 at index 0, rank 1 at index 7)
const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
];

const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

const KING_MID_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
];

const PST_MAP: Record<PieceSymbol, number[][]> = {
  p: PAWN_PST,
  n: KNIGHT_PST,
  b: BISHOP_PST,
  r: ROOK_PST,
  q: QUEEN_PST,
  k: KING_MID_PST,
};

/**
 * Returns evaluation in centipawns from White's perspective (+ = White better, - = Black better)
 */
export function evaluatePosition(chess: Chess): number {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -99999 : 99999;
  }
  if (
    chess.isDraw() ||
    chess.isStalemate() ||
    chess.isThreefoldRepetition() ||
    chess.isInsufficientMaterial()
  ) {
    return 0;
  }

  const board = chess.board();
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const baseValue = PIECE_VALUES[piece.type];
      const pstRow = piece.color === 'w' ? r : 7 - r;
      const positional = PST_MAP[piece.type][pstRow][c];
      const total = baseValue + positional;
      score += piece.color === 'w' ? total : -total;
    }
  }

  return score;
}

function orderMoves(moves: Move[]): Move[] {
  return moves.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    if (a.captured) scoreA += 10 * PIECE_VALUES[a.captured] - PIECE_VALUES[a.piece];
    if (b.captured) scoreB += 10 * PIECE_VALUES[b.captured] - PIECE_VALUES[b.piece];
    if (a.promotion) scoreA += PIECE_VALUES[a.promotion];
    if (b.promotion) scoreB += PIECE_VALUES[b.promotion];
    if (a.san.includes('+')) scoreA += 45;
    if (b.san.includes('+')) scoreB += 45;
    if (a.isKingsideCastle() || a.isQueensideCastle()) scoreA += 35;
    if (b.isKingsideCastle() || b.isQueensideCastle()) scoreB += 35;
    return scoreB - scoreA;
  });
}

function alphabeta(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizingWhite: boolean
): number {
  if (depth === 0 || chess.isGameOver()) {
    const evalScore = evaluatePosition(chess);
    if (evalScore > 90000) return evalScore + depth * 10;
    if (evalScore < -90000) return evalScore - depth * 10;
    return evalScore;
  }

  const moves = orderMoves(chess.moves({ verbose: true }));

  if (maximizingWhite) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const ev = alphabeta(chess, depth - 1, alpha, beta, false);
      chess.undo();
      if (ev > maxEval) maxEval = ev;
      if (ev > alpha) alpha = ev;
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      chess.move(move);
      const ev = alphabeta(chess, depth - 1, alpha, beta, true);
      chess.undo();
      if (ev < minEval) minEval = ev;
      if (ev < beta) beta = ev;
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

export type BotDifficulty = 'beginner' | 'club' | 'coach';

export function pickBotMove(chess: Chess, difficulty: BotDifficulty = 'club'): Move | null {
  const clone = new Chess(chess.fen());
  const moves = orderMoves(clone.moves({ verbose: true }));
  if (moves.length === 0) return null;

  const isWhite = clone.turn() === 'w';
  // Depth 1 (total 2 ply), Depth 2 (total 3 ply), Depth 2+extra/3 ply for Coach
  const searchDepth = difficulty === 'beginner' ? 0 : difficulty === 'club' ? 1 : 2;

  const scoredMoves: { move: Move; score: number }[] = [];

  for (const move of moves) {
    clone.move(move);
    const score = alphabeta(clone, searchDepth, -Infinity, Infinity, !isWhite);
    clone.undo();
    scoredMoves.push({ move, score });
  }

  scoredMoves.sort((a, b) => (isWhite ? b.score - a.score : a.score - b.score));

  if (difficulty === 'beginner' && scoredMoves.length > 1) {
    // Beginner plays a solid move ~65% of the time, or a top-4 imperfect move ~35% of the time
    const roll = Math.random();
    if (roll < 0.35) {
      const pool = scoredMoves.slice(0, Math.min(4, scoredMoves.length));
      return pool[Math.floor(Math.random() * pool.length)].move;
    }
    const pool = scoredMoves.slice(0, Math.min(2, scoredMoves.length));
    return pool[Math.floor(Math.random() * pool.length)].move;
  }

  const bestScore = scoredMoves[0].score;
  const tolerance = difficulty === 'coach' ? 4 : 10;
  const tied = scoredMoves.filter((m) => Math.abs(m.score - bestScore) <= tolerance);
  return tied[Math.floor(Math.random() * tied.length)].move;
}

export function findBestMove(chess: Chess): { move: Move; evalCp: number } | null {
  const clone = new Chess(chess.fen());
  const moves = orderMoves(clone.moves({ verbose: true }));
  if (moves.length === 0) return null;

  const isWhite = clone.turn() === 'w';
  let bestMove = moves[0];
  let bestScore = isWhite ? -Infinity : Infinity;

  for (const move of moves) {
    clone.move(move);
    const score = alphabeta(clone, 2, -Infinity, Infinity, !isWhite);
    clone.undo();
    if (isWhite ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return { move: bestMove, evalCp: bestScore };
}

export interface CapturedPiecesSummary {
  byWhite: PieceSymbol[];
  byBlack: PieceSymbol[];
  whiteAdvantage: number;
}

const CAPTURE_ORDER: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];

export function getCapturedPieces(chess: Chess): CapturedPiecesSummary {
  const startingCounts: Record<Color, Record<Exclude<PieceSymbol, 'k'>, number>> = {
    w: { q: 1, r: 2, b: 2, n: 2, p: 8 },
    b: { q: 1, r: 2, b: 2, n: 2, p: 8 },
  };

  const currentCounts: Record<Color, Record<Exclude<PieceSymbol, 'k'>, number>> = {
    w: { q: 0, r: 0, b: 0, n: 0, p: 0 },
    b: { q: 0, r: 0, b: 0, n: 0, p: 0 },
  };

  let whiteMaterial = 0;
  let blackMaterial = 0;

  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq || sq.type === 'k') continue;
      currentCounts[sq.color][sq.type]++;
      const val = MATERIAL_DISPLAY_VALUES[sq.type];
      if (sq.color === 'w') whiteMaterial += val;
      else blackMaterial += val;
    }
  }

  const byWhite: PieceSymbol[] = [];
  const byBlack: PieceSymbol[] = [];

  for (const type of CAPTURE_ORDER) {
    if (type === 'k') continue;
    const missingBlack = Math.max(0, startingCounts.b[type] - currentCounts.b[type]);
    for (let i = 0; i < missingBlack; i++) byWhite.push(type);

    const missingWhite = Math.max(0, startingCounts.w[type] - currentCounts.w[type]);
    for (let i = 0; i < missingWhite; i++) byBlack.push(type);
  }

  return {
    byWhite,
    byBlack,
    whiteAdvantage: whiteMaterial - blackMaterial,
  };
}

export function formatEvalLabel(cp: number, chess: Chess): string {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? '-M' : '+M';
  }
  const pawns = cp / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

export function buildAnnotatedPgn(
  initialFen: string,
  moves: string[],
  notes: Record<number, string>
): string {
  const standardFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const chess = new Chess(initialFen);
  const headers: string[] = [
    '[Event "Pure Chess Annotated Session"]',
    '[Site "Pure Chess Studio"]',
    `[Date "${new Date().toISOString().slice(0, 10)}"]`,
  ];
  if (initialFen !== standardFen) {
    headers.push('[SetUp "1"]');
    headers.push(`[FEN "${initialFen}"]`);
  }

  const parts: string[] = [];
  let needBlackEllipsis = chess.turn() === 'b';

  for (let i = 0; i < moves.length; i++) {
    const turnBefore = chess.turn();
    const moveNumber = chess.moveNumber();
    const m = chess.move(moves[i]);
    if (!m) break;

    if (turnBefore === 'w') {
      parts.push(`${moveNumber}. ${m.san}`);
      needBlackEllipsis = false;
    } else if (i === 0 || needBlackEllipsis || notes[i - 1]?.trim()) {
      parts.push(`${moveNumber}... ${m.san}`);
      needBlackEllipsis = false;
    } else {
      parts.push(m.san);
    }

    const comment = notes[i]?.trim();
    if (comment) {
      const sanitized = comment.replace(/[{}]/g, '');
      parts.push(`{ ${sanitized} }`);
      if (turnBefore === 'w') needBlackEllipsis = true;
    }
  }

  let result = '*';
  if (chess.isCheckmate()) {
    result = chess.turn() === 'w' ? '0-1' : '1-0';
  } else if (chess.isDraw()) {
    result = '1/2-1/2';
  }
  headers.push(`[Result "${result}"]`);

  return `${headers.join('\n')}\n\n${parts.join(' ')} ${result}`.trim();
}
