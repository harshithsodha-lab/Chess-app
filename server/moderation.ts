export interface ModerationResult {
  allowed: boolean;
  flagged: boolean;
  reason: string;
  cleanText: string;
}

const PROFANITY_PATTERNS: RegExp[] = [
  /\bf+u+c+k+(?:ing|er|ed|s)?\b/i,
  /\bs+h+i+t+(?:ty|s|ting)?\b/i,
  /\bb+i+t+c+h+(?:es|ing|y)?\b/i,
  /\ba+s+s+h+o+l+e+s?\b/i,
  /\bd+i+c+k+(?:head|s)?\b/i,
  /\bc+u+n+t+s?\b/i,
  /\bw+h+o+r+e+s?\b/i,
  /\bs+l+u+t+s?\b/i,
  /\bb+a+s+t+a+r+d+s?\b/i,
  /\bp+u+s+s+y+\b/i,
  /\bm+o+t+h+e+r+f+u+c+k/i,
  /\bn+i+g+g+(?:a|er|ers|as)\b/i,
  /\bf+a+g+(?:got|gots|s)?\b/i,
  /\br+e+t+a+r+d+(?:ed|s)?\b/i,
  /\bk+y+s+\b/i,
  /\bkill\s+yourself\b/i,
  /\bstfu\b/i,
  /\bgtfo\b/i,
  /\bgo\s+die\b/i,
  /\bshut\s+up\s+(?:idiot|loser|moron|stupid)\b/i,
];

const URL_PATTERN =
  /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|gg|xyz|ru|cn|tk|cc|me|tv|app)\b)/i;

const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MESSAGES = 8;
const DUPLICATE_COOLDOWN_MS = 3_000;

interface SenderRateState {
  timestamps: number[];
  lastText: string;
  lastSentAt: number;
}

const senderRates = new Map<string, SenderRateState>();

export function clearRateStateForTests() {
  senderRates.clear();
}

export function checkMessageSafety(senderId: string, rawText: string): ModerationResult {
  const cleanText = rawText.replace(/\s+/g, ' ').trim();

  if (!cleanText) {
    return {
      allowed: false,
      flagged: false,
      reason: 'Message cannot be empty.',
      cleanText: '',
    };
  }

  if (cleanText.length > 500) {
    return {
      allowed: false,
      flagged: true,
      reason: 'Message exceeds 500 character limit.',
      cleanText: cleanText.slice(0, 500),
    };
  }

  // Normalize simple leetspeak substitutions for profanity scan without touching chess notation
  const normalizedForScan = cleanText
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[$5]/g, 's');

  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(cleanText) || pattern.test(normalizedForScan)) {
      return {
        allowed: false,
        flagged: true,
        reason: 'Inappropriate or abusive language detected.',
        cleanText,
      };
    }
  }

  if (URL_PATTERN.test(cleanText)) {
    return {
      allowed: false,
      flagged: true,
      reason: 'External links and websites are blocked in Academy chat.',
      cleanText,
    };
  }

  // Detect repeated character spam (e.g. aaaaaaaaaa)
  if (/(.)\1{9,}/i.test(cleanText)) {
    return {
      allowed: false,
      flagged: true,
      reason: 'Repeated character spam detected.',
      cleanText,
    };
  }

  // Detect excessive all-caps shouting on longer messages
  const alphaChars = cleanText.replace(/[^a-zA-Z]/g, '');
  if (alphaChars.length >= 18) {
    const upperCount = alphaChars.replace(/[^A-Z]/g, '').length;
    if (upperCount / alphaChars.length >= 0.85) {
      return {
        allowed: false,
        flagged: true,
        reason: 'Excessive all-caps shouting detected.',
        cleanText,
      };
    }
  }

  // Rate limit & duplicate flood protection
  const now = Date.now();
  const state = senderRates.get(senderId) ?? {
    timestamps: [],
    lastText: '',
    lastSentAt: 0,
  };

  if (
    state.lastText.toLowerCase() === cleanText.toLowerCase() &&
    now - state.lastSentAt < DUPLICATE_COOLDOWN_MS
  ) {
    return {
      allowed: false,
      flagged: true,
      reason: 'Duplicate message sent too quickly (anti-spam).',
      cleanText,
    };
  }

  const recent = state.timestamps.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_MESSAGES) {
    return {
      allowed: false,
      flagged: true,
      reason: 'Message rate limit exceeded (anti-spam flood protection).',
      cleanText,
    };
  }

  recent.push(now);
  senderRates.set(senderId, {
    timestamps: recent,
    lastText: cleanText,
    lastSentAt: now,
  });

  return {
    allowed: true,
    flagged: false,
    reason: '',
    cleanText,
  };
}
