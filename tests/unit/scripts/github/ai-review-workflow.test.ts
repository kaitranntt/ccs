import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('PR-Agent review lane migration', () => {
  test('keeps ai-review.yml as the PR-Agent workflow on the self-hosted cliproxy runner with trusted PR gating', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/ai-review.yml');
    const prAgentConfigPath = resolvePath('../../../../.pr_agent.toml');

    expect(fs.existsSync(workflowPath)).toBe(true);
    expect(fs.existsSync(prAgentConfigPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const config = fs.readFileSync(prAgentConfigPath, 'utf8');
    const appTokenUsages = workflow.match(/uses: actions\/create-github-app-token@v1/g) ?? [];

    expect(workflow).toContain('name: AI Code Review');
    expect(workflow).toContain('runs-on: [self-hosted, cliproxy]');
    expect(workflow).toContain('uses: qodo-ai/pr-agent');
    expect(appTokenUsages).toHaveLength(2);
    expect(workflow).toContain('OPENAI.API_BASE');
    expect(workflow).toContain("github.event_name == 'pull_request_target' &&");
    expect(workflow).toContain(
      'contains(fromJSON(\'["COLLABORATOR","MEMBER","OWNER"]\'), github.event.pull_request.author_association)'
    );
    expect(workflow).toContain(
      'contains(fromJSON(\'["COLLABORATOR","MEMBER","OWNER"]\'), github.event.issue.author_association)'
    );
    expect(workflow).toContain('github.event.issue.author_association');
    expect(workflow).toContain('OPENAI_KEY');
    expect(workflow).toContain('vars.AI_REVIEW_BASE_URL');
    expect(workflow).toContain('vars.AI_REVIEW_MODEL');
    expect(workflow).toContain('secrets.AI_REVIEW_API_KEY');
    expect(workflow).toContain('github_action_config.auto_review');
    expect(workflow).toContain("github.event.comment.body == '/review'");
    expect(workflow).toContain('github.event.comment.author_association');
    expect(workflow).toContain('ccs-reviewer[bot]');
    expect(workflow).toContain("format('skip-{0}', github.run_id)");
    expect(workflow).toContain("format('dispatch-{0}', github.run_id)");
    expect(workflow).toContain('CCS_REVIEWER_APP_ID');
    expect(workflow).toContain('CCS_REVIEWER_PRIVATE_KEY');
    expect(workflow).toContain('id: pr-agent-app-token');
    expect(workflow).toContain('GITHUB_TOKEN: ${{ steps.pr-agent-app-token.outputs.token }}');
    expect(workflow).not.toContain('GITHUB_TOKEN: ${{ github.token }}');
    expect(workflow).not.toContain('uses: anthropics/claude-code-action@v1');

    expect(config).toContain('[config]');
    expect(config).toContain('git_provider = "github"');
    expect(config).toContain('fallback_models = ["gpt-5.4-mini"]');
    expect(config).toContain('custom_model_max_tokens = 131072');
    expect(config).toContain('require_score_review = true');
    expect(config).toContain('require_estimate_effort_to_review = true');
    expect(config).toContain('require_can_be_split_review = true');
    expect(config).toContain('require_todo_scan = true');
    expect(config).toContain('require_ticket_analysis_review = true');
    expect(config).toContain('num_max_findings = 10');
    expect(config).toContain('final_update_message = true');
    expect(config).toContain('enable_intro_text = true');
    expect(config).toContain('enable_help_text = true');
    expect(config).toContain('[pr_reviewer]');
    expect(config).not.toContain('auto_review = true');
    expect(config).not.toContain('claude-code-action');
  });
});
