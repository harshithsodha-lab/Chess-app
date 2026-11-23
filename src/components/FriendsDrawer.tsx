import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Users,
  UserPlus,
  Check,
  Swords,
  MessageSquare,
  Search,
  Clock,
} from 'lucide-react';
import type {
  ClassmateDirectoryEntry,
  MatchChallengeRecord,
} from '../types/academy';
import type { QuickPlayTimeControl } from './HomeDashboard';

interface FriendsDrawerProps {
  open: boolean;
  onClose: () => void;
  classmates: ClassmateDirectoryEntry[];
  challenges: MatchChallengeRecord[];
  currentUserId: string;
  onSendFriendRequest: (targetUserId: string) => Promise<void>;
  onRespondFriendRequest: (friendshipId: string, accept: boolean) => Promise<void>;
  onChallengeFriend: (
    opponentId: string,
    timeControl: QuickPlayTimeControl
  ) => Promise<void>;
  onRespondChallenge: (challengeId: string, accept: boolean) => Promise<void>;
  onOpenDirectMessage: (classmateId: string) => void;
}

const PRESENCE_META = {
  online: {
    label: 'Online',
    dotClass: 'bg-emerald-400',
    textClass: 'text-emerald-400',
  },
  in_game: {
    label: 'In-Game',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-300',
  },
  offline: {
    label: 'Offline',
    dotClass: 'bg-zinc-600',
    textClass: 'text-zinc-500',
  },
} as const;

export const FriendsDrawer: React.FC<FriendsDrawerProps> = ({
  open,
  onClose,
  classmates,
  challenges,
  currentUserId,
  onSendFriendRequest,
  onRespondFriendRequest,
  onChallengeFriend,
  onRespondChallenge,
  onOpenDirectMessage,
}) => {
  const [search, setSearch] = useState('');
  const [challengeTimeControl, setChallengeTimeControl] =
    useState<QuickPlayTimeControl>('rapid10');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const incomingChallenges = useMemo(
    () =>
      challenges.filter(
        (c) => c.status === 'pending' && c.challenged_id === currentUserId
      ),
    [challenges, currentUserId]
  );

  const outgoingChallenges = useMemo(
    () =>
      challenges.filter(
        (c) => c.status === 'pending' && c.challenger_id === currentUserId
      ),
    [challenges, currentUserId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return classmates;
    return classmates.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.login_id.toLowerCase().includes(q)
    );
  }, [classmates, search]);

  const friendsList = useMemo(
    () => filtered.filter((c) => c.friendship_status === 'accepted'),
    [filtered]
  );

  const incomingRequests = useMemo(
    () =>
      filtered.filter(
        (c) =>
          c.friendship_status === 'pending' &&
          c.friendship_direction === 'incoming'
      ),
    [filtered]
  );

  const otherClassmates = useMemo(
    () =>
      filtered.filter(
        (c) =>
          c.friendship_status !== 'accepted' &&
          !(
            c.friendship_status === 'pending' &&
            c.friendship_direction === 'incoming'
          )
      ),
    [filtered]
  );

  const runAction = async (id: string, fn: () => Promise<void>, okMsg?: string) => {
    setBusyId(id);
    setFeedback(null);
    try {
      await fn();
      if (okMsg) setFeedback(okMsg);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const renderClassmateRow = (c: ClassmateDirectoryEntry) => {
    const meta = PRESENCE_META[c.presence_status];
    const isBusy = busyId === c.id || busyId === c.friendship_id;

    return (
      <div
        key={c.id}
        className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`}
              aria-hidden="true"
            />
            <span className="text-xs font-semibold text-zinc-100 truncate">
              {c.full_name}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] pl-4">
            <span className="font-mono-tabular text-zinc-400">{c.login_id}</span>
            <span className="text-zinc-600">·</span>
            <span className={`font-medium ${meta.textClass}`}>{meta.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {c.friendship_status === 'accepted' ? (
            <>
              <button
                type="button"
                disabled={isBusy || c.presence_status === 'offline'}
                onClick={() =>
                  runAction(
                    c.id,
                    () => onChallengeFriend(c.id, challengeTimeControl),
                    `Match challenge sent to ${c.full_name}.`
                  )
                }
                title={
                  c.presence_status === 'offline'
                    ? 'Friend is offline'
                    : 'Challenge to a live match'
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Swords className="w-3 h-3 shrink-0" />
                <span>Challenge</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenDirectMessage(c.id);
                  onClose();
                }}
                aria-label={`Message ${c.full_name}`}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition-colors cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            </>
          ) : c.friendship_status === 'pending' &&
            c.friendship_direction === 'incoming' &&
            c.friendship_id ? (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  runAction(c.friendship_id!, () =>
                    onRespondFriendRequest(c.friendship_id!, true)
                  )
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>Accept</span>
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  runAction(c.friendship_id!, () =>
                    onRespondFriendRequest(c.friendship_id!, false)
                  )
                }
                className="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Decline
              </button>
            </>
          ) : c.friendship_status === 'pending' ? (
            <span className="text-[11px] font-medium text-zinc-400 px-2">
              Requested
            </span>
          ) : (
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                runAction(c.id, () => onSendFriendRequest(c.id))
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-3 h-3 text-emerald-400" />
              <span>Add Friend</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Friends and Classmates Directory"
        >
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[390px] h-full flex flex-col bg-[#18181B] border-l border-white/10 shadow-2xl"
          >
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-50">
                    Friends &amp; Classmates
                  </h2>
                  <p className="text-[11px] text-zinc-400 font-mono-tabular">
                    {classmates.filter((c) => c.presence_status !== 'offline').length} online now
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close directory"
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search + Challenge Clock */}
            <div className="p-3.5 border-b border-white/[0.08] space-y-2.5 bg-[#141417] shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search classmates by name or ID…"
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 border border-white/10 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                  <Clock className="w-3 h-3" />
                  <span>Challenge clock</span>
                </span>
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-900 border border-white/10">
                  {(
                    [
                      { id: 'rapid10', label: '10m' },
                      { id: 'blitz5', label: '5m' },
                      { id: 'untimed', label: 'Untimed' },
                    ] as const
                  ).map((tc) => (
                    <button
                      key={tc.id}
                      type="button"
                      onClick={() => setChallengeTimeControl(tc.id)}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        challengeTimeControl === tc.id
                          ? 'bg-emerald-600 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {tc.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {feedback && (
              <div className="mx-3.5 mt-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-200">
                {feedback}
              </div>
            )}

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto chess-scroll divide-y divide-white/[0.06]">
              {/* Incoming Live Match Challenges */}
              {incomingChallenges.length > 0 && (
                <div className="p-3.5 space-y-2 bg-emerald-500/5">
                  <div className="text-[11px] font-semibold text-emerald-400">
                    Incoming Match Challenges
                  </div>
                  {incomingChallenges.map((ch) => (
                    <div
                      key={ch.id}
                      className="rounded-xl bg-zinc-900 border border-emerald-500/30 p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-100 truncate">
                          {ch.challenger_name}
                        </div>
                        <div className="text-[11px] font-mono-tabular text-zinc-400">
                          {ch.time_control === 'rapid10'
                            ? '10 min Rapid'
                            : ch.time_control === 'blitz5'
                            ? '5 min Blitz'
                            : 'Untimed'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            runAction(ch.id, () => onRespondChallenge(ch.id, true))
                          }
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            runAction(ch.id, () => onRespondChallenge(ch.id, false))
                          }
                          className="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {outgoingChallenges.length > 0 && (
                <div className="px-4 py-2.5 text-[11px] text-amber-300 bg-amber-500/5">
                  Waiting for{' '}
                  {outgoingChallenges.map((c) => c.challenged_name).join(', ')} to accept your match challenge…
                </div>
              )}

              {/* Incoming Friend Requests */}
              {incomingRequests.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[11px] font-semibold text-zinc-400 bg-zinc-900/50">
                    Friend Requests ({incomingRequests.length})
                  </div>
                  <div className="divide-y divide-white/[0.05]">
                    {incomingRequests.map(renderClassmateRow)}
                  </div>
                </div>
              )}

              {/* Accepted Friends */}
              <div>
                <div className="px-4 py-2 text-[11px] font-semibold text-zinc-400 bg-zinc-900/50">
                  Friends ({friendsList.length})
                </div>
                {friendsList.length === 0 ? (
                  <div className="px-4 py-4 text-xs text-zinc-500">
                    No friends added yet. Send a friend request to a classmate below.
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.05]">
                    {friendsList.map(renderClassmateRow)}
                  </div>
                )}
              </div>

              {/* Academy Classmates Directory */}
              <div>
                <div className="px-4 py-2 text-[11px] font-semibold text-zinc-400 bg-zinc-900/50">
                  Academy Classmates ({otherClassmates.length})
                </div>
                {otherClassmates.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-zinc-500">
                    {classmates.length === 0
                      ? 'No other student accounts in the directory yet.'
                      : 'No other classmates match your search.'}
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.05]">
                    {otherClassmates.map(renderClassmateRow)}
                  </div>
                )}
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
