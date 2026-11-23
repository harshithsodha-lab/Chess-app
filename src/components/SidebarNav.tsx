import React, { useSyncExternalStore } from 'react';
import {
  Home,
  Swords,
  Puzzle,
  BookOpen,
  Microscope,
  ShieldCheck,
  Settings,
  LogOut,
  Users,
} from 'lucide-react';
import { ChessPiece } from './ChessPiece';
import { sentinelAgent } from '../lib/autoHealAgent';
import type { AcademyUser } from '../types/academy';

export type NavTab = 'home' | 'play' | 'puzzles' | 'learn' | 'analyze' | 'admin';

interface SidebarNavProps {
  activeTab: NavTab;
  user: AcademyUser;
  adminModeActive?: boolean;
  onSelectTab: (tab: NavTab) => void;
  onOpenFriends: () => void;
  onlineClassmatesCount?: number;
  pendingSocialCount?: number;
  onOpenSettings: () => void;
  onOpenSystemHealth?: () => void;
  onLogout: () => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  user,
  adminModeActive = false,
  onSelectTab,
  onOpenFriends,
  onlineClassmatesCount = 0,
  pendingSocialCount = 0,
  onOpenSettings,
  onOpenSystemHealth,
  onLogout,
}) => {
  const isAdminActive = user.role === 'admin' && adminModeActive;
  const sentinel = useSyncExternalStore(
    sentinelAgent.subscribe,
    sentinelAgent.getSnapshot
  );

  const healthLabel =
    sentinel.health === 'healthy'
      ? 'System Healthy'
      : sentinel.health === 'auto_fixed'
      ? 'Auto-Fixed Issue'
      : 'Issue Logged';

  const healthDotColor =
    sentinel.health === 'healthy'
      ? 'bg-emerald-400'
      : sentinel.health === 'auto_fixed'
      ? 'bg-amber-400'
      : 'bg-amber-400';
  const navItems: {
    id: NavTab;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'home', label: 'Home', mobileLabel: 'Home', icon: Home },
    { id: 'play', label: 'Play', mobileLabel: 'Play', icon: Swords },
    { id: 'puzzles', label: 'Puzzles', mobileLabel: 'Puzzles', icon: Puzzle },
    { id: 'learn', label: 'Learn', mobileLabel: 'Learn', icon: BookOpen },
    { id: 'analyze', label: 'Analyze', mobileLabel: 'Analyze', icon: Microscope },
    ...(isAdminActive
      ? [{ id: 'admin' as const, label: 'Admin Panel', mobileLabel: 'Admin', icon: ShieldCheck }]
      : []),
  ];

  const initials = (user.full_name || user.login_id)
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <>
      {/* =================================================================== */}
      {/* DESKTOP / TABLET FIXED LEFT SIDEBAR (>= 768px)                      */}
      {/* =================================================================== */}
      <aside
        className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-[76px] lg:w-[232px] bg-[#18181B] border-r border-white/[0.08]"
        aria-label="Primary sidebar navigation"
      >
        {/* Brand Header */}
        <div className="h-16 px-3 lg:px-5 flex items-center justify-center lg:justify-start gap-3 border-b border-white/[0.06] shrink-0">
          <button
            type="button"
            onClick={() => onSelectTab('home')}
            className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-lg cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-1.5 shrink-0">
              <ChessPiece type="n" color="w" />
            </div>
            <div className="hidden lg:block min-w-0">
              <div className="text-base font-bold tracking-tight text-zinc-50 whitespace-nowrap">
                Pure Chess
              </div>
              <div className="text-[11px] text-zinc-400 whitespace-nowrap">
                Academy Studio
              </div>
            </div>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-2.5 lg:px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                title={item.label}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center justify-center lg:justify-start gap-3 px-2.5 lg:px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer ${
                  active
                    ? 'bg-zinc-800/95 text-white'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/45'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    active ? 'text-emerald-400' : 'text-zinc-400'
                  }`}
                />
                <span className="hidden lg:inline truncate">{item.label}</span>
              </button>
            );
          })}

          <div className="pt-2 mt-2 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={onOpenFriends}
              title="Friends & Classmates"
              className="w-full flex items-center justify-center lg:justify-between gap-3 px-2.5 lg:px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800/55 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
            >
              <span className="flex items-center gap-3 min-w-0">
                <Users className="w-5 h-5 shrink-0 text-emerald-400" />
                <span className="hidden lg:inline truncate">Classmates</span>
              </span>
              <span className="hidden lg:inline font-mono-tabular text-[11px] text-zinc-400">
                {pendingSocialCount > 0 ? (
                  <span className="text-amber-300 font-semibold">{pendingSocialCount} new</span>
                ) : (
                  onlineClassmatesCount
                )}
              </span>
            </button>
          </div>
        </nav>

        {/* Bottom Profile, Settings & Log Out */}
        <div className="p-2.5 lg:p-3 border-t border-white/[0.08] space-y-1.5 shrink-0 bg-[#141417]">
          <button
            type="button"
            onClick={onOpenSettings}
            title="Settings"
            className="w-full flex items-center justify-center lg:justify-start gap-3 px-2.5 lg:px-3 py-2 min-h-[40px] rounded-xl text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
          >
            <Settings className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="hidden lg:inline">Settings</span>
          </button>

          {/* Student / Admin Profile Badge */}
          <div className="flex items-center justify-center lg:justify-start gap-2.5 px-2 lg:px-3 py-2 rounded-xl bg-zinc-900/90 border border-white/[0.06]">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-300 shrink-0">
              {initials || 'PC'}
            </div>
            <div className="hidden lg:block min-w-0 flex-1">
              <div className="text-xs font-semibold text-zinc-100 truncate">
                {user.full_name}
              </div>
              <div className="text-[11px] font-mono-tabular text-zinc-400 truncate">
                {user.login_id} · {isAdminActive ? 'Admin' : 'Academy'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            title="Log Out"
            className="w-full flex items-center justify-center lg:justify-start gap-3 px-2.5 lg:px-3 py-2 min-h-[40px] rounded-xl text-xs font-medium text-zinc-300 hover:text-red-200 hover:bg-red-500/15 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline">Log Out</span>
          </button>

          {/* Subtle Sentinel Bot Status Indicator */}
          {isAdminActive && onOpenSystemHealth ? (
            <button
              type="button"
              onClick={onOpenSystemHealth}
              title={healthLabel}
              className="w-full flex items-center justify-center lg:justify-start gap-2.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors cursor-pointer"
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${healthDotColor}`}
                aria-hidden="true"
              />
              <span className="hidden lg:inline truncate">{healthLabel}</span>
            </button>
          ) : (
            <div
              title={healthLabel}
              className="w-full flex items-center justify-center lg:justify-start gap-2.5 px-2.5 lg:px-3 py-1.5 text-[11px] text-zinc-400"
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${healthDotColor}`}
                aria-hidden="true"
              />
              <span className="hidden lg:inline truncate">{healthLabel}</span>
            </div>
          )}
        </div>
      </aside>

      {/* =================================================================== */}
      {/* MOBILE TOP BAR (< 768px)                                            */}
      {/* =================================================================== */}
      <header className="md:hidden shrink-0 h-12 px-3 bg-[#18181B] border-b border-white/[0.08] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelectTab('home')}
          className="flex items-center gap-2 min-w-0 cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 p-1 shrink-0">
            <ChessPiece type="n" color="w" />
          </div>
          <span className="text-sm font-bold tracking-tight text-zinc-50 whitespace-nowrap">
            Pure Chess
          </span>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] font-mono-tabular text-zinc-400 truncate max-w-[80px]">
            {user.login_id}
          </span>
          <button
            type="button"
            onClick={onOpenFriends}
            aria-label="Open friends and classmates"
            className="relative min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer touch-manipulation"
          >
            <Users className="w-4 h-4 text-emerald-400" />
            {pendingSocialCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer touch-manipulation"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-red-300 hover:bg-red-500/15 cursor-pointer touch-manipulation"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* =================================================================== */}
      {/* MOBILE BOTTOM NAVIGATION BAR (< 768px)                              */}
      {/* =================================================================== */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#18181B]/95 backdrop-blur-md border-t border-white/10 px-1"
        aria-label="Mobile bottom navigation"
      >
        <div
          className={`grid h-14 items-center ${
            navItems.length === 6 ? 'grid-cols-6' : 'grid-cols-5'
          }`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors touch-manipulation cursor-pointer ${
                  active ? 'text-emerald-400' : 'text-zinc-400 active:text-zinc-200'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-medium mt-1 leading-none whitespace-nowrap">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
