import { Chess } from 'chess.js';

export type DiagnosticCategory =
  | 'board_integrity'
  | 'bot_watchdog'
  | 'clock_watchdog'
  | 'session_network'
  | 'runtime_error';

export type DiagnosticSeverity = 'auto_repaired' | 'unresolved';

export type SystemHealthStatus = 'healthy' | 'auto_fixed' | 'attention';

export interface DiagnosticEvent {
  id: string;
  timestamp: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  title: string;
  details: string;
  repairAction: string;
  fixPrompt: string;
}

export interface SentinelSnapshot {
  health: SystemHealthStatus;
  events: DiagnosticEvent[];
  autoFixCount: number;
  unresolvedCount: number;
  lastCheckedAt: string;
}

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function buildFixPrompt(
  category: DiagnosticCategory,
  title: string,
  details: string,
  repairAction: string
): string {
  return [
    'Patch this runtime issue detected by the Pure Chess Academy Sentinel Agent:',
    `Category: ${category}`,
    `Issue: ${title}`,
    `Details: ${details}`,
    repairAction ? `Auto-Heal Attempt: ${repairAction}` : 'Auto-Heal Attempt: None',
    'Please inspect the affected component or API route and fix the root cause cleanly without breaking existing auth or board state.',
  ].join('\n');
}

class AutoHealAgent {
  private events: DiagnosticEvent[] = [];
  private listeners = new Set<() => void>();
  private lastCheckedAt: string = new Date().toISOString();
  private listenersInstalled = false;
  private recentFingerprints = new Map<string, number>();

