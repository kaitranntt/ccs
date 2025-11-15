#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Resolves working directory for delegated tasks
 * Handles monorepo structures and path hints in prompts
 */
class CwdResolver {
  /**
   * Resolve target working directory from prompt and context
   * @param {string} prompt - User's prompt (may contain path hints)
   * @param {string} currentCwd - Current working directory (absolute)
   * @returns {string} Resolved absolute path for delegation
   */
  static resolve(prompt, currentCwd = process.cwd()) {
    // Ensure current CWD is absolute
    const baseCwd = path.isAbsolute(currentCwd) ? currentCwd : path.resolve(currentCwd);

    // Strategy 1: Look for explicit "in <path>" pattern
    const explicitPathMatch = prompt.match(/\bin\s+([\/\w\-\.]+)/i);
    if (explicitPathMatch) {
      const hintPath = explicitPathMatch[1];
      const resolved = this._resolveHintPath(hintPath, baseCwd);
      if (resolved) {
        return resolved;
      }
    }

    // Strategy 2: Look for file path references
    const filePathMatch = prompt.match(/([\/\w\-\.\/]+\.\w+)/);
    if (filePathMatch) {
      const filePath = filePathMatch[1];
      const resolved = this._resolveFilePath(filePath, baseCwd);
      if (resolved) {
        return path.dirname(resolved);
      }
    }

    // Strategy 3: Look for directory references (packages/, apps/, src/, etc.)
    const dirPatterns = [
      /packages\/([a-z0-9\-]+)/i,
      /apps\/([a-z0-9\-]+)/i,
      /modules\/([a-z0-9\-]+)/i,
      /src\/([a-z0-9\-\/]+)/i,
      /lib\/([a-z0-9\-\/]+)/i
    ];

    for (const pattern of dirPatterns) {
      const match = prompt.match(pattern);
      if (match) {
        const fullMatch = match[0];
        const resolved = this._resolveDirHint(fullMatch, baseCwd);
        if (resolved) {
          return resolved;
        }
      }
    }

    // Default: use current working directory
    return baseCwd;
  }

  /**
   * Resolve path hint to absolute path
   * @param {string} hintPath - Path from prompt hint
   * @param {string} baseCwd - Base working directory
   * @returns {string|null} Resolved absolute path or null
   * @private
   */
  static _resolveHintPath(hintPath, baseCwd) {
    // If already absolute, validate and return
    if (path.isAbsolute(hintPath)) {
      return fs.existsSync(hintPath) ? hintPath : null;
    }

    // Try relative to current CWD
    const relativeToBase = path.resolve(baseCwd, hintPath);
    if (fs.existsSync(relativeToBase)) {
      return relativeToBase;
    }

    // Try from project root (go up until we find package.json or .git)
    const projectRoot = this._findProjectRoot(baseCwd);
    if (projectRoot) {
      const relativeToRoot = path.resolve(projectRoot, hintPath);
      if (fs.existsSync(relativeToRoot)) {
        return relativeToRoot;
      }
    }

    return null;
  }

  /**
   * Resolve file path reference
   * @param {string} filePath - File path from prompt
   * @param {string} baseCwd - Base working directory
   * @returns {string|null} Resolved absolute file path or null
   * @private
   */
  static _resolveFilePath(filePath, baseCwd) {
    // If absolute, validate
    if (path.isAbsolute(filePath)) {
      return fs.existsSync(filePath) ? filePath : null;
    }

    // Try relative to current CWD
    const relativeToBase = path.resolve(baseCwd, filePath);
    if (fs.existsSync(relativeToBase)) {
      return relativeToBase;
    }

    // Try from project root
    const projectRoot = this._findProjectRoot(baseCwd);
    if (projectRoot) {
      const relativeToRoot = path.resolve(projectRoot, filePath);
      if (fs.existsSync(relativeToRoot)) {
        return relativeToRoot;
      }
    }

    return null;
  }

  /**
   * Resolve directory hint (like "packages/app")
   * @param {string} dirHint - Directory hint from prompt
   * @param {string} baseCwd - Base working directory
   * @returns {string|null} Resolved absolute directory or null
   * @private
   */
  static _resolveDirHint(dirHint, baseCwd) {
    // Try from current CWD
    const relativeToBase = path.resolve(baseCwd, dirHint);
    if (fs.existsSync(relativeToBase) && fs.statSync(relativeToBase).isDirectory()) {
      return relativeToBase;
    }

    // Try from project root
    const projectRoot = this._findProjectRoot(baseCwd);
    if (projectRoot) {
      const relativeToRoot = path.resolve(projectRoot, dirHint);
      if (fs.existsSync(relativeToRoot) && fs.statSync(relativeToRoot).isDirectory()) {
        return relativeToRoot;
      }
    }

    return null;
  }

  /**
   * Find project root (directory with package.json or .git)
   * @param {string} startPath - Starting directory
   * @returns {string|null} Project root or null
   * @private
   */
  static _findProjectRoot(startPath) {
    let currentPath = startPath;

    while (currentPath !== path.dirname(currentPath)) {
      // Check for project markers
      const packageJson = path.join(currentPath, 'package.json');
      const gitDir = path.join(currentPath, '.git');

      if (fs.existsSync(packageJson) || fs.existsSync(gitDir)) {
        return currentPath;
      }

      // Move up one directory
      currentPath = path.dirname(currentPath);
    }

    return null;
  }

  /**
   * Validate that resolved path is within allowed boundaries
   * @param {string} resolvedPath - Resolved path to validate
   * @param {string} baseCwd - Base working directory
   * @returns {boolean} True if path is safe
   */
  static validatePath(resolvedPath, baseCwd) {
    // Ensure path exists
    if (!fs.existsSync(resolvedPath)) {
      return false;
    }

    // Find project root
    const projectRoot = this._findProjectRoot(baseCwd);
    if (!projectRoot) {
      // No project root found, only allow within base CWD
      return resolvedPath.startsWith(baseCwd);
    }

    // Allow within project root
    return resolvedPath.startsWith(projectRoot);
  }

  /**
   * Get relative path from project root (for display)
   * @param {string} absolutePath - Absolute path
   * @returns {string} Relative path from project root or absolute if not in project
   */
  static getRelativePath(absolutePath) {
    const projectRoot = this._findProjectRoot(absolutePath);
    if (projectRoot && absolutePath.startsWith(projectRoot)) {
      return path.relative(projectRoot, absolutePath);
    }
    return absolutePath;
  }

  /**
   * Detect if path is in a monorepo structure
   * @param {string} cwdPath - Working directory path
   * @returns {boolean} True if monorepo detected
   */
  static isMonorepo(cwdPath) {
    const monorepoIndicators = [
      'packages/',
      'apps/',
      'libs/',
      'modules/',
      'services/',
      'workspaces/'
    ];

    return monorepoIndicators.some(indicator => cwdPath.includes(indicator));
  }

  /**
   * Get monorepo workspace name (if in monorepo)
   * @param {string} cwdPath - Working directory path
   * @returns {string|null} Workspace name or null
   */
  static getWorkspaceName(cwdPath) {
    const monorepoPatterns = [
      /packages\/([^\/]+)/,
      /apps\/([^\/]+)/,
      /libs\/([^\/]+)/,
      /modules\/([^\/]+)/,
      /services\/([^\/]+)/
    ];

    for (const pattern of monorepoPatterns) {
      const match = cwdPath.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }
}

module.exports = { CwdResolver };
