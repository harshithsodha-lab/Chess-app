import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import {
  evaluatePosition,
  findBestMove,
  formatEvalLabel,
  PIECE_VALUES,
} from './chessEngine';

export type CoachBoardMode = 'play' | 'puzzles' | 'analyze';

export interface HangingPieceInfo {
  square: Square;
  color: Color;
  type: PieceSymbol;
  attackedBy: Square[];
  defended: boolean;
  underAttackByLesser: boolean;
}

export interface CoachPositionReport {
  valid: boolean;
  turn: Color;
  phase: 'Opening' | 'Middlegame' | 'Endgame';
  openingName: string | null;
  evalLabel: string;
  inCheck: boolean;
  isGameOver: boolean;
  hangingForTurn: HangingPieceInfo[];
  hangingForOpponent: HangingPieceInfo[];
  mateInOneAvailable: boolean;
  opponentHasMateThreat: boolean;
  summaryText: string;
  threatsText: string;
  hangingText: string;
  planText: string;
}

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

const OPENING_BOOK: { moves: string[]; name: string }[] = [
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], name: 'Italian Game · Giuoco Piano' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], name: 'Italian Game · Two Knights Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], name: 'Italian Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], name: 'Ruy Lopez (Spanish Opening)' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], name: 'Scotch Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nf6'], name: "Petrov's Defense" },
  { moves: ['e4', 'e5', 'Qh5'], name: "Wayward Queen / Scholar's Attempt" },
  { moves: ['e4', 'e5', 'Nc3'], name: 'Vienna Game' },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4'], name: 'Sicilian Defense · Open' },
  { moves: ['e4', 'c5'], name: 'Sicilian Defense' },
  { moves: ['e4', 'e6'], name: 'French Defense' },
  { moves: ['e4', 'c6'], name: 'Caro-Kann Defense' },
  { moves: ['e4', 'd5'], name: 'Scandinavian Defense' },
  { moves: ['e4', 'd6'], name: 'Pirc Defense' },
  { moves: ['d4', 'd5', 'c4', 'e6'], name: "Queen's Gambit Declined" },
  { moves: ['d4', 'd5', 'c4', 'c6'], name: 'Slav Defense' },
  { moves: ['d4', 'd5', 'c4'], name: "Queen's Gambit" },
  { moves: ['d4', 'Nf6', 'Bf4'], name: 'London System' },
  { moves: ['d4', 'd5', 'Bf4'], name: 'London System' },
  { moves: ['d4', 'Nf6', 'c4', 'g6'], name: "King's Indian Defense" },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], name: 'Nimzo-Indian Defense' },
  { moves: ['c4'], name: 'English Opening' },
];

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export function detectOpeningName(moves: string[]): string | null {
  if (moves.length === 0) return null;
  const normalized = moves.map((m) => m.replace(/[+#!?]+$/g, ''));
  for (const entry of OPENING_BOOK) {
    if (normalized.length >= entry.moves.length) {
      const match = entry.moves.every((m, idx) => normalized[idx] === m);
      if (match) return entry.name;
    }
  }
  if (normalized[0] === 'e4') return "King's Pawn Opening";
  if (normalized[0] === 'd4') return "Queen's Pawn Opening";
  return null;
}

function flipFenTurn(fen: string): string | null {
  const parts = fen.split(' ');
  if (parts.length < 4) return null;
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-'; // clear en passant to avoid illegal state when flipping turn
  return parts.join(' ');
}

export function analyzeBoardForCoach(params: {
  fen: string;
  moves?: string[];
  mode: CoachBoardMode;
  puzzleHint?: string;
}): CoachPositionReport {
  const { fen, moves = [], mode, puzzleHint } = params;

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return {
      valid: false,
      turn: 'w',
      phase: 'Opening',
      openingName: null,
      evalLabel: '0.0',
      inCheck: false,
      isGameOver: false,
      hangingForTurn: [],
      hangingForOpponent: [],
      mateInOneAvailable: false,
      opponentHasMateThreat: false,
      summaryText: 'Board position is invalid right now.',
      threatsText: 'Unable to scan threats on an invalid FEN.',
      hangingText: 'Reset or undo to a valid position.',
      planText: 'Restore a valid board state first.',
    };
  }

  const turn = chess.turn();
  const opp: Color = turn === 'w' ? 'b' : 'w';
  const sideLabel = turn === 'w' ? 'White' : 'Black';
  const oppLabel = opp === 'w' ? 'White' : 'Black';

  const evalCp = evaluatePosition(chess);
  const evalLabel = formatEvalLabel(evalCp, chess);
  const openingName = detectOpeningName(moves);

  // Determine game phase based on non-pawn, non-king material
  const board = chess.board();
  let nonPawnMaterial = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.type === 'k' || piece.type === 'p') continue;
      nonPawnMaterial += PIECE_VALUES[piece.type];
    }
  }
  const phase: CoachPositionReport['phase'] =
    moves.length < 12 && nonPawnMaterial > 4600
      ? 'Opening'
      : nonPawnMaterial <= 2600
      ? 'Endgame'
      : 'Middlegame';

  // Scan hanging pieces
  const hangingForTurn: HangingPieceInfo[] = [];
  const hangingForOpponent: HangingPieceInfo[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (!cell || cell.type === 'k') continue;
      const sq = `${FILES[c]}${8 - r}` as Square;
      const enemyColor: Color = cell.color === 'w' ? 'b' : 'w';

      const attackers = chess.attackers(sq, enemyColor);
      if (attackers.length === 0) continue;

      const defenders = chess.attackers(sq, cell.color);
      const defended = defenders.length > 0;

      const myVal = PIECE_VALUES[cell.type];
      let underAttackByLesser = false;
      for (const attSq of attackers) {
        const attPiece = chess.get(attSq);
        if (attPiece && PIECE_VALUES[attPiece.type] < myVal) {
          underAttackByLesser = true;
          break;
        }
      }

      if (!defended || underAttackByLesser) {
        const info: HangingPieceInfo = {
          square: sq,
          color: cell.color,
          type: cell.type,
          attackedBy: attackers,
          defended,
          underAttackByLesser,
        };
        if (cell.color === turn) hangingForTurn.push(info);
        else hangingForOpponent.push(info);
      }
    }
  }

  // Check mate-in-1 for side to move
  const legalMoves = chess.moves({ verbose: true });
  let mateInOneAvailable = false;
  let forcingChecks = 0;
  for (const mv of legalMoves) {
    if (mv.san.includes('#')) {
      mateInOneAvailable = true;
      break;
    }
    if (mv.san.includes('+')) forcingChecks++;
  }

  // Check opponent immediate mate threat (if they had a free tempo)
  let opponentHasMateThreat = false;
  if (!chess.inCheck()) {
    const flipped = flipFenTurn(chess.fen());
    if (flipped) {
      try {
        const oppChess = new Chess(flipped);
        opponentHasMateThreat = oppChess
          .moves({ verbose: true })
          .some((m) => m.san.includes('#'));
      } catch {
        // Ignore if flipped turn creates invalid en passant or check
      }
    }
  }

  // Build readable descriptions
  const formatHangingList = (items: HangingPieceInfo[]) =>
    items
      .slice(0, 3)
      .map((item) => {
        const name = PIECE_NAMES[item.type];
        if (!item.defended) return `${name} on ${item.square} (undefended)`;
        return `${name} on ${item.square} (attacked by lesser piece)`;
      })
      .join(', ');

  const hangingTextParts: string[] = [];
  if (hangingForTurn.length > 0) {
    hangingTextParts.push(`${sideLabel} pieces at risk: ${formatHangingList(hangingForTurn)}.`);
  }
  if (hangingForOpponent.length > 0) {
    hangingTextParts.push(`${oppLabel} targets: ${formatHangingList(hangingForOpponent)}.`);
  }
  const hangingText =
    hangingTextParts.length > 0
      ? hangingTextParts.join(' ')
      : 'No undefended pieces are hanging right now—both sides have solid mutual protection.';

  const threatParts: string[] = [];
  if (chess.inCheck()) {
    threatParts.push(`${sideLabel}'s King is currently in check and must answer the threat.`);
  }
  if (opponentHasMateThreat) {
    threatParts.push(`${oppLabel} is threatening immediate checkmate on the next turn—defend carefully.`);
  }
  if (hangingForTurn.length > 0) {
    threatParts.push(`Defend or move your ${formatHangingList(hangingForTurn)}.`);
  }
  if (mateInOneAvailable && mode !== 'puzzles') {
    threatParts.push(`You have a checkmate-in-1 motif available right now!`);
  }
  const threatsText =
    threatParts.length > 0
      ? threatParts.join(' ')
      : `No immediate mating threats against ${sideLabel}. Keep watching ${oppLabel}'s active piece lines.`;

  let planText = '';
  if (mode === 'puzzles') {
    // STRICT ANTI-SPOILER MODE for Puzzles
    const motifHints: string[] = [];
    if (puzzleHint?.trim()) {
      motifHints.push(`Coach note: ${puzzleHint.trim()}`);
    }
    if (mateInOneAvailable) {
      motifHints.push('Look closely for a forcing check that leaves the enemy King zero escape squares.');
    } else if (forcingChecks > 0) {
      motifHints.push(
        `There ${forcingChecks === 1 ? 'is 1 forcing check' : `are ${forcingChecks} forcing checks`} in this position—calculate captures and checks before quiet moves.`
      );
    } else if (hangingForOpponent.length > 0) {
      motifHints.push(
        `Examine ${oppLabel}'s vulnerable ${formatHangingList(hangingForOpponent)}—can you exploit an overloaded defender?`
      );
    } else {
      motifHints.push('Scan every check, capture, and pin (CCT) to uncover the winning tactic.');
    }
    planText = motifHints.join(' ');
  } else {
    const best = !chess.isGameOver() ? findBestMove(chess) : null;
    const planBits: string[] = [];
    if (openingName) {
      planBits.push(`Opening: ${openingName}.`);
    }
    if (phase === 'Opening') {
      planBits.push('Prioritize central control, minor-piece development, and early castling.');
    } else if (phase === 'Middlegame') {
      planBits.push('Coordinate rooks onto open files and look for tactical pins or weak squares.');
    } else {
      planBits.push('Activate your King toward the center and push passed pawns.');
    }
    if (best) {
      planBits.push(`Strong candidate move: ${best.move.san} (eval ${evalLabel}).`);
    }
    planText = planBits.join(' ');
  }

  const summaryBits: string[] = [];
  if (openingName) summaryBits.push(openingName);
  else summaryBits.push(`${phase} phase`);
  summaryBits.push(`${sideLabel} to move`);
  if (mode !== 'puzzles') {
    summaryBits.push(`Eval ${evalLabel}`);
  }
  if (hangingForTurn.length > 0) {
    summaryBits.push(`${hangingForTurn.length} vulnerable piece${hangingForTurn.length > 1 ? 's' : ''}`);
  }

  return {
    valid: true,
    turn,
    phase,
    openingName,
    evalLabel,
    inCheck: chess.inCheck(),
    isGameOver: chess.isGameOver(),
    hangingForTurn,
    hangingForOpponent,
    mateInOneAvailable,
    opponentHasMateThreat,
    summaryText: summaryBits.join(' · '),
    threatsText,
    hangingText,
    planText,
  };
}

