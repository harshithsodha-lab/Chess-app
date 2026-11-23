import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, RotateCcw, LogOut, ShieldCheck } from 'lucide-react';
import {
  BOARD_THEMES,
  DEFAULT_SETTINGS,
  type BoardThemeId,
  type ChessSettings,
  type PieceStyleId,
} from '../types/settings';
import type { UserRole } from '../types/academy';
import { ChessPiece } from './ChessPiece';

interface SettingsModalProps {
  open: boolean;
  settings: ChessSettings;
  userRole: UserRole;
  adminModeActive: boolean;
  onToggleAdminMode: (active: boolean) => void;
  onLogout: () => void;
  onUpdate: (partial: Partial<ChessSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

const THEME_LIST: BoardThemeId[] = ['slate', 'emerald', 'wood', 'gray'];
const PIECE_STYLES: { id: PieceStyleId; label: string; description: string }[] = [
  { id: 'staunton', label: 'Classic Staunton', description: 'Traditional carved silhouettes' },
  { id: 'modern', label: 'Modern Flat', description: 'Crisp geometric forms' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  userRole,
  adminModeActive,
  onToggleAdminMode,
  onLogout,
  onUpdate,
  onReset,
  onClose,
}) => {
  const toggles: {
    key: keyof Pick<
      ChessSettings,
      'showLegalMoves' | 'showCoordinates' | 'soundEnabled' | 'autoQueen'
    >;
    label: string;
    description: string;
  }[] = [
    {
      key: 'showLegalMoves',
      label: 'Show Legal Move Dots',
      description: 'Highlight valid destination squares and captures',
    },
    {
      key: 'showCoordinates',
      label: 'Show Board Coordinates',
      description: 'Display a–h and 1–8 notation along board edges',
    },
    {
      key: 'soundEnabled',
      label: 'Sound Effects',
      description: 'Play tactile audio cues for moves, captures, and checks',
    },
    {
      key: 'autoQueen',
      label: 'Auto-Queen Promotion',
      description: 'Automatically promote pawns to Queen without asking',
    },
  ];

  const isDefault =
    settings.boardTheme === DEFAULT_SETTINGS.boardTheme &&
    settings.pieceStyle === DEFAULT_SETTINGS.pieceStyle &&
    settings.showLegalMoves === DEFAULT_SETTINGS.showLegalMoves &&
    settings.showCoordinates === DEFAULT_SETTINGS.showCoordinates &&
    settings.soundEnabled === DEFAULT_SETTINGS.soundEnabled &&
    settings.autoQueen === DEFAULT_SETTINGS.autoQueen;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-950/70 backdrop-blur-sm md:p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Customization Settings"
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 32, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full md:max-w-[460px] max-h-[88dvh] flex flex-col bg-slate-900/95 backdrop-blur-xl border border-white/15 rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Mobile grab bar */}
            <div className="md:hidden pt-2.5 pb-1 flex justify-center">
              <span className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h2 className="text-base font-semibold text-slate-50 tracking-tight">
                  Board &amp; Gameplay Settings
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Saved automatically to your browser
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto chess-scroll px-5 py-5 space-y-6">
              {/* Board Themes */}
              <section aria-labelledby="settings-themes-heading">
                <h3
                  id="settings-themes-heading"
                  className="text-xs font-semibold text-slate-300 mb-3"
                >
                  Board Theme
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {THEME_LIST.map((themeId) => {
                    const theme = BOARD_THEMES[themeId];
                    const active = settings.boardTheme === themeId;
                    return (
                      <motion.button
                        key={themeId}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onUpdate({ boardTheme: themeId })}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors min-h-[52px] cursor-pointer ${
                          active
                            ? 'bg-emerald-500/15 border-emerald-400/70 text-slate-50'
                            : 'bg-slate-800/55 border-white/10 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg overflow-hidden grid grid-cols-2 grid-rows-2 border border-white/15 shrink-0">
                          <span style={{ backgroundColor: theme.lightHex }} />
                          <span style={{ backgroundColor: theme.darkHex }} />
                          <span style={{ backgroundColor: theme.darkHex }} />
                          <span style={{ backgroundColor: theme.lightHex }} />
                        </div>
                        <span className="text-xs font-medium leading-tight">
                          {theme.name}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </section>

              {/* Piece Styles */}
              <section aria-labelledby="settings-pieces-heading">
                <h3
                  id="settings-pieces-heading"
                  className="text-xs font-semibold text-slate-300 mb-3"
                >
                  Piece Style
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {PIECE_STYLES.map((styleOpt) => {
                    const active = settings.pieceStyle === styleOpt.id;
                    return (
                      <motion.button
                        key={styleOpt.id}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onUpdate({ pieceStyle: styleOpt.id })}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors min-h-[60px] cursor-pointer ${
                          active
                            ? 'bg-emerald-500/15 border-emerald-400/70 text-slate-50'
                            : 'bg-slate-800/55 border-white/10 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="w-9 h-9 shrink-0 rounded-lg bg-slate-950/50 p-1 border border-white/10">
                          <ChessPiece type="n" color="w" pieceStyle={styleOpt.id} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">
                            {styleOpt.label}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {styleOpt.description}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </section>

              {/* Gameplay Toggles */}
              <section aria-labelledby="settings-gameplay-heading">
                <h3
                  id="settings-gameplay-heading"
                  className="text-xs font-semibold text-slate-300 mb-2.5"
                >
                  Gameplay Preferences
                </h3>
                <div className="divide-y divide-white/[0.07] rounded-xl border border-white/10 bg-slate-800/40 overflow-hidden">
                  {toggles.map((item) => {
                    const checked = settings[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        onClick={() => onUpdate({ [item.key]: !checked })}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors min-h-[56px] cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-100">
                            {item.label}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                            {item.description}
                          </div>
                        </div>
                        <span
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
                            checked ? 'bg-emerald-500' : 'bg-slate-700'
                          }`}
                          aria-hidden="true"
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                              checked ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
              {/* Account Actions */}
              <section aria-labelledby="settings-account-heading">
                <h3
                  id="settings-account-heading"
                  className="text-xs font-semibold text-slate-300 mb-2.5"
                >
                  Account
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-200 border border-red-500/25 transition-colors cursor-pointer min-h-[44px]"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>Log Out</span>
                </button>
              </section>

              {/* Exclusive Admin Mode Toggle (Admin ID Only) */}
              {userRole === 'admin' && (
                <section aria-labelledby="settings-admin-heading">
                  <h3
                    id="settings-admin-heading"
                    className="text-xs font-semibold text-slate-300 mb-2.5 flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Academy Admin Controls</span>
                  </h3>
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] overflow-hidden">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={adminModeActive}
                      onClick={() => onToggleAdminMode(!adminModeActive)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors min-h-[60px] cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100">
                          Activate Admin Mode
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          Reveal the Admin Panel tab, Puzzle Editor button, and chat moderation tools
                        </div>
                      </div>
                      <span
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
                          adminModeActive ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                        aria-hidden="true"
                      >
                        <span
                          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                            adminModeActive ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </span>
                    </button>
                  </div>
                </section>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/10 bg-slate-950/50">
              <button
                type="button"
                onClick={onReset}
                disabled={isDefault}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-white transition-colors cursor-pointer min-h-[40px]"
              >
                Done
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
