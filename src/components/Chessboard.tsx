import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { ChessPiece } from './ChessPiece';
import {
  BOARD_THEMES,
  type BoardThemeId,
  type PieceStyleId,
} from '../types/settings';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;
const PROMOTION_PIECES: { type: Exclude<PieceSymbol, 'k' | 'p'>; label: string }[] = [
  { type: 'q', label: 'Queen' },
  { type: 'r', label: 'Rook' },
  { type: 'b', label: 'Bishop' },
  { type: 'n', label: 'Knight' },
];

export type AnnotationColor = 'green' | 'red' | 'yellow';

export interface BoardArrow {
  from: Square;
  to: Square;
  color: AnnotationColor;
}

export interface SquareHighlight {
  square: Square;
  color: AnnotationColor;
}

export interface LastMoveHighlight {
  from: Square;
  to: Square;
}

export interface HintHighlight {
  from: Square;
  to?: Square;
}

export type CustomBoardGrid = ({ type: PieceSymbol; color: Color } | null)[][];

interface ChessboardProps {
  fen: string;
  customBoard?: CustomBoardGrid | null;
  flipped?: boolean;
  interactive?: boolean;
  allowedColor?: Color | 'both';
  boardTheme?: BoardThemeId;
  pieceStyle?: PieceStyleId;
  showLegalMoves?: boolean;
  showCoordinates?: boolean;
  autoQueen?: boolean;
  lastMove?: LastMoveHighlight | null;
  hintHighlight?: HintHighlight | null;
  arrows?: BoardArrow[];
  highlights?: SquareHighlight[];
  annotationMode?: boolean;
  annotationColor?: AnnotationColor;
  onToggleArrow?: (from: Square, to: Square, color: AnnotationColor) => void;
  onToggleHighlight?: (square: Square, color: AnnotationColor) => void;
  editorMode?: boolean;
  onEditorSquareClick?: (square: Square) => void;
  onEditorMovePiece?: (from: Square, to: Square) => void;
  onMove: (move: { from: Square; to: Square; promotion?: PieceSymbol }) => boolean;
}

interface PendingPromotion {
  from: Square;
  to: Square;
  color: Color;
}

interface PieceEntry {
  id: string;
  square: Square;
  row: number;
  col: number;
  type: PieceSymbol;
  color: Color;
}

interface PieceTrackerState {
  key: string;
  counter: number;
  pieces: PieceEntry[];
  movedIds: Set<string>;
}

const ARROW_HEX: Record<AnnotationColor, string> = {
  green: '#10B981',
  red: '#EF4444',
  yellow: '#F59E0B',
};

const HIGHLIGHT_RGBA: Record<AnnotationColor, string> = {
  green: 'rgba(16, 185, 129, 0.42)',
  red: 'rgba(239, 68, 68, 0.44)',
  yellow: 'rgba(245, 158, 11, 0.44)',
};

function boardKeyFromGrid(grid: CustomBoardGrid): string {
  return grid
    .map((row) => row.map((c) => (c ? `${c.color}${c.type}` : '.')).join(''))
    .join('/');
}

function extractPiecesFromGrid(grid: CustomBoardGrid): Omit<PieceEntry, 'id'>[] {
  const list: Omit<PieceEntry, 'id'>[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = grid[r][c];
      if (cell) {
        list.push({
          square: `${FILES[c]}${RANKS[r]}` as Square,
          row: r,
          col: c,
          type: cell.type,
          color: cell.color,
        });
      }
    }
  }
  return list;
}