export function answerCoachQuestion(params: {
  question: string;
  fen: string;
  moves?: string[];
  mode: CoachBoardMode;
  puzzleHint?: string;
}): string {
  const report = analyzeBoardForCoach(params);
  if (!report.valid) return report.summaryText;

  const q = params.question.toLowerCase();
  if (q.includes('threat') || q.includes('danger') || q.includes('attack')) {
    return report.threatsText;
  }
  if (q.includes('hang') || q.includes('undefended') || q.includes('loose') || q.includes('blunder')) {
    return report.hangingText;
  }
  if (q.includes('open') || q.includes('name')) {
    if (report.openingName) {
      return `You are playing the ${report.openingName} (${report.phase}). ${report.planText}`;
    }
    return `We are in the ${report.phase}. ${report.planText}`;
  }
  if (q.includes('hint') || q.includes('help') || q.includes('move') || q.includes('plan') || q.includes('best')) {
    if (params.mode === 'puzzles') {
      return `${report.planText} (Puzzle anti-spoiler guard is active so you can find the move yourself!)`;
    }
    return `${report.planText} ${report.hangingForTurn.length > 0 ? `Also note: ${report.hangingText}` : ''}`.trim();
  }

  // General overview answer combining key coaching insights
  return [
    `${report.summaryText}.`,
    report.threatsText,
    report.hangingText,
    report.planText,
  ].join(' ');
}
