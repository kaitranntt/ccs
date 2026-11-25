import { describe, expect, it } from 'bun:test';
import {
  appendThirdPartyImageAnalysisToolArgs,
  getImageAnalysisSteeringPrompt,
} from '../../../../src/utils/image-analysis';

describe('appendThirdPartyImageAnalysisToolArgs', () => {
  it('appends the steering prompt for image analysis', () => {
    const args = appendThirdPartyImageAnalysisToolArgs(['-p', 'describe the screenshot']);

    expect(args).toEqual(['-p', 'describe the screenshot', '--append-system-prompt', getImageAnalysisSteeringPrompt()]);
  });

  it('does not duplicate the steering prompt when already present', () => {
    const steeringPrompt = getImageAnalysisSteeringPrompt();
    const args = appendThirdPartyImageAnalysisToolArgs([
      '-p',
      'describe the screenshot',
      '--append-system-prompt',
      steeringPrompt,
    ]);

    expect(args.filter((arg) => arg === steeringPrompt)).toHaveLength(1);
    expect(args.filter((arg) => arg === '--append-system-prompt')).toHaveLength(1);
  });

  it('preserves trailing arguments after --', () => {
    const args = appendThirdPartyImageAnalysisToolArgs(['-p', 'describe', '--', 'extra']);

    expect(args).toEqual([
      '-p',
      'describe',
      '--append-system-prompt',
      getImageAnalysisSteeringPrompt(),
      '--',
      'extra',
    ]);
  });

  // File mode: --append-system-prompt-file when user passes --append-system-prompt-file

  it('uses --append-system-prompt-file when user passes --append-system-prompt-file', () => {
    const result = appendThirdPartyImageAnalysisToolArgs([
      '-p',
      'describe',
      '--append-system-prompt-file',
      '/tmp/user-prompt.txt',
    ]);

    expect(result).toContain('--append-system-prompt-file');
    expect(result).not.toContain('--append-system-prompt');
    const fileFlags = result.filter((arg) => arg === '--append-system-prompt-file');
    expect(fileFlags.length).toBeGreaterThanOrEqual(2);
  });

  it('uses --append-system-prompt-file when user passes equals form', () => {
    const result = appendThirdPartyImageAnalysisToolArgs([
      '-p',
      'describe',
      '--append-system-prompt-file=/tmp/user-prompt.txt',
    ]);

    expect(result).not.toContain('--append-system-prompt');
    const fileFlags = result.filter(
      (arg) => arg === '--append-system-prompt-file' || arg.startsWith('--append-system-prompt-file=')
    );
    expect(fileFlags.length).toBeGreaterThanOrEqual(2);
  });

  it('does not treat unrelated user prompt files as the managed CCS steering prompt', () => {
    const result = appendThirdPartyImageAnalysisToolArgs([
      '-p',
      'describe',
      '--append-system-prompt-file',
      '/tmp/user-ccs-prompt-image-analysis-tool-notes.txt',
    ]);

    const filePaths = result.filter(
      (_arg, index) => result[index - 1] === '--append-system-prompt-file'
    );
    expect(filePaths).toContain('/tmp/user-ccs-prompt-image-analysis-tool-notes.txt');
    expect(filePaths.some((filePath) => filePath.endsWith('/ccs-prompt-image-analysis-tool.txt'))).toBe(true);
  });
});
