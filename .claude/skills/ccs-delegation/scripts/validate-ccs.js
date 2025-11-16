#!/usr/bin/env node

/**
 * Validate CCS installation and profile configuration
 * Usage: node validate-ccs.js [profile]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const profile = process.argv[2] || 'glm';
const homeDir = os.homedir();
const profilePath = path.join(homeDir, '.ccs', 'profiles', profile);
const settingsPath = path.join(profilePath, 'settings.json');

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    return null;
  }
}

function check(name, fn) {
  try {
    const result = fn();
    if (result) {
      console.log(`✓ ${name}`);
      return true;
    } else {
      console.log(`✗ ${name}`);
      return false;
    }
  } catch (error) {
    console.log(`✗ ${name}: ${error.message}`);
    return false;
  }
}

console.log(`\nValidating CCS delegation setup (profile: ${profile})...\n`);

let allPassed = true;

// Check CCS installed
allPassed &= check('CCS CLI installed', () => {
  const version = exec('ccs --version');
  return version && version.trim().length > 0;
});

// Check profile exists
allPassed &= check(`Profile '${profile}' exists`, () => {
  return fs.existsSync(profilePath);
});

// Check settings.json exists
allPassed &= check('settings.json exists', () => {
  return fs.existsSync(settingsPath);
});

// Check API key not placeholder
allPassed &= check('API key configured (not placeholder)', () => {
  if (!fs.existsSync(settingsPath)) return false;
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const apiKey = settings.apiKey || settings.api_key || '';
  return apiKey && !apiKey.includes('YOUR_') && !apiKey.includes('_HERE');
});

// Check CCS doctor
allPassed &= check('CCS doctor reports healthy', () => {
  const output = exec('ccs doctor');
  return output && !output.toLowerCase().includes('error');
});

// Check commands exist
const ccsRoot = process.cwd();
const commandsPath = path.join(ccsRoot, '.claude', 'commands', 'ccs');
allPassed &= check('Slash commands directory exists', () => {
  return fs.existsSync(commandsPath);
});

allPassed &= check('/ccs:glm command exists', () => {
  return fs.existsSync(path.join(commandsPath, 'glm.md'));
});

allPassed &= check('/ccs:kimi command exists', () => {
  return fs.existsSync(path.join(commandsPath, 'kimi.md'));
});

console.log(allPassed ? '\n✓ All checks passed!' : '\n✗ Some checks failed. See above for details.');
process.exit(allPassed ? 0 : 1);
