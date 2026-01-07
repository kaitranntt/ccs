#!/usr/bin/env bun
/**
 * AI Code Reviewer for CCS CLI
 *
 * Fetches PR diff, calls Claude via CLIProxyAPI, posts review as comment.
 * Runs on self-hosted runner with localhost access to CLIProxyAPI:8317.
 * Posts as ccs-agy-reviewer[bot] via GitHub App token.
 *
 * Usage: bun run scripts/code-reviewer.ts <PR_NUMBER>
 * Env: CLIPROXY_API_KEY, GITHUB_REPOSITORY, GH_TOKEN
 */

import { $ } from 'bun';

// Types
interface PRContext {
  number: number;
  title: string;
  body: string;
  baseRef: string;
  headRef: string;
  files: Array<{ path: string; additions: number; deletions: number }>;
  diff: string;
}

// Config
const MAX_DIFF_LINES = 10000;
const CLIPROXY_URL = process.env.CLIPROXY_URL || 'http://localhost:8317';
const MODEL = process.env.REVIEW_MODEL || 'gemini-claude-opus-4-5-thinking';

// System prompt for code review - new style
const CODE_REVIEWER_SYSTEM_PROMPT = `You are the CCS AGY Code Reviewer, an expert AI assistant reviewing pull requests for the CCS CLI project.

## Review Guidelines
- Focus ONLY on changes in this PR - don't suggest unrelated improvements
- Be concise - no fluff, no excessive praise
- Provide specific file:line references for issues
- Verify claims before making them (check if patterns exist, check actual code)
- Avoid over-engineering suggestions for simple fixes

## Check For
1. **Bugs**: Logic errors, edge cases, null handling, race conditions
2. **Security**: Injection, auth bypass, secrets exposure, data leaks
3. **Performance**: N+1 queries, missing indexes, inefficient algorithms
4. **TypeScript**: Proper typing, no \`any\`, null safety
5. **Consistency**: Similar patterns exist elsewhere that need same fix?

## Output Format
Structure your response EXACTLY like this (no code fences, render as markdown):

## 🔍 Code Review

**Verdict**: [✅ Approve | ✅ Approve with suggestions | ⚠️ Request changes]

### Summary
[1-2 sentences on what the PR does and if it's correct]

### ✅ What's Good
- [Bullet points, 2-4 items max]

### ⚠️ Issues Found
| File:Line | Issue | Severity |
|-----------|-------|----------|
| \`file.ts:123\` | Description | 🔴 High / 🟡 Medium / 🟢 Low |

(If no issues, write "None - LGTM")

### 💡 Suggestions (Optional)
- [Only if truly valuable, max 2 items]

IMPORTANT: Output ONLY the markdown review. No JSON, no code blocks wrapping the review.`;

// Fetch PR context
async function getPRContext(prNumber: number, repo: string): Promise<PRContext> {
  $.throws(true);

  // Get PR metadata
  const prJson =
    await $`gh pr view ${prNumber} --repo ${repo} --json number,title,body,baseRefName,headRefName,files`.text();
  const pr = JSON.parse(prJson);

  // Get diff
  let diff = await $`gh pr diff ${prNumber} --repo ${repo}`.text();

  // Truncate if too large
  const lines = diff.split('\n');
  if (lines.length > MAX_DIFF_LINES) {
    diff = lines.slice(0, MAX_DIFF_LINES).join('\n') + '\n\n[DIFF TRUNCATED - exceeded 10k lines]';
  }

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body || '',
    baseRef: pr.baseRefName,
    headRef: pr.headRefName,
    files: pr.files || [],
    diff,
  };
}

// Call Claude via CLIProxyAPI
async function callClaude(context: PRContext, repo: string): Promise<string> {
  const apiKey = process.env.CLIPROXY_API_KEY;
  if (!apiKey) throw new Error('CLIPROXY_API_KEY not set');

  const userMessage = `REPO: ${repo}
PR NUMBER: ${context.number}

## Pull Request: ${context.title}

### Description
${context.body || '(No description provided)'}

### Changed Files
${context.files.map((f) => `- ${f.path} (+${f.additions}/-${f.deletions})`).join('\n')}

### Diff
\`\`\`diff
${context.diff}
\`\`\`

Review this PR following the guidelines. Refer to the project's CLAUDE.md and docs/ folder for conventions.`;

  const response = await fetch(`${CLIPROXY_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: CODE_REVIEWER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CLIProxyAPI error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as { content: Array<{ text: string }> };
  const content = data.content[0]?.text;

  if (!content) {
    throw new Error('Empty response from Claude');
  }

  return content;
}

// Post review as PR comment
async function postReview(prNumber: number, repo: string, reviewContent: string): Promise<void> {
  // Use gh pr comment to post the review
  await $`gh pr comment ${prNumber} --repo ${repo} --body ${reviewContent}`;
}

// Check if already reviewed this PR (avoid spam)
async function hasRecentReview(prNumber: number, repo: string): Promise<boolean> {
  try {
    const comments =
      await $`gh api repos/${repo}/issues/${prNumber}/comments --jq '[.[] | select(.body | contains("🔍 Code Review"))] | length'`.text();
    return parseInt(comments.trim(), 10) > 0;
  } catch {
    return false;
  }
}

// Main
async function main() {
  const prNumber = parseInt(process.argv[2], 10);
  const repo = process.env.GITHUB_REPOSITORY || 'kaitranntt/ccs';
  const forceReview = process.argv.includes('--force');

  if (!prNumber || isNaN(prNumber)) {
    console.error('Usage: bun run scripts/code-reviewer.ts <PR_NUMBER> [--force]');
    process.exit(1);
  }

  console.log(`[i] Reviewing PR #${prNumber} in ${repo}`);

  try {
    // Check for existing review (avoid spam)
    if (!forceReview && (await hasRecentReview(prNumber, repo))) {
      console.log('[i] Already reviewed this PR. Use --force to review again.');
      process.exit(0);
    }

    // 1. Get PR context
    console.log('[i] Fetching PR context...');
    const context = await getPRContext(prNumber, repo);
    console.log(`[i] PR: "${context.title}" (${context.files.length} files changed)`);

    const diffLines = context.diff.split('\n').length;
    if (diffLines > MAX_DIFF_LINES) {
      console.log(`[!] Diff too large (${diffLines} lines), truncated to ${MAX_DIFF_LINES}`);
    }

    // 2. Call Claude
    console.log(`[i] Calling Claude (${MODEL}) for review...`);
    const reviewContent = await callClaude(context, repo);
    console.log('[i] Review generated');

    // 3. Post review as comment
    console.log('[i] Posting review to PR...');
    await postReview(prNumber, repo, reviewContent);
    console.log('[OK] Review posted successfully');
  } catch (error) {
    console.error('[X] Review failed:', error);
    process.exit(1);
  }
}

main();