function reconcilePieces(
  prev: PieceTrackerState | null,
  nextKey: string,
  nextRaw: Omit<PieceEntry, 'id'>[]
): PieceTrackerState {
  if (!prev) {
    let counter = 1;
    return {
      key: nextKey,
      counter: counter + nextRaw.length,
      pieces: nextRaw.map((p) => ({ ...p, id: `piece-${counter++}` })),
      movedIds: new Set(),
    };
  }

  const prevBySquare = new Map<Square, PieceEntry>();
  for (const p of prev.pieces) {
    prevBySquare.set(p.square, p);
  }

  const assigned = new Map<Square, PieceEntry>();
  const matchedPrevIds = new Set<string>();
  const unmatchedNext: Omit<PieceEntry, 'id'>[] = [];

  for (const np of nextRaw) {
    const pp = prevBySquare.get(np.square);
    if (pp && pp.type === np.type && pp.color === np.color) {
      assigned.set(np.square, { ...np, id: pp.id });
      matchedPrevIds.add(pp.id);
    } else {
      unmatchedNext.push(np);
    }
  }

  const unmatchedPrev = prev.pieces.filter((pp) => !matchedPrevIds.has(pp.id));

  if (unmatchedNext.length > 4 || unmatchedPrev.length > 4) {
    let counter = prev.counter;
    return {
      key: nextKey,
      counter: counter + nextRaw.length,
      pieces: nextRaw.map((p) => ({ ...p, id: `piece-${counter++}` })),
      movedIds: new Set(),
    };
  }

  const movedIds = new Set<string>();
  const usedPrevIds = new Set<string>();

  const stillUnmatchedNext: Omit<PieceEntry, 'id'>[] = [];
  for (const np of unmatchedNext) {
    const candidate = unmatchedPrev.find(
      (pp) => !usedPrevIds.has(pp.id) && pp.color === np.color && pp.type === np.type
    );
    if (candidate) {
      usedPrevIds.add(candidate.id);
      movedIds.add(candidate.id);
      assigned.set(np.square, { ...np, id: candidate.id });
    } else {
      stillUnmatchedNext.push(np);
    }
  }

  const finalUnmatchedNext: Omit<PieceEntry, 'id'>[] = [];
  for (const np of stillUnmatchedNext) {
    const candidate = unmatchedPrev.find(
      (pp) => !usedPrevIds.has(pp.id) && pp.color === np.color
    );
    if (candidate) {
      usedPrevIds.add(candidate.id);
      movedIds.add(candidate.id);
      assigned.set(np.square, { ...np, id: candidate.id });
    } else {
      finalUnmatchedNext.push(np);
    }
  }

  let counter = prev.counter;
  for (const np of finalUnmatchedNext) {
    assigned.set(np.square, { ...np, id: `piece-${counter++}` });
  }

  return {
    key: nextKey,
    counter,
    pieces: nextRaw.map((np) => assigned.get(np.square)!),
    movedIds,
  };
}

function squareToVisualCoords(square: Square, flipped: boolean): { col: number; row: number } {
  const fileIdx = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rankIdx = RANKS.indexOf(square[1] as (typeof RANKS)[number]);
  return {
    col: flipped ? 7 - fileIdx : fileIdx,
    row: flipped ? 7 - rankIdx : rankIdx,
  };
}

