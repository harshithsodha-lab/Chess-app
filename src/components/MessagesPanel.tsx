import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MessageSquare,
  Send,
  Volume2,
  VolumeX,
  Users,
  ShieldAlert,
  Trash2,
  Ban,
  ShieldCheck,
} from 'lucide-react';
import type {
  AcademyUser,
  ClassmateDirectoryEntry,
  SocialMessageRecord,
} from '../types/academy';

const QUICK_REACTIONS = [
  'Good luck!',
  'Nice move!',
  'Well played!',
  'Rematch?',
] as const;

const MUTE_STORAGE_KEY = 'pure_chess_chat_muted_v1';

interface MessagesPanelProps {
  token: string;
  user: AcademyUser;
  adminModeActive?: boolean;
  classmates: ClassmateDirectoryEntry[];
  matchRoomId: string | null;
  matchOpponentLabel?: string | null;
  defaultChannel?: 'match' | 'dm';
  selectedDmPeerId: string | null;
  onSelectDmPeerId: (peerId: string | null) => void;
  onOpenFriendsDrawer?: () => void;
  onOpenModerationQueue?: () => void;
  onTogglePeerChatDisabled?: (userId: string, currentlyDisabled: boolean) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  forceDmNonce?: number;
  compact?: boolean;
}

export const MessagesPanel: React.FC<MessagesPanelProps> = ({
  token,
  user,
  adminModeActive = false,
  classmates,
  matchRoomId,
  matchOpponentLabel,
  defaultChannel = 'match',
  selectedDmPeerId,
  onSelectDmPeerId,
  onOpenFriendsDrawer,
  onOpenModerationQueue,
  onTogglePeerChatDisabled,
  onDeleteMessage,
  forceDmNonce = 0,
  compact = false,
}) => {
  const [channel, setChannel] = useState<'match' | 'dm'>(() =>
    matchRoomId ? defaultChannel : 'dm'
  );
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [messages, setMessages] = useState<SocialMessageRecord[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const friendsFirstList = useMemo(() => {
    const friends = classmates.filter((c) => c.friendship_status === 'accepted');
    const others = classmates.filter((c) => c.friendship_status !== 'accepted');
    return [...friends, ...others];
  }, [classmates]);

  useEffect(() => {
    if (!matchRoomId && channel === 'match') {
      setChannel('dm');
    }
  }, [matchRoomId, channel]);

  useEffect(() => {
    if (forceDmNonce > 0) {
      setChannel('dm');
    }
  }, [forceDmNonce]);

  useEffect(() => {
    if (selectedDmPeerId) return;
    if (friendsFirstList.length > 0) {
      onSelectDmPeerId(friendsFirstList[0].id);
    }
  }, [friendsFirstList, selectedDmPeerId, onSelectDmPeerId]);

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const fetchThread = useCallback(async () => {
    if (muted) return;
    if (channel === 'match' && !matchRoomId) {
      setMessages([]);
      return;
    }
    if (channel === 'dm' && !selectedDmPeerId) {
      setMessages([]);
      return;
    }

    try {
      const params =
        channel === 'match'
          ? new URLSearchParams({
              channelType: 'match',
              matchRoomId: matchRoomId || '',
            })
          : new URLSearchParams({
              channelType: 'dm',
              peerId: selectedDmPeerId || '',
            });

      const res = await fetch(`/api/social/messages?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: SocialMessageRecord[] };
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch {
      // Ignore transient poll errors
    }
  }, [muted, channel, matchRoomId, selectedDmPeerId, token]);

  useEffect(() => {
    fetchThread();
    if (muted) return;
    const interval = window.setInterval(fetchThread, 2500);
    return () => window.clearInterval(interval);
  }, [fetchThread, muted]);

  const sendText = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || sending || muted || user.chat_disabled) return;
    if (channel === 'match' && !matchRoomId) return;
    if (channel === 'dm' && !selectedDmPeerId) return;

    setSending(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/social/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelType: channel,
          recipientId: channel === 'dm' ? selectedDmPeerId : null,
          matchRoomId: channel === 'match' ? matchRoomId : null,
          messageText: trimmed,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: SocialMessageRecord;
        error?: string;
      };
      if (!res.ok) {
        setErrorBanner(data.error || 'Message could not be sent.');
        return;
      }
      if (data.message) {
        setMessages((prev) => [...prev, data.message!]);
      }
      setInputText('');
    } catch {
      setErrorBanner('Network issue sending message.');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendText(inputText);
  };

  const activeDmPeer = friendsFirstList.find((c) => c.id === selectedDmPeerId);
  const canChatInActiveChannel =
    !muted &&
    !user.chat_disabled &&
    ((channel === 'match' && Boolean(matchRoomId)) ||
      (channel === 'dm' && Boolean(selectedDmPeerId)));

  return (
    <div
      className={`flex flex-col ${
        compact ? 'h-full' : 'rounded-2xl bg-[#18181B] border border-white/[0.08] overflow-hidden'
      }`}
    >
      {/* Header + Mute Chat Toggle */}
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-2 bg-[#141417]/70">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
          <h3 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate">
            Messages
          </h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {user.role === 'admin' && adminModeActive && onOpenModerationQueue && (
            <button
              type="button"
              onClick={onOpenModerationQueue}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/30 transition-colors cursor-pointer whitespace-nowrap"
              title="Open Moderation Queue in Admin Panel"
            >
              <ShieldCheck className="w-3 h-3 shrink-0" />
              <span>Moderation</span>
            </button>
          )}
          {onOpenFriendsDrawer && (
            <button
              type="button"
              onClick={onOpenFriendsDrawer}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Users className="w-3 h-3 text-emerald-400" />
              <span>Friends</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
              muted
                ? 'bg-amber-500/15 border-amber-400/35 text-amber-200'
                : 'bg-zinc-800 hover:bg-zinc-700 border-white/10 text-zinc-300'
            }`}
          >
            {muted ? (
              <VolumeX className="w-3 h-3 shrink-0" />
            ) : (
              <Volume2 className="w-3 h-3 shrink-0" />
            )}
            <span>{muted ? 'Unmute Chat' : 'Mute Chat'}</span>
          </button>
        </div>
      </div>

      {/* Two Tabs: Match Chat | Friends DM */}
      <div className="px-3.5 py-2 border-b border-white/[0.08] bg-zinc-950/35 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setChannel('match');
            setErrorBanner(null);
          }}
          className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            channel === 'match'
              ? 'bg-emerald-600 text-white'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/70'
          }`}
        >
          Match Chat
        </button>
        <button
          type="button"
          onClick={() => {
            setChannel('dm');
            setErrorBanner(null);
          }}
          className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            channel === 'dm'
              ? 'bg-emerald-600 text-white'
              : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/70'
          }`}
        >
          Friends DM
        </button>
      </div>

      {/* Sub-header context */}
      {channel === 'dm' ? (
        <div className="px-3.5 py-2 border-b border-white/[0.06] bg-zinc-900/40 flex items-center gap-2">
          <span className="text-[11px] text-zinc-400 shrink-0">To:</span>
          {friendsFirstList.length === 0 ? (
            <span className="text-[11px] text-zinc-500">
              No classmates in directory yet
            </span>
          ) : (
            <>
              <select
                value={selectedDmPeerId || ''}
                onChange={(e) => {
                  onSelectDmPeerId(e.target.value || null);
                  setErrorBanner(null);
                }}
                aria-label="Select friend or classmate to message"
                className="flex-1 min-w-0 px-2.5 py-1 rounded-lg text-xs bg-zinc-900 text-zinc-100 border border-white/10 focus:outline-none focus:border-emerald-400 cursor-pointer"
              >
                {friendsFirstList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.login_id}) ·{' '}
                    {c.friendship_status === 'accepted' ? 'Friend' : 'Classmate'} ·{' '}
                    {c.presence_status === 'online'
                      ? 'Online'
                      : c.presence_status === 'in_game'
                      ? 'In-Game'
                      : 'Offline'}
                  </option>
                ))}
              </select>
              {user.role === 'admin' &&
                adminModeActive &&
                activeDmPeer &&
                onTogglePeerChatDisabled && (
                  <button
                    type="button"
                    onClick={() =>
                      onTogglePeerChatDisabled(
                        activeDmPeer.id,
                        Boolean(activeDmPeer.chat_disabled)
                      )
                    }
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors shrink-0 cursor-pointer whitespace-nowrap ${
                      activeDmPeer.chat_disabled
                        ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                        : 'bg-red-500/15 border-red-500/30 text-red-200'
                    }`}
                    title={
                      activeDmPeer.chat_disabled
                        ? 'Re-enable chat for this student'
                        : 'Disable chat for this student'
                    }
                  >
                    <Ban className="w-3 h-3" />
                    <span>{activeDmPeer.chat_disabled ? 'Enable Chat' : 'Disable Chat'}</span>
                  </button>
                )}
            </>
          )}
        </div>
      ) : (
        <div className="px-3.5 py-1.5 border-b border-white/[0.06] bg-zinc-900/40 text-[11px] text-zinc-400 truncate">
          {matchRoomId
            ? `Opponent: ${matchOpponentLabel || 'Live Match'}`
            : 'Start a live match in Play or challenge a friend to use Match Chat.'}
        </div>
      )}

      {/* Admin Chat Restriction Notice */}
      {user.chat_disabled && (
        <div className="mx-3 mt-2.5 rounded-xl bg-red-500/15 border border-red-500/35 px-3 py-2 flex items-start gap-2 text-[11px] text-red-200">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
          <span>
            Messaging has been disabled for your account by an Academy Admin.
          </span>
        </div>
      )}

      {/* Messages Feed */}
      <div
        className={`flex-1 overflow-y-auto chess-scroll px-3.5 py-3 space-y-2.5 ${
          compact ? 'min-h-[150px]' : 'min-h-[180px] max-h-[250px]'
        }`}
      >
        {muted ? (
          <div className="h-full flex flex-col items-center justify-center py-8 text-center space-y-1">
            <VolumeX className="w-5 h-5 text-zinc-500" />
            <p className="text-xs font-medium text-zinc-300">
              Chat muted for focused study
            </p>
            <p className="text-[11px] text-zinc-500">
              Click Unmute Chat whenever you want to read or send messages.
            </p>
          </div>
        ) : channel === 'match' && !matchRoomId ? (
          <div className="h-full flex items-center justify-center py-8 text-center text-xs text-zinc-500">
            No active match room yet. Switch to Friends DM to message a classmate, or challenge a friend to play!
          </div>
        ) : channel === 'dm' && !activeDmPeer ? (
          <div className="h-full flex items-center justify-center py-8 text-center text-xs text-zinc-500">
            Select a friend or classmate above to start chatting.
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center py-8 text-center text-xs text-zinc-500">
            Say hello or tap a quick phrase below!
          </div>
        ) : (
          messages.map((msg) => {
            const mine = msg.sender_id === user.id;
            const showModActions = user.role === 'admin' && adminModeActive;
            return (
              <div
                key={msg.id}
                className={`group flex flex-col ${mine ? 'items-end' : 'items-start'} space-y-0.5`}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 px-1">
                  <span>
                    {mine ? 'You' : msg.sender_name} ·{' '}
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {showModActions && onDeleteMessage && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onDeleteMessage(msg.id);
                        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                      }}
                      aria-label="Remove message"
                      title="Remove message"
                      className="inline-flex items-center gap-0.5 text-red-400/80 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed break-words ${
                    mine
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-900 border border-white/10 text-zinc-100'
                  }`}
                >
                  {msg.message_text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Safety Filter / Error Banner */}
      {errorBanner && (
        <div className="mx-3 mb-2 rounded-lg bg-amber-500/15 border border-amber-400/35 px-2.5 py-1.5 text-[11px] text-amber-200">
          {errorBanner}
        </div>
      )}

      {/* Quick-Tap Chess Phrases */}
      <div className="px-3 py-2 border-t border-white/[0.06] bg-zinc-950/30 flex flex-wrap gap-1.5">
        {QUICK_REACTIONS.map((phrase) => (
          <button
            key={phrase}
            type="button"
            disabled={!canChatInActiveChannel || sending}
            onClick={() => sendText(phrase)}
            className="px-2 py-1 rounded-lg text-[11px] font-medium bg-zinc-800/90 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-white/[0.08] transition-colors whitespace-nowrap cursor-pointer"
          >
            {phrase}
          </button>
        ))}
      </div>

      {/* Text Input */}
      <form
        onSubmit={handleSubmit}
        className="p-2.5 border-t border-white/[0.08] bg-[#141417] flex items-center gap-2"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={!canChatInActiveChannel}
          placeholder={
            user.chat_disabled
              ? 'Chat disabled by Admin'
              : muted
              ? 'Chat is muted'
              : 'Write a respectful message…'
          }
          className="flex-1 min-w-0 px-3 py-2 rounded-xl text-xs bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 border border-white/10 disabled:opacity-50 focus:outline-none focus:border-emerald-400"
        />
        <button
          type="submit"
          disabled={!canChatInActiveChannel || sending || !inputText.trim()}
          aria-label="Send message"
          className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors shrink-0 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
