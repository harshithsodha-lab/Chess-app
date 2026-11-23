export interface ChessPuzzle {
  id: string;
  title: string;
  theme: string;
  rating: number;
  fen: string;
  /** UCI moves alternating player -> opponent -> player */
  solution: string[];
  hint: string;
}

export const CHESS_PUZZLES: ChessPuzzle[] = [
  {
    id: 'corridor-mate',
    title: 'Corridor Weakness',
    theme: 'Back Rank Mate',
    rating: 920,
    fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    solution: ['d1d8'],
    hint: 'Black’s king is trapped behind its own pawns on the seventh rank.',
  },
  {
    id: 'lethal-battery',
    title: 'F7 Weak Point',
    theme: 'Mate in 1',
    rating: 980,
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    solution: ['h5f7'],
    hint: 'Your bishop and queen both eye the f7 pawn.',
  },
  {
    id: 'arabian-mate',
    title: 'Arabian Finish',
    theme: 'Rook & Knight Mate',
    rating: 1120,
    fen: '7k/6R1/5N2/8/8/8/8/6K1 w - - 0 1',
    solution: ['g7h7'],
    hint: 'Your knight defends h7 and covers the g8 escape square.',
  },
  {
    id: 'smothered-mate',
    title: 'Philidor’s Legacy',
    theme: 'Smothered Mate',
    rating: 1340,
    fen: 'r4r1k/6pp/7N/8/8/1Q6/8/7K w - - 0 1',
    solution: ['b3g8', 'f8g8', 'h6f7'],
    hint: 'Sacrifice the queen on g8 to box the black king in completely.',
  },
  {
    id: 'anastasia-mate',
    title: 'Anastasia’s Mate',
    theme: 'Checkmate Pattern',
    rating: 1380,
    fen: '7k/4N1pp/8/7Q/8/4R3/8/6K1 w - - 0 1',
    solution: ['h5h7', 'h8h7', 'e3h3'],
    hint: 'Pull the king onto the h-file with a queen sacrifice, then swing the rook.',
  },
  {
    id: 'knight-fork-black',
    title: 'Royal Fork',
    theme: 'Knight Fork',
    rating: 1090,
    fen: 'r3k3/pp3ppp/8/4n3/1Q6/8/PP3PPP/R3K2R b KQ - 0 1',
    solution: ['e5d3', 'e1e2', 'd3b4'],
    hint: 'Find the checking square for your knight that also attacks the white queen.',
  },
  {
    id: 'absolute-pin',
    title: 'Diagonal Pin',
    theme: 'Pin & Win',
    rating: 1160,
    fen: '5k2/5pp1/3q4/8/8/P7/3B4/4K3 w - - 0 1',
    solution: ['d2b4', 'd6b4', 'a3b4'],
    hint: 'Pin the black queen to the king along the a3–f8 diagonal.',
  },
  {
    id: 'deflection-mate',
    title: 'Overloaded Rook',
    theme: 'Deflection',
    rating: 1260,
    fen: '3r2k1/5ppp/8/8/8/8/4QPPP/4R1K1 w - - 0 1',
    solution: ['e2e8', 'd8e8', 'e1e8'],
    hint: 'Black’s rook is the sole defender of the back rank.',
  },
];
