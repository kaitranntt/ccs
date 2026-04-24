import { describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';
import { CodexTopLevelControlsCard } from '@/components/compatible-cli/codex-top-level-controls-card';

describe('CodexTopLevelControlsCard', () => {
  it('submits only changed fields so untouched unsupported values are preserved upstream', async () => {
    const onSave = vi.fn();

    render(
      <CodexTopLevelControlsCard
        values={{
          model: null,
          modelReasoningEffort: null,
          modelContextWindow: null,
          modelAutoCompactTokenLimit: null,
          modelProvider: null,
          approvalPolicy: null,
          sandboxMode: null,
          webSearch: null,
          toolOutputTokenLimit: null,
          personality: null,
        }}
        providerNames={[]}
        onSave={onSave}
      />
    );

    const saveButton = screen.getByRole('button', { name: 'Save top-level settings' });
    expect(saveButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('gpt-5.5'), 'gpt-5.5');
    expect(saveButton).toBeEnabled();

    await userEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ model: 'gpt-5.5' });
  });

  it('submits manual long-context overrides without auto-filling defaults', async () => {
    const onSave = vi.fn();

    render(
      <CodexTopLevelControlsCard
        values={{
          model: 'gpt-5.5',
          modelReasoningEffort: null,
          modelContextWindow: null,
          modelAutoCompactTokenLimit: null,
          modelProvider: null,
          approvalPolicy: null,
          sandboxMode: null,
          webSearch: null,
          toolOutputTokenLimit: null,
          personality: null,
        }}
        providerNames={[]}
        onSave={onSave}
      />
    );

    await userEvent.type(screen.getByLabelText('Model context window'), '800000');
    await userEvent.type(screen.getByLabelText('Auto-compact token limit'), '700000');
    await userEvent.click(screen.getByRole('button', { name: 'Save top-level settings' }));

    expect(onSave).toHaveBeenCalledWith({
      modelContextWindow: 800000,
      modelAutoCompactTokenLimit: 700000,
    });
  });

  it('fills draft starter values without saving automatically', async () => {
    const onSave = vi.fn();

    render(
      <CodexTopLevelControlsCard
        values={{
          model: 'gpt-5.5',
          modelReasoningEffort: null,
          modelContextWindow: null,
          modelAutoCompactTokenLimit: null,
          modelProvider: null,
          approvalPolicy: null,
          sandboxMode: null,
          webSearch: null,
          toolOutputTokenLimit: null,
          personality: null,
        }}
        providerNames={[]}
        onSave={onSave}
      />
    );

    expect(screen.getByText('Manual opt-in only')).toBeInTheDocument();
    expect(screen.getByText('1.05M / 1M')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Fill cautious pair' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Model context window')).toHaveValue(800000);
    expect(screen.getByLabelText('Auto-compact token limit')).toHaveValue(700000);
    expect(screen.getByRole('button', { name: 'Save top-level settings' })).toBeEnabled();
  });
});
