#!/usr/bin/env node

/**
 * Manages delegation session persistence for multi-turn conversations
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir } from '../config/config-loader-facade';
import { createLogger } from '../services/logging';

const logger = createLogger('delegation:session-manager');

interface SessionData {
  sessionId: string;
  totalCost?: number;
  cwd?: string;
}

interface TurnData {
  totalCost?: number;
}

interface SessionMetadata {
  sessionId: string;
  profile: string;
  startTime: number;
  lastTurnTime: number;
  totalCost: number;
  turns: number;
  cwd: string;
}

interface SessionsRegistry {
  [key: string]: SessionMetadata;
}

/**
 * Session Manager Class
 */
class SessionManager {
  private readonly sessionsPath: string;

  constructor() {
    this.sessionsPath = path.join(getCcsDir(), 'delegation-sessions.json');
  }

  /**
   * Store new session metadata
   */
  storeSession(profile: string, sessionData: SessionData): void {
    const sessions = this.loadSessions();
    const key = `${profile}:latest`;

    sessions[key] = {
      sessionId: sessionData.sessionId,
      profile,
      startTime: Date.now(),
      lastTurnTime: Date.now(),
      totalCost: sessionData.totalCost || 0,
      turns: 1,
      cwd: sessionData.cwd || process.cwd(),
    };

    this.saveSessions(sessions);

    if (process.env.CCS_DEBUG) {
      console.error(`[i] Stored session: ${sessionData.sessionId} for ${profile}`);
    }
  }

  /**
   * Update session after additional turn
   */
  updateSession(profile: string, sessionId: string, turnData: TurnData): void {
    const sessions = this.loadSessions();
    const key = `${profile}:latest`;

    if (sessions[key]?.sessionId === sessionId) {
      sessions[key].lastTurnTime = Date.now();
      sessions[key].totalCost += turnData.totalCost || 0;
      sessions[key].turns += 1;
      this.saveSessions(sessions);

      if (process.env.CCS_DEBUG) {
        const cost =
          sessions[key].totalCost !== undefined && sessions[key].totalCost !== null
            ? sessions[key].totalCost.toFixed(4)
            : '0.0000';
        console.error(
          `[i] Updated session: ${sessionId}, total: $${cost}, turns: ${sessions[key].turns}`
        );
      }
    }
  }

  /**
   * Get last session for profile
   */
  getLastSession(profile: string): SessionMetadata | null {
    const sessions = this.loadSessions();
    const key = `${profile}:latest`;
    return sessions[key] || null;
  }

  /**
   * Clear all sessions for profile
   */
  clearProfile(profile: string): void {
    const sessions = this.loadSessions();
    const key = `${profile}:latest`;
    delete sessions[key];
    this.saveSessions(sessions);
  }

  /**
   * Clean up expired sessions (>30 days)
   */
  cleanupExpired(): void {
    const sessions = this.loadSessions();
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    let cleaned = 0;
    Object.keys(sessions).forEach((key) => {
      if (now - sessions[key].lastTurnTime > maxAge) {
        delete sessions[key];
        cleaned++;
      }
    });

    if (cleaned > 0) {
      this.saveSessions(sessions);
      if (process.env.CCS_DEBUG) {
        console.error(`[i] Cleaned ${cleaned} expired sessions`);
      }
    }
  }

  /**
   * Load sessions from disk
   */
  private loadSessions(): SessionsRegistry {
    try {
      if (!fs.existsSync(this.sessionsPath)) {
        return {};
      }
      const content = fs.readFileSync(this.sessionsPath, 'utf8');
      return JSON.parse(content) as SessionsRegistry;
    } catch (error) {
      logger.warn('session.load.failed', 'Failed to load delegation sessions', {
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      });
      return {};
    }
  }

  /**
   * Save sessions to disk
   */
  private saveSessions(sessions: SessionsRegistry): void {
    try {
      const dir = path.dirname(this.sessionsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(this.sessionsPath, JSON.stringify(sessions, null, 2), { mode: 0o600 });
    } catch (error) {
      logger.error('session.save.failed', 'Failed to save delegation sessions', {
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      });
    }
  }
}

export { SessionManager };
