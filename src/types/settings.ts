export type BoardThemeId = 'slate' | 'emerald' | 'wood' | 'gray';
export type PieceStyleId = 'staunton' | 'modern';

export interface ChessSettings {
  boardTheme: BoardThemeId;
  pieceStyle: PieceStyleId;
  showLegalMoves: boolean;
  showCoordinates: boolean;
  soundEnabled: boolean;
  autoQueen: boolean;
}

export const DEFAULT_SETTINGS: ChessSettings = {
  boardTheme: 'emerald',
  pieceStyle: 'staunton',
  showLegalMoves: true,
  showCoordinates: true,
  soundEnabled: true,
  autoQueen: false,
};

export interface BoardThemeConfig {
  id: BoardThemeId;
  name: string;
  lightHex: string;
  darkHex: string;
  lastMoveLight: string;
  lastMoveDark: string;
  selectedBg: string;
  dotLight: string;
  dotDark: string;
  ringLight: string;
  ringDark: string;
}

export const BOARD_THEMES: Record<BoardThemeId, BoardThemeConfig> = {
  slate: {
    id: 'slate',
    name: 'Slate Blue',
    lightHex: '#F1F5F9',
    darkHex: '#334155',
    lastMoveLight: 'rgba(56, 189, 248, 0.30)',
    lastMoveDark: 'rgba(56, 189, 248, 0.25)',
    selectedBg: 'rgba(99, 102, 241, 0.36)',
    dotLight: 'rgba(15, 23, 42, 0.22)',
    dotDark: 'rgba(255, 255, 255, 0.32)',
    ringLight: 'rgba(15, 23, 42, 0.24)',
    ringDark: 'rgba(255, 255, 255, 0.36)',
  },
  emerald: {
    id: 'emerald',
    name: 'Classic Emerald',
    lightHex: '#F1F5F9',
    darkHex: '#2E6F5E',
    lastMoveLight: 'rgba(56, 189, 248, 0.28)',
    lastMoveDark: 'rgba(56, 189, 248, 0.24)',
    selectedBg: 'rgba(99, 102, 241, 0.36)',
    dotLight: 'rgba(15, 23, 42, 0.22)',
    dotDark: 'rgba(255, 255, 255, 0.32)',
    ringLight: 'rgba(15, 23, 42, 0.24)',
    ringDark: 'rgba(255, 255, 255, 0.36)',
  },
  wood: {
    id: 'wood',
    name: 'Warm Wood',
    lightHex: '#EADBC8',
    darkHex: '#9A6B44',
    lastMoveLight: 'rgba(245, 158, 11, 0.34)',
    lastMoveDark: 'rgba(251, 191, 36, 0.28)',
    selectedBg: 'rgba(16, 185, 129, 0.36)',
    dotLight: 'rgba(41, 24, 12, 0.24)',
    dotDark: 'rgba(255, 248, 240, 0.36)',
    ringLight: 'rgba(41, 24, 12, 0.26)',
    ringDark: 'rgba(255, 248, 240, 0.40)',
  },
  gray: {
    id: 'gray',
    name: 'Minimalist Gray',
    lightHex: '#E2E8F0',
    darkHex: '#64748B',
    lastMoveLight: 'rgba(99, 102, 241, 0.28)',
    lastMoveDark: 'rgba(129, 140, 248, 0.30)',
    selectedBg: 'rgba(16, 185, 129, 0.35)',
    dotLight: 'rgba(15, 23, 42, 0.24)',
    dotDark: 'rgba(255, 255, 255, 0.34)',
    ringLight: 'rgba(15, 23, 42, 0.26)',
    ringDark: 'rgba(255, 255, 255, 0.38)',
  },
};

const STORAGE_KEY = 'pure-chess-settings-v1';

export function loadSettings(): ChessSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ChessSettings>;
    return {
      boardTheme:
        parsed.boardTheme && parsed.boardTheme in BOARD_THEMES
          ? parsed.boardTheme
          : DEFAULT_SETTINGS.boardTheme,
      pieceStyle:
        parsed.pieceStyle === 'staunton' || parsed.pieceStyle === 'modern'
          ? parsed.pieceStyle
          : DEFAULT_SETTINGS.pieceStyle,
      showLegalMoves:
        typeof parsed.showLegalMoves === 'boolean'
          ? parsed.showLegalMoves
          : DEFAULT_SETTINGS.showLegalMoves,
      showCoordinates:
        typeof parsed.showCoordinates === 'boolean'
          ? parsed.showCoordinates
          : DEFAULT_SETTINGS.showCoordinates,
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_SETTINGS.soundEnabled,
      autoQueen:
        typeof parsed.autoQueen === 'boolean'
          ? parsed.autoQueen
          : DEFAULT_SETTINGS.autoQueen,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ChessSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / privacy errors
  }
}
