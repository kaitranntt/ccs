#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Manages delegation session persistence for multi-turn conversations
 */
class SessionManager {
  constructor() {
    this.sessionsPath = path.join(os.homedir(), '.ccs', 'delegation-sessions.json');
  }

  /**
   * Store new session metadata
   * @param {string} profile - Profile name (glm, kimi, etc.)
   * @param {Object} sessionData - Session data
   * @param {string} sessionData.sessionId - Claude session ID
   * @param {number} sessionData.totalCost - Initial cost
   * @param {string} sessionData.cwd - Working directory
   */
  storeSession(profile, sessionData) {
    const sessions = this._loadSessions();
    const key = `${profile}:latest`;

    sessions[key] = {
      sessionId: sessionData.sessionId,
      profile,
      startTime: Date.now(),
      lastTurnTime: Date.now(),
      totalCost: sessionData.totalCost || 0,
      turns: 1,
      cwd: sessionData.cwd || process.cwd()
    };

    this._saveSessions(sessions);

    if (process.env.CCS_DEBUG) {
      console.error(`[i] Stored session: ${sessionData.sessionId} for ${profile}`);
    }
  }

  /**
   * Update session after additional turn
   * @param {string} profile - Profile name
   * @param {string} sessionId - Session ID
   * @param {Object} turnData - Turn data
   * @param {number} turnData.totalCost - Turn cost
   */
  updateSession(profile, sessionId, turnData) {
    const sessions = this._loadSessions();
    const key = `${profile}:latest`;

    if (sessions[key]?.sessionId === sessionId) {
      sessions[key].lastTurnTime = Date.now();
      sessions[key].totalCost += turnData.totalCost || 0;
      sessions[key].turns += 1;
      this._saveSessions(sessions);

      if (process.env.CCS_DEBUG) {
        console.error(`[i] Updated session: ${sessionId}, total: $${sessions[key].totalCost.toFixed(4)}, turns: ${sessions[key].turns}`);
      }
    }
  }

  /**
   * Get last session for profile
   * @param {string} profile - Profile name
   * @returns {Object|null} Session metadata or null
   */
  getLastSession(profile) {
    const sessions = this._loadSessions();
    const key = `${profile}:latest`;
    return sessions[key] || null;
  }

  /**
   * Clear all sessions for profile
   * @param {string} profile - Profile name
   */
  clearProfile(profile) {
    const sessions = this._loadSessions();
    const key = `${profile}:latest`;
    delete sessions[key];
    this._saveSessions(sessions);
  }

  /**
   * Clean up expired sessions (>30 days)
   */
  cleanupExpired() {
    const sessions = this._loadSessions();
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    let cleaned = 0;
    Object.keys(sessions).forEach(key => {
      if (now - sessions[key].lastTurnTime > maxAge) {
        delete sessions[key];
        cleaned++;
      }
    });

    if (cleaned > 0) {
      this._saveSessions(sessions);
      if (process.env.CCS_DEBUG) {
        console.error(`[i] Cleaned ${cleaned} expired sessions`);
      }
    }
  }

  /**
   * Load sessions from disk
   * @returns {Object} Sessions object
   * @private
   */
  _loadSessions() {
    try {
      if (!fs.existsSync(this.sessionsPath)) {
        return {};
      }
      const content = fs.readFileSync(this.sessionsPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (process.env.CCS_DEBUG) {
        console.warn(`[!] Failed to load sessions: ${error.message}`);
      }
      return {};
    }
  }

  /**
   * Save sessions to disk
   * @param {Object} sessions - Sessions object
   * @private
   */
  _saveSessions(sessions) {
    try {
      const dir = path.dirname(this.sessionsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(
        this.sessionsPath,
        JSON.stringify(sessions, null, 2),
        { mode: 0o600 }
      );
    } catch (error) {
      console.error(`[!] Failed to save sessions: ${error.message}`);
    }
  }
}

module.exports = { SessionManager };
