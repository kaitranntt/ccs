/**
 * Claude launch argument helpers for first-class Image Analysis.
 *
 * Uses the same prompt injection mode as the user to avoid mixing
 * `--append-system-prompt` and `--append-system-prompt-file` in one request.
 */

import {
  hasExactFlagValue as hasExactClaudeFlagValue,
  splitArgsAtTerminator as splitClaudeArgsAtTerminator,
} from '../claude-tool-args';
import {
  buildSteeringArg,
  hasManagedPromptFileArg,
  PROMPT_FLAG_INLINE,
} from '../prompt-injection-strategy';
import { isClaudeSubcommandInvocation } from '../claude-subcommand-detector';

const IMAGE_ANALYSIS_STEERING_PROMPT = {
  name: 'ccs-prompt-image-analysis-tool',
  content:
    'For local image or PDF files, prefer the CCS MCP tool ImageAnalysis instead of Read. Use Read for text, code, and other plain files. If the user asks a specific question about the visual, pass that question as the focus field when useful. If ImageAnalysis is unavailable or fails, you may fall back to Read.',
};

function ensureImageAnalysisSteeringPrompt(args: string[]): string[] {
  const { optionArgs, trailingArgs } = splitClaudeArgsAtTerminator(args);

  if (
    hasExactClaudeFlagValue(optionArgs, PROMPT_FLAG_INLINE, IMAGE_ANALYSIS_STEERING_PROMPT.content)
  ) {
    return args;
  }

  if (
    hasManagedPromptFileArg({ args: optionArgs, promptName: IMAGE_ANALYSIS_STEERING_PROMPT.name })
  ) {
    return args;
  }

  const steeringArg = buildSteeringArg({
    args: optionArgs,
    promptName: IMAGE_ANALYSIS_STEERING_PROMPT.name,
    promptContent: IMAGE_ANALYSIS_STEERING_PROMPT.content,
  });

  return [...optionArgs, ...steeringArg, ...trailingArgs];
}

export function appendThirdPartyImageAnalysisToolArgs(args: string[]): string[] {
  // Subcommands reject session-only prompt flags. Issue #1218.
  if (isClaudeSubcommandInvocation(args)) return args;
  return ensureImageAnalysisSteeringPrompt(args);
}

export function getImageAnalysisSteeringPrompt(): string {
  return IMAGE_ANALYSIS_STEERING_PROMPT.content;
}
