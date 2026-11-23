export type UserRole = 'admin' | 'student';
export type StorageMode = 'supabase' | 'memory-fallback';
export type PresenceStatus = 'online' | 'in_game' | 'offline';

export interface AcademyUser {
  id: string;
  login_id: string;
  full_name: string;
  role: UserRole;
  session_approved: boolean;
  pending_approval: boolean;
  last_login_request: string | null;
  chat_disabled?: boolean;
  presence_status?: PresenceStatus;
  last_seen_at?: string | null;
}

export interface CustomPuzzleRecord {
  id: string;
  title: string;
  fen: string;
  solution_moves: string;
  difficulty: string;
  coach_notes: string;
  created_at: string;
}

export interface StudentProgressRecord {
  id: string;
  user_id: string;
  puzzle_id: string;
  solved: boolean;
  attempts: number;
  completed_at: string | null;
}

export type AcademyGameResult = 'win' | 'loss' | 'draw';

export interface AcademyGameRecord {
  id: string;
  user_id: string;
  opponent_label: string;
  time_control: string;
  player_color: 'w' | 'b';
  result: AcademyGameResult;
  result_reason: string;
  initial_fen: string;
  moves_san: string;
  move_count: number;
  played_at: string;
}

export interface AuthStatusPayload {
  needsAdminBootstrap: boolean;
  envAdminLoginHint: string | null;
  storageMode: StorageMode;
  fallbackReason: string;
  realtimeConfig: {
    url: string;
    anonKey: string;
  };
}

export interface CoachMessageRecord {
  id: string;
  student_id: string;
  sender_id: string;
  sender_role: UserRole;
  sender_name: string;
  message_text: string;
  attached_fen: string | null;
  attached_context: string;
  created_at: string;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

export interface FriendshipRecord {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
}

export interface ClassmateDirectoryEntry {
  id: string;
  login_id: string;
  full_name: string;
  presence_status: PresenceStatus;
  chat_disabled?: boolean;
  friendship_id: string | null;
  friendship_status: FriendshipStatus | 'none';
  friendship_direction: 'incoming' | 'outgoing' | 'none';
}

export interface SocialMessageRecord {
  id: string;
  channel_type: 'dm' | 'match';
  sender_id: string;
  recipient_id: string | null;
  match_room_id: string | null;
  sender_name: string;
  sender_login_id: string;
  message_text: string;
  flagged: boolean;
  flag_reason: string;
  created_at: string;
}

export interface MatchChallengeRecord {
  id: string;
  challenger_id: string;
  challenger_name: string;
  challenger_login_id: string;
  challenged_id: string;
  challenged_name: string;
  challenged_login_id: string;
  time_control: 'rapid10' | 'blitz5' | 'untimed';
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  moves_san: string;
  resigned_by: 'w' | 'b' | null;
  created_at: string;
  updated_at: string;
}

export interface AdminOverviewPayload {
  pendingRequests: AcademyUser[];
  activeStudents: AcademyUser[];
  students: AcademyUser[];
  puzzles: CustomPuzzleRecord[];
  progress: StudentProgressRecord[];
  flaggedMessages?: SocialMessageRecord[];
  storageMode: StorageMode;
  fallbackReason: string;
}