  private cachedSnapshot: SentinelSnapshot = {
    health: 'healthy',
    events: [],
    autoFixCount: 0,
    unresolvedCount: 0,
    lastCheckedAt: this.lastCheckedAt,
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SentinelSnapshot => {
    return this.cachedSnapshot;
  };

  private recomputeAndEmit() {
    this.lastCheckedAt = new Date().toISOString();
    const autoFixCount = this.events.filter((e) => e.severity === 'auto_repaired').length;
    const unresolvedCount = this.events.filter((e) => e.severity === 'unresolved').length;
    const health: SystemHealthStatus =
      unresolvedCount > 0 ? 'attention' : autoFixCount > 0 ? 'auto_fixed' : 'healthy';

    this.cachedSnapshot = {
      health,
      events: [...this.events],
      autoFixCount,
      unresolvedCount,
      lastCheckedAt: this.lastCheckedAt,
    };

    for (const listener of this.listeners) {
      listener();
    }
  }

  private pushEvent(input: {
    category: DiagnosticCategory;
    severity: DiagnosticSeverity;
    title: string;
    details: string;
    repairAction: string;
  }) {
    const fingerprint = `${input.category}:${input.severity}:${input.title}:${input.details.slice(0, 80)}`;
    const now = Date.now();
    const lastSeen = this.recentFingerprints.get(fingerprint);
    if (lastSeen && now - lastSeen < 4000) {
      return;
    }
    this.recentFingerprints.set(fingerprint, now);

    const event: DiagnosticEvent = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `diag-${now}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(now).toISOString(),
      category: input.category,
      severity: input.severity,
      title: input.title,
      details: input.details,
      repairAction: input.repairAction,
      fixPrompt: buildFixPrompt(
        input.category,
        input.title,
        input.details,
        input.repairAction
      ),
    };

    this.events = [event, ...this.events].slice(0, 60);
    this.recomputeAndEmit();
  }

  reportAutoRepair(
    category: DiagnosticCategory,
    title: string,
    details: string,
    repairAction: string
  ) {
    this.pushEvent({
      category,
      severity: 'auto_repaired',
      title,
      details,
      repairAction,
    });
  }

  reportUnresolved(
    category: DiagnosticCategory,
    title: string,
    details: string,
    repairAction = 'Requires code or environment review'
  ) {
    this.pushEvent({
      category,
      severity: 'unresolved',
      title,
      details,
      repairAction,
    });
  }

  reportRuntimeError(error: unknown, source: string) {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof error === 'string'
        ? error
        : 'Unexpected runtime exception';

    // Ignore benign HMR / aborted fetch noise
    const lower = message.toLowerCase();
    if (lower.includes('websocket') || lower.includes('aborterror')) {
      return;
    }

    this.pushEvent({
      category: 'runtime_error',
      severity: 'unresolved',
      title: `Runtime exception in ${source}`,
      details: message,
      repairAction: 'Caught by Sentinel listener to keep session active',
    });
  }

  markResolved(id: string) {
    this.events = this.events.map((ev) =>
      ev.id === id
        ? {
            ...ev,
            severity: 'auto_repaired',
            repairAction: ev.repairAction || 'Marked resolved by Admin',
          }
        : ev
    );
    this.recomputeAndEmit();
  }

  clearEvents() {
    this.events = [];
    this.recentFingerprints.clear();
    this.recomputeAndEmit();
  }

  touchHeartbeat() {
    this.lastCheckedAt = new Date().toISOString();
  }

  installGlobalListeners() {
    if (this.listenersInstalled || typeof window === 'undefined') return;
    this.listenersInstalled = true;

    window.addEventListener('error', (event) => {
      const msg = event.message || (event.error instanceof Error ? event.error.message : 'Script error');
      this.reportRuntimeError(event.error ?? msg, event.filename ? `${event.filename}:${event.lineno}` : 'window.onerror');
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.reportRuntimeError(event.reason, 'unhandledrejection');
    });
  }

  /**
   * Validates initial FEN and every SAN move sequentially.
   * If corruption is detected, truncates back to the last valid PGN ply without crashing.
   */
  validateAndRecoverSequence(
    initialFen: string,
    moves: string[],
    contextLabel: string
  ): {
    recovered: boolean;
    safeInitialFen: string;
    safeMoves: string[];
    reason: string | null;
  } {
    let safeInitialFen = initialFen;
    let recovered = false;
    let reason: string | null = null;

    let chess: Chess;
    try {
      chess = new Chess(initialFen);
    } catch {
      chess = new Chess(STANDARD_FEN);
      safeInitialFen = STANDARD_FEN;
      recovered = true;
      reason = `Invalid starting FEN in ${contextLabel}; reset to standard starting position.`;
    }

    const safeMoves: string[] = [];
    if (!recovered || safeInitialFen === initialFen) {
      for (let i = 0; i < moves.length; i++) {
        const san = moves[i];
        try {
          const moved = chess.move(san);
          if (!moved) {
            recovered = true;
            reason = `Illegal move "${san}" at ply ${i + 1} in ${contextLabel}; rolled back to last valid PGN state.`;
            break;
          }
          safeMoves.push(moved.san);
        } catch {
          recovered = true;
          reason = `Corrupted move "${san}" at ply ${i + 1} in ${contextLabel}; rolled back to last valid PGN state.`;
          break;
        }
      }
    }

    if (recovered && reason) {
      this.reportAutoRepair(
        'board_integrity',
        `Board integrity repaired (${contextLabel})`,
        reason,
        `Recovered safely to ply ${safeMoves.length} valid state`
      );
    }

    return { recovered, safeInitialFen, safeMoves, reason };
  }

  /**
   * Resilient fetch with automatic retry for dropped requests or transient 502/503/504 errors.
   */
  async resilientFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
    label = 'Academy API request',
    maxRetries = 2
  ): Promise<Response> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(input, init);
        if (res.status >= 502 && res.status <= 504 && attempt < maxRetries) {
          await new Promise((r) => window.setTimeout(r, 450 * (attempt + 1)));
          continue;
        }
        if (attempt > 0 && res.ok) {
          this.reportAutoRepair(
            'session_network',
            `Recovered dropped request (${label})`,
            `Temporary transport hiccup succeeded on retry #${attempt}.`,
            `Auto-retried request (${attempt} retry)`
          );
        }
        return res;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise((r) => window.setTimeout(r, 450 * (attempt + 1)));
          continue;
        }
      }
    }

    const errMsg = lastError instanceof Error ? lastError.message : 'Network request dropped';
    this.reportUnresolved(
      'session_network',
      `Failed request: ${label}`,
      `${errMsg} after ${maxRetries + 1} attempts.`,
      'Attempted automatic network retries without success'
    );
    throw lastError instanceof Error ? lastError : new Error(errMsg);
  }
}

export const sentinelAgent = new AutoHealAgent();
