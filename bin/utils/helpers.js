'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// TTY-aware color detection (matches lib/ccs bash logic)
function getColors() {
  const forcedColors = process.env.FORCE_COLOR;
  const noColor = process.env.NO_COLOR;
  const isTTY = process.stdout.isTTY === true;  // Must be explicitly true

  const useColors = forcedColors || (isTTY && !noColor);

  if (useColors) {
    return {
      red: '\x1b[0;31m',
      yellow: '\x1b[1;33m',
      cyan: '\x1b[0;36m',
      green: '\x1b[0;32m',
      bold: '\x1b[1m',
      reset: '\x1b[0m'
    };
  }

  return { red: '', yellow: '', cyan: '', green: '', bold: '', reset: '' };
}


// Colors object (dynamic)
const colors = getColors();

// Helper: Apply color to text (returns plain text if colors disabled)
function colored(text, colorName = 'reset') {
  const currentColors = getColors();
  const color = currentColors[colorName] || '';
  return color ? `${color}${text}${currentColors.reset}` : text;
}

// Simple error formatting
function error(message) {
  console.error(`ERROR: ${message}`);
  console.error('Try: npm install -g @kaitranntt/ccs --force');
  process.exit(1);
}

// Path expansion (~ and env vars)
function expandPath(pathStr) {
  // Handle tilde expansion
  if (pathStr.startsWith('~/') || pathStr.startsWith('~\\')) {
    pathStr = path.join(os.homedir(), pathStr.slice(2));
  }

  // Expand environment variables (Windows and Unix)
  pathStr = pathStr.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || '');
  pathStr = pathStr.replace(/\$([A-Z_][A-Z0-9_]*)/gi, (_, name) => process.env[name] || '');

  // Windows %VAR% style
  if (process.platform === 'win32') {
    pathStr = pathStr.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '');
  }

  return path.normalize(pathStr);
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // Initialize first row and column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find similar strings using fuzzy matching
 * @param {string} target - Target string
 * @param {string[]} candidates - List of candidate strings
 * @param {number} maxDistance - Maximum edit distance (default: 2)
 * @returns {string[]} Similar strings sorted by distance
 */
function findSimilarStrings(target, candidates, maxDistance = 2) {
  const targetLower = target.toLowerCase();

  const matches = candidates
    .map(candidate => ({
      name: candidate,
      distance: levenshteinDistance(targetLower, candidate.toLowerCase())
    }))
    .filter(item => item.distance <= maxDistance && item.distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)  // Show at most 3 suggestions
    .map(item => item.name);

  return matches;
}


module.exports = {
  colors,
  colored,
  error,
  expandPath,
  levenshteinDistance,
  findSimilarStrings
};