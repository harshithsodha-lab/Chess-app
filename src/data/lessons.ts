export interface LessonStep {
  uci: string;
  san: string;
  explanation: string;
  hint: string;
}

export interface ChessLesson {
  id: string;
  title: string;
  category: 'Opening' | 'Checkmate Pattern';
  level: 'Beginner' | 'Intermediate';
  playerColor: 'w' | 'b';
  initialFen: string;
  summary: string;
  steps: LessonStep[];
}

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const CHESS_LESSONS: ChessLesson[] = [
  {
    id: 'italian-game',
    title: 'Italian Game',
    category: 'Opening',
    level: 'Beginner',
    playerColor: 'w',
    initialFen: STANDARD_FEN,
    summary: 'Rapid piece development targeting Black’s vulnerable f7 pawn and controlling the center.',
    steps: [
      {
        uci: 'e2e4',
        san: 'e4',
        explanation: 'Claim the center immediately and open lines for your queen and light-squared bishop.',
        hint: 'Start with the king’s pawn two squares forward.',
      },
      {
        uci: 'e7e5',
        san: 'e5',
        explanation: 'Black mirrors your central claim and stakes out space on e5.',
        hint: '',
      },
      {
        uci: 'g1f3',
        san: 'Nf3',
        explanation: 'Develop your kingside knight toward the center while attacking the e5 pawn.',
        hint: 'Develop your kingside knight to attack e5.',
      },
      {
        uci: 'b8c6',
        san: 'Nc6',
        explanation: 'Black develops a knight to defend the e5 pawn naturally.',
        hint: '',
      },
      {
        uci: 'f1c4',
        san: 'Bc4',
        explanation: 'The signature Italian move! Your bishop eyes the weak f7 square and clears castling.',
        hint: 'Place your light-squared bishop on an active diagonal aiming at f7.',
      },
      {
        uci: 'f8c5',
        san: 'Bc5',
        explanation: 'Black counters with the Giuoco Piano, pointing their bishop at f2.',
        hint: '',
      },
      {
        uci: 'c2c3',
        san: 'c3',
        explanation: 'Prepare a strong d4 central pawn break to build an ideal pawn center.',
        hint: 'Support a future d4 push with a queenside pawn move.',
      },
    ],
  },
  {
    id: 'sicilian-defense',
    title: 'Sicilian Defense',
    category: 'Opening',
    level: 'Intermediate',
    playerColor: 'b',
    initialFen: STANDARD_FEN,
    summary: 'Fight for an asymmetrical position as Black by contesting the d4 square from the flank.',
    steps: [
      {
        uci: 'e2e4',
        san: 'e4',
        explanation: 'White opens with the king’s pawn to claim central space.',
        hint: '',
      },
      {
        uci: 'c7c5',
        san: 'c5',
        explanation: 'The Sicilian Defense! Black stops White from easily building a d4–e4 center and fights for d4.',
        hint: 'Challenge the d4 square asymmetrically with your c-pawn.',
      },
      {
        uci: 'g1f3',
        san: 'Nf3',
        explanation: 'White develops a knight and prepares to open the center with d4.',
        hint: '',
      },
      {
        uci: 'd7d6',
        san: 'd6',
        explanation: 'Control the e5 square and open a path for your light-squared bishop.',
        hint: 'Advance the d-pawn one square to guard e5.',
      },
      {
        uci: 'd2d4',
        san: 'd4',
        explanation: 'White strikes in the center, initiating the Open Sicilian.',
        hint: '',
      },
      {
        uci: 'c5d4',
        san: 'cxd4',
        explanation: 'Trade your flank c-pawn for White’s central d-pawn, opening the half-open c-file for your rook.',
        hint: 'Capture the d4 pawn to gain a 2-to-1 central pawn majority.',
      },
      {
        uci: 'f3d4',
        san: 'Nxd4',
        explanation: 'White recaptures with the knight, entering the rich Open Sicilian middlegame.',
        hint: '',
      },
      {
        uci: 'g8f6',
        san: 'Nf6',
        explanation: 'Develop with tempo by attacking White’s undefended e4 pawn.',
        hint: 'Develop your kingside knight and attack e4.',
      },
    ],
  },
  {
    id: 'queens-gambit',
    title: 'Queen’s Gambit',
    category: 'Opening',
    level: 'Beginner',
    playerColor: 'w',
    initialFen: STANDARD_FEN,
    summary: 'Challenge Black’s d5 stronghold with the c-pawn to secure lasting central influence.',
    steps: [
      {
        uci: 'd2d4',
        san: 'd4',
        explanation: 'Occupy the center with your d-pawn, well-protected by your queen.',
        hint: 'Open by advancing your queen’s pawn two squares.',
      },
      {
        uci: 'd7d5',
        san: 'd5',
        explanation: 'Black matches your central presence on d5.',
        hint: '',
      },
      {
        uci: 'c2c4',
        san: 'c4',
        explanation: 'The Queen’s Gambit! Offer the c-pawn to lure Black’s d5 pawn away from the center.',
        hint: 'Attack Black’s d5 pawn from the flank with your c-pawn.',
      },
      {
        uci: 'e7e6',
        san: 'e6',
        explanation: 'Black declines the gambit solidly, reinforcing d5 with the Queen’s Gambit Declined.',
        hint: '',
      },
      {
        uci: 'b1c3',
        san: 'Nc3',
        explanation: 'Increase pressure on d5 and control the critical e4 square.',
        hint: 'Develop your queenside knight toward the center.',
      },
      {
        uci: 'g8f6',
        san: 'Nf6',
        explanation: 'Black develops their knight to defend d5 and control e4.',
        hint: '',
      },
      {
        uci: 'c1g5',
        san: 'Bg5',
        explanation: 'Pin the f6 knight to the queen, undermining Black’s defense of d5.',
        hint: 'Pin Black’s kingside knight with your dark-squared bishop.',
      },
    ],
  },
  {
    id: 'london-system',
    title: 'London System',
    category: 'Opening',
    level: 'Beginner',
    playerColor: 'w',
    initialFen: STANDARD_FEN,
    summary: 'Build a rock-solid dark-square pyramid structure that works reliably against almost any setup.',
    steps: [
      {
        uci: 'd2d4',
        san: 'd4',
        explanation: 'Start by claiming the d4 square with your queen’s pawn.',
        hint: 'Push your d-pawn two squares.',
      },
      {
        uci: 'd7d5',
        san: 'd5',
        explanation: 'Black responds symmetrically in the center.',
        hint: '',
      },
      {
        uci: 'c1f4',
        san: 'Bf4',
        explanation: 'Bring the dark-squared bishop outside the pawn chain BEFORE playing e3.',
        hint: 'Develop your dark-squared bishop to f4 before locking it in with e3.',
      },
      {
        uci: 'g8f6',
        san: 'Nf6',
        explanation: 'Black develops the kingside knight and guards e4.',
        hint: '',
      },
      {
        uci: 'e2e3',
        san: 'e3',
        explanation: 'Support d4 and open the diagonal for your light-squared bishop.',
        hint: 'Reinforce d4 with a quiet pawn move on the e-file.',
      },
      {
        uci: 'c7c5',
        san: 'c5',
        explanation: 'Black challenges your d4 pawn from the c-file.',
        hint: '',
      },
      {
        uci: 'c2c3',
        san: 'c3',
        explanation: 'Complete the classic London triangle (c3–d4–e3), keeping d4 rock-solid.',
        hint: 'Support d4 with your c-pawn to form the London pyramid.',
      },
    ],
  },
  {
    id: 'ruy-lopez',
    title: 'Ruy Lopez (Spanish)',
    category: 'Opening',
    level: 'Intermediate',
    playerColor: 'w',
    initialFen: STANDARD_FEN,
    summary: 'Create long-term pressure against Black’s e5 pawn by targeting its defender on c6.',
    steps: [
      {
        uci: 'e2e4',
        san: 'e4',
        explanation: 'Open with the king’s pawn to take central space.',
        hint: 'Advance the e-pawn two squares.',
      },
      {
        uci: 'e7e5',
        san: 'e5',
        explanation: 'Black meets e4 symmetrically.',
        hint: '',
      },
      {
        uci: 'g1f3',
        san: 'Nf3',
        explanation: 'Attack e5 immediately while developing your knight.',
        hint: 'Develop your kingside knight to f3.',
      },
      {
        uci: 'b8c6',
        san: 'Nc6',
        explanation: 'Black defends e5 with the knight.',
        hint: '',
      },
      {
        uci: 'f1b5',
        san: 'Bb5',
        explanation: 'The Ruy Lopez! Pressure the c6 knight that defends e5 and prepare quick castling.',
        hint: 'Pin or pressure the c6 knight with your light-squared bishop.',
      },
      {
        uci: 'a7a6',
        san: 'a6',
        explanation: 'Black plays the Morphy Defense, questioning your bishop’s intentions.',
        hint: '',
      },
      {
        uci: 'b5a4',
        san: 'Ba4',
        explanation: 'Keep tension along the a4–e8 diagonal without trading away your active bishop.',
        hint: 'Retreat the bishop one square while keeping pressure on c6.',
      },
    ],
  },
  {
    id: 'back-rank-mate-lesson',
    title: 'Back Rank Mate',
    category: 'Checkmate Pattern',
    level: 'Beginner',
    playerColor: 'w',
    initialFen: '3r2k1/5ppp/8/8/8/8/4QPPP/4R1K1 w - - 0 1',
    summary: 'Exploit an unguarded back rank when the enemy king is boxed in by its own castled pawns.',
    steps: [
      {
        uci: 'e2e8',
        san: 'Qe8+',
        explanation: 'Deflection sacrifice! Black’s rook on d8 is overloaded—it must capture on e8, abandoning the back rank.',
        hint: 'Force Black’s rook off d8 by checking on the back rank with your queen.',
      },
      {
        uci: 'd8e8',
        san: 'Rxe8',
        explanation: 'Black is forced to capture the queen, removing the rook from defense.',
        hint: '',
      },
      {
        uci: 'e1e8',
        san: 'Rxe8#',
        explanation: 'Checkmate! The f7, g7, and h7 pawns seal the Black king inside the back-rank corridor.',
        hint: 'Recapture on e8 with your rook to deliver checkmate.',
      },
    ],
  },
  {
    id: 'scholars-mate-lesson',
    title: 'Scholar’s Mate Pattern',
    category: 'Checkmate Pattern',
    level: 'Beginner',
    playerColor: 'w',
    initialFen: STANDARD_FEN,
    summary: 'See how concentrating two attackers on the f7 square—defended only by the king—creates an immediate mate threat.',
    steps: [
      {
        uci: 'e2e4',
        san: 'e4',
        explanation: 'Open lines for both your queen and light-squared bishop.',
        hint: 'Start with 1. e4.',
      },
      {
        uci: 'e7e5',
        san: 'e5',
        explanation: 'Black answers in the center.',
        hint: '',
      },
      {
        uci: 'f1c4',
        san: 'Bc4',
        explanation: 'Aim your bishop directly at Black’s weakest starting pawn: f7.',
        hint: 'Place your bishop on c4 targeting f7.',
      },
      {
        uci: 'b8c6',
        san: 'Nc6',
        explanation: 'Black develops the queenside knight, leaving f7 guarded only by the king.',
        hint: '',
      },
      {
        uci: 'd1h5',
        san: 'Qh5',
        explanation: 'Add a second attacker to f7 while also eyeing e5. (Note: strong players defend this easily with g6 or Nf6!)',
        hint: 'Swing your queen to h5 to double up on f7.',
      },
      {
        uci: 'g8f6',
        san: 'Nf6??',
        explanation: 'A common mistake! Trying to chase the queen ignores the battery aimed at f7.',
        hint: '',
      },
      {
        uci: 'h5f7',
        san: 'Qxf7#',
        explanation: 'Checkmate! The queen captures f7 protected by the c4 bishop, leaving the king with nowhere to run.',
        hint: 'Deliver checkmate by capturing the f7 pawn with your queen.',
      },
    ],
  },
  {
    id: 'legals-mate-lesson',
    title: 'Légal’s Mate Trap',
    category: 'Checkmate Pattern',
    level: 'Intermediate',
    playerColor: 'w',
    initialFen: 'r2qkbnr/ppp2ppp/2np4/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 2 5',
    summary: 'Spot a classic tactical queen sacrifice when an opponent carelessly pins your knight with a bishop.',
    steps: [
      {
        uci: 'f3e5',
        san: 'Nxe5!',
        explanation: 'Bold sacrifice! Leave your queen undefended—if Black takes it, White has a forced mate in two.',
        hint: 'Capture the e5 pawn with your pinned f3 knight.',
      },
      {
        uci: 'g4d1',
        san: 'Bxd1??',
        explanation: 'Black falls into the trap and takes the queen instead of recapturing the knight.',
        hint: '',
      },
      {
        uci: 'c4f7',
        san: 'Bxf7+',
        explanation: 'Stripping away the king’s shelter! The bishop check forces the king onto e7.',
        hint: 'Deliver check on f7 with your bishop.',
      },
      {
        uci: 'e8e7',
        san: 'Ke7',
        explanation: 'Black’s king is forced to its only legal square, e7.',
        hint: '',
      },
      {
        uci: 'c3d5',
        san: 'Nd5#',
        explanation: 'Checkmate! Your three minor pieces coordinate perfectly around the exposed king.',
        hint: 'Jump your c3 knight to d5 for checkmate.',
      },
    ],
  },
];