export const Chessboard: React.FC<ChessboardProps> = ({
  fen,
  customBoard = null,
  flipped = false,
  interactive = true,
  allowedColor = 'both',
  boardTheme = 'emerald',
  pieceStyle = 'staunton',
  showLegalMoves = true,
  showCoordinates = true,
  autoQueen = false,
  lastMove = null,
  hintHighlight = null,
  arrows = [],
  highlights = [],
  annotationMode = false,
  annotationColor = 'green',
  onToggleArrow,
  onToggleHighlight,
  editorMode = false,
  onEditorSquareClick,
  onEditorMovePiece,
  onMove,
}) => {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [annotateOrigin, setAnnotateOrigin] = useState<Square | null>(null);
  const [dragFrom, setDragFrom] = useState<{
    square: Square;
    color: AnnotationColor;
    isAnnotation: boolean;
  } | null>(null);

  const gridRef = useRef<HTMLDivElement | null>(null);

  const chess = useMemo(() => (customBoard ? null : new Chess(fen)), [customBoard, fen]);
  const board = useMemo<CustomBoardGrid>(
    () => (customBoard ? customBoard : chess!.board()),
    [customBoard, chess]
  );

  const trackerKey = useMemo(
    () => (customBoard ? `custom:${boardKeyFromGrid(customBoard)}` : fen),
    [customBoard, fen]
  );
  const rawPieces = useMemo(() => extractPiecesFromGrid(board), [board]);
  const [tracker, setTracker] = useState<PieceTrackerState>(() =>
    reconcilePieces(null, trackerKey, rawPieces)
  );

  if (tracker.key !== trackerKey) {
    setTracker(reconcilePieces(tracker, trackerKey, rawPieces));
  }

  useEffect(() => {
    setSelectedSquare(null);
    setPendingPromotion(null);
    setAnnotateOrigin(null);
  }, [trackerKey]);

  const theme = BOARD_THEMES[boardTheme];
  const currentTurn = chess ? chess.turn() : 'w';
  const inCheck = chess ? chess.inCheck() : false;

  const kingInCheckSquare = useMemo<Square | null>(() => {
    if (!inCheck) return null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === currentTurn) {
          return `${FILES[c]}${RANKS[r]}` as Square;
        }
      }
    }
    return null;
  }, [board, currentTurn, inCheck]);

  const legalMovesForSelected = useMemo<Move[]>(() => {
    if (!selectedSquare || !interactive || !chess || editorMode || annotationMode) return [];
    return chess.moves({ square: selectedSquare, verbose: true });
  }, [chess, selectedSquare, interactive, editorMode, annotationMode]);

  const legalTargetMap = useMemo(() => {
    const map = new Map<Square, Move[]>();
    for (const m of legalMovesForSelected) {
      const existing = map.get(m.to);
      if (existing) existing.push(m);
      else map.set(m.to, [m]);
    }
    return map;
  }, [legalMovesForSelected]);

  const highlightMap = useMemo(() => {
    const map = new Map<Square, AnnotationColor>();
    for (const h of highlights) {
      map.set(h.square, h.color);
    }
    return map;
  }, [highlights]);

  const canSelectColor = (color: Color) => {
    if (!interactive) return false;
    if (color !== currentTurn) return false;
    if (allowedColor === 'both') return true;
    return color === allowedColor;
  };

  const getSquareFromPointer = (clientX: number, clientY: number): Square | null => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null;
    }
    const visualCol = Math.min(7, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * 8)));
    const visualRow = Math.min(7, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * 8)));
    const actualCol = flipped ? 7 - visualCol : visualCol;
    const actualRow = flipped ? 7 - visualRow : visualRow;
    return `${FILES[actualCol]}${RANKS[actualRow]}` as Square;
  };

  const handlePointerDown = (e: React.PointerEvent, square: Square) => {
    if (e.button === 2) {
      e.preventDefault();
      const color: AnnotationColor = e.shiftKey
        ? 'red'
        : e.altKey
        ? 'yellow'
        : annotationColor;
      setDragFrom({ square, color, isAnnotation: true });
      return;
    }

    if (e.button === 0 && annotationMode) {
      setDragFrom({ square, color: annotationColor, isAnnotation: true });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragFrom) return;
    const targetSquare = getSquareFromPointer(e.clientX, e.clientY);

    if (dragFrom.isAnnotation && targetSquare) {
      if (e.button === 2) {
        if (dragFrom.square === targetSquare) {
          onToggleHighlight?.(targetSquare, dragFrom.color);
        } else {
          onToggleArrow?.(dragFrom.square, targetSquare, dragFrom.color);
        }
        setDragFrom(null);
        return;
      }

      if (annotationMode && dragFrom.square !== targetSquare) {
        setAnnotateOrigin(null);
        onToggleArrow?.(dragFrom.square, targetSquare, dragFrom.color);
        setDragFrom(null);
        return;
      }
    }

    setDragFrom(null);
  };

  const handleSquareClick = (square: Square) => {
    if (pendingPromotion) return;

    if (annotationMode) {
      if (!annotateOrigin) {
        setAnnotateOrigin(square);
      } else if (annotateOrigin === square) {
        setAnnotateOrigin(null);
        onToggleHighlight?.(square, annotationColor);
      } else {
        onToggleArrow?.(annotateOrigin, square, annotationColor);
        setAnnotateOrigin(null);
      }
      return;
    }

    if (editorMode) {
      onEditorSquareClick?.(square);
      return;
    }

    if (!interactive || !chess) return;

    const targetMoves = legalTargetMap.get(square);
    if (selectedSquare && targetMoves && targetMoves.length > 0) {
      const isPromotion = targetMoves.some((m) => Boolean(m.promotion));
      if (isPromotion) {
        if (autoQueen) {
          const moved = onMove({ from: selectedSquare, to: square, promotion: 'q' });
          if (moved) setSelectedSquare(null);
          return;
        }
        setPendingPromotion({
          from: selectedSquare,
          to: square,
          color: currentTurn,
        });
        return;
      }

      const moved = onMove({ from: selectedSquare, to: square });
      if (moved) {
        setSelectedSquare(null);
      }
      return;
    }

    const fileIdx = FILES.indexOf(square[0] as (typeof FILES)[number]);
    const rankIdx = RANKS.indexOf(square[1] as (typeof RANKS)[number]);
    const piece = board[rankIdx]?.[fileIdx];

    if (piece && canSelectColor(piece.color)) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
      } else {
        setSelectedSquare(square);
      }
    } else {
      setSelectedSquare(null);
    }
  };

  const handlePromotionChoice = (pieceType: Exclude<PieceSymbol, 'k' | 'p'>) => {
    if (!pendingPromotion) return;
    onMove({
      from: pendingPromotion.from,
      to: pendingPromotion.to,
      promotion: pieceType,
    });
    setPendingPromotion(null);
    setSelectedSquare(null);
  };

  const displayRows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const displayCols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      onPointerUp={handlePointerUp}
      className="relative w-full aspect-square select-none touch-none rounded-xl overflow-hidden border border-white/10 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.75)] bg-slate-900"
    >
      {/* Layer 1: Interactive 8x8 Square Grid */}
      <div
        ref={gridRef}
        className="grid grid-cols-8 grid-rows-8 w-full h-full touch-none"
        role="grid"
        aria-label="Chessboard"
      >
        {displayRows.map((r, visualRowIdx) =>
          displayCols.map((c, visualColIdx) => {
            const square = `${FILES[c]}${RANKS[r]}` as Square;
            const isLight = (r + c) % 2 === 0;
            const piece = board[r][c];
            const isSelected = selectedSquare === square;
            const isAnnotateOrigin = annotateOrigin === square;
            const isLastMove =
              !editorMode && (lastMove?.from === square || lastMove?.to === square);
            const isKingInCheck = !editorMode && kingInCheckSquare === square;
            const isHintFrom = hintHighlight?.from === square;
            const isHintTo = hintHighlight?.to === square;
            const squareHighlightColor = highlightMap.get(square);

            const legalMovesHere = legalTargetMap.get(square);
            const isLegalTarget = Boolean(legalMovesHere && legalMovesHere.length > 0);
            const isCaptureTarget =
              isLegalTarget &&
              (Boolean(piece) || Boolean(legalMovesHere?.some((m) => m.isEnPassant())));

            const showRankLabel = showCoordinates && visualColIdx === 0;
            const showFileLabel = showCoordinates && visualRowIdx === 7;

            return (
              <button
                key={square}
                type="button"
                onPointerDown={(e) => handlePointerDown(e, square)}
                onClick={() => handleSquareClick(square)}
                onDragOver={
                  editorMode
                    ? (e) => {
                        e.preventDefault();
                      }
                    : undefined
                }
                onDrop={
                  editorMode
                    ? (e) => {
                        e.preventDefault();
                        const fromSq = e.dataTransfer.getData('text/plain') as Square;
                        if (fromSq && fromSq !== square) {
                          onEditorMovePiece?.(fromSq, square);
                        }
                      }
                    : undefined
                }
                style={{ backgroundColor: isLight ? theme.lightHex : theme.darkHex }}
                aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
                className={`relative flex items-center justify-center w-full h-full p-0 border-0 touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 transition-colors duration-150 ${
                  interactive || editorMode || annotationMode ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                {/* Clean last-move tint */}
                {isLastMove && !isSelected && (
                  <span
                    className="absolute inset-0 pointer-events-none transition-opacity duration-200"
                    style={{
                      backgroundColor: isLight ? theme.lastMoveLight : theme.lastMoveDark,
                    }}
                  />
                )}

                {/* User / Coach Square Highlight */}
                {squareHighlightColor && (
                  <span
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundColor: HIGHLIGHT_RGBA[squareHighlightColor] }}
                  />
                )}

                {/* Selected square tint */}
                {(isSelected || isAnnotateOrigin) && (
                  <span
                    className="absolute inset-0 ring-2 ring-inset ring-white/70 pointer-events-none"
                    style={{ backgroundColor: theme.selectedBg }}
                  />
                )}

                {/* Puzzle / Lesson hint highlight */}
                {(isHintFrom || isHintTo) && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.45, 0.9, 0.45] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inset-0 ring-3 ring-inset ring-emerald-400 bg-emerald-400/20 pointer-events-none"
                  />
                )}

                {/* Smooth pulsing highlight when King is in check */}
                {isKingInCheck && (
                  <motion.span
                    initial={{ opacity: 0.5, scale: 0.92 }}
                    animate={{ opacity: [0.7, 1, 0.7], scale: [0.94, 1.05, 0.94] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(239,68,68,0.88) 0%, rgba(220,38,38,0.45) 56%, transparent 78%)',
                    }}
                  />
                )}

                {/* Rank coordinate (left edge) */}
                {showRankLabel && (
                  <span
                    className="absolute top-0.5 left-1 text-[9px] sm:text-[11px] font-semibold leading-none font-mono-tabular pointer-events-none"
                    style={{ color: isLight ? theme.darkHex : theme.lightHex }}
                  >
                    {RANKS[r]}
                  </span>
                )}

                {/* File coordinate (bottom edge) */}
                {showFileLabel && (
                  <span
                    className="absolute bottom-0.5 right-1 text-[9px] sm:text-[11px] font-semibold leading-none font-mono-tabular pointer-events-none"
                    style={{ color: isLight ? theme.darkHex : theme.lightHex }}
                  >
                    {FILES[c]}
                  </span>
                )}

                {/* Soft legal-move dot (empty square) */}
                {showLegalMoves && isLegalTarget && !isCaptureTarget && (
                  <motion.span
                    initial={{ scale: 0.35, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                    className="relative z-30 w-[26%] h-[26%] rounded-full pointer-events-none"
                    style={{
                      backgroundColor: isLight ? theme.dotLight : theme.dotDark,
                    }}
                  />
                )}

                {/* Legal capture ring */}
                {showLegalMoves && isCaptureTarget && (
                  <motion.span
                    initial={{ scale: 0.78, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-[6.5%] z-30 rounded-full border-[3px] sm:border-[4px] pointer-events-none"
                    style={{
                      borderColor: isLight ? theme.ringLight : theme.ringDark,
                    }}
                  />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Layer 2: Smoothly Gliding Pieces Overlay */}
      <div className="absolute inset-0 pointer-events-none z-20" aria-hidden="true">
        <AnimatePresence initial={false}>
          {tracker.pieces.map((p) => {
            const visualCol = flipped ? 7 - p.col : p.col;
            const visualRow = flipped ? 7 - p.row : p.row;
            const isMoving = tracker.movedIds.has(p.id);
            const isSelectedPiece = selectedSquare === p.square;

            return (
              <motion.div
                key={p.id}
                initial={{
                  x: `${visualCol * 100}%`,
                  y: `${visualRow * 100}%`,
                  scale: 0.88,
                  opacity: 0,
                }}
                animate={{
                  x: `${visualCol * 100}%`,
                  y: `${visualRow * 100}%`,
                  scale: isSelectedPiece ? 1.07 : 1,
                  opacity: 1,
                }}
                exit={{
                  scale: 0.65,
                  opacity: 0,
                  transition: { duration: 0.14, ease: 'easeOut' },
                }}
                transition={{
                  type: 'spring',
                  stiffness: 460,
                  damping: 36,
                  mass: 0.78,
                }}
                style={{ zIndex: isMoving || isSelectedPiece ? 25 : 20 }}
                className="absolute top-0 left-0 w-[12.5%] h-[12.5%] flex items-center justify-center"
              >
                <div className="w-[84%] h-[84%] flex items-center justify-center">
                  <ChessPiece type={p.type} color={p.color} pieceStyle={pieceStyle} />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Layer 3: Teaching & Best-Move SVG Arrows Overlay */}
      {arrows.length > 0 && (
        <svg
          viewBox="0 0 800 800"
          className="absolute inset-0 w-full h-full pointer-events-none z-30"
          aria-hidden="true"
        >
          {arrows.map((arrow) => {
            const start = squareToVisualCoords(arrow.from, flipped);
            const end = squareToVisualCoords(arrow.to, flipped);
            const x1 = (start.col + 0.5) * 100;
            const y1 = (start.row + 0.5) * 100;
            const x2 = (end.col + 0.5) * 100;
            const y2 = (end.row + 0.5) * 100;

            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            if (len < 1) return null;

            const ux = dx / len;
            const uy = dy / len;
            const px = -uy;
            const py = ux;

            const headLen = 30;
            const headHalfWidth = 17;
            const shaftHalfWidth = 7;

            const sx = x1 + ux * 16;
            const sy = y1 + uy * 16;
            const tipX = x2 - ux * 10;
            const tipY = y2 - uy * 10;
            const baseX = tipX - ux * headLen;
            const baseY = tipY - uy * headLen;

            const points = [
              `${sx + px * shaftHalfWidth},${sy + py * shaftHalfWidth}`,
              `${baseX + px * shaftHalfWidth},${baseY + py * shaftHalfWidth}`,
              `${baseX + px * headHalfWidth},${baseY + py * headHalfWidth}`,
              `${tipX},${tipY}`,
              `${baseX - px * headHalfWidth},${baseY - py * headHalfWidth}`,
              `${baseX - px * shaftHalfWidth},${baseY - py * shaftHalfWidth}`,
              `${sx - px * shaftHalfWidth},${sy - py * shaftHalfWidth}`,
            ].join(' ');

            return (
              <polygon
                key={`${arrow.from}-${arrow.to}-${arrow.color}`}
                points={points}
                fill={ARROW_HEX[arrow.color]}
                fillOpacity={0.85}
              />
            );
          })}
        </svg>
      )}

      {/* Pawn Promotion Modal Overlay */}
      <AnimatePresence>
        {pendingPromotion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Choose promotion piece"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 4 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-slate-900/90 backdrop-blur-md border border-white/15 rounded-2xl p-4 shadow-2xl w-full max-w-[290px]"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-100">
                  Promote pawn
                </span>
                <button
                  type="button"
                  onClick={() => setPendingPromotion(null)}
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Cancel promotion"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {PROMOTION_PIECES.map((item) => (
                  <motion.button
                    key={item.type}
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handlePromotionChoice(item.type)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-slate-800/80 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-400/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
                  >
                    <div className="w-10 h-10">
                      <ChessPiece
                        type={item.type}
                        color={pendingPromotion.color}
                        pieceStyle={pieceStyle}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-slate-200">
                      {item.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
