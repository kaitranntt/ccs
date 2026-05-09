import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileCreateDialog } from '@/components/profiles/profile-create-dialog';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';

const mutateAsync = vi.fn();

vi.mock('@/hooks/use-profiles', () => ({
  useCreateProfile: () => ({
    mutateAsync,
    isPending: false,
  }),
  useCreateCliproxyBridgeProfile: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/hooks/use-openrouter-models', () => ({
  useOpenRouterCatalog: () => ({
    models: [],
  }),
}));

vi.mock('@/hooks/use-cliproxy', () => ({
  useCliproxyAuth: () => ({
    data: { authStatus: [] },
  }),
}));

describe('ProfileCreateDialog', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
  });

  it('keeps More Presets visible by default and deselects custom after choosing a template', async () => {
    render(
      <ProfileCreateDialog
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        initialMode="openrouter"
      />
    );

    expect(screen.getByText('Featured Providers')).toBeInTheDocument();
    expect(screen.getByText('More Presets')).toBeInTheDocument();
    expect(screen.getByText('Local runtimes')).toBeInTheDocument();
    expect(screen.getByText('Alibaba Coding Plan')).toBeVisible();
    expect(screen.getByText('Hugging Face')).toBeVisible();
    expect(document.body.querySelectorAll('.overflow-x-auto')).toHaveLength(2);

    const customButton = screen.getByRole('button', { name: /Custom Endpoint/i });
    await userEvent.click(customButton);

    const glmButton = screen.getByText('GLM').closest('button');
    expect(glmButton).not.toBeNull();
    if (!glmButton) {
      throw new Error('GLM preset button not found');
    }
    await userEvent.click(glmButton);

    await waitFor(() => {
      expect(customButton).not.toHaveClass('border-primary');
    });
    expect(glmButton).toHaveClass('border-primary');
  });

  it('supports opening directly into the Ollama preset from the providers landing page', async () => {
    render(
      <ProfileCreateDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} initialMode="ollama" />
    );

    expect(screen.getByDisplayValue('ollama')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://localhost:11434')).toBeInTheDocument();
    expect(screen.getByText('Local runtimes')).toBeInTheDocument();
  });

  it('keeps the provider chooser and form body scrollable while the footer stays visible', () => {
    render(
      <ProfileCreateDialog
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        initialMode="openrouter"
      />
    );

    expect(screen.getByTestId('profile-create-dialog')).toHaveClass(
      'h-[calc(100dvh-2rem)]',
      'overflow-hidden'
    );
    expect(screen.getByTestId('profile-create-provider-chooser')).toHaveClass(
      'max-h-[34dvh]',
      'overflow-y-auto'
    );
    expect(screen.getByTestId('profile-create-tab-scroll')).toHaveClass(
      'flex-1',
      'overflow-y-auto'
    );
    expect(screen.getByTestId('profile-create-footer')).toHaveClass('shrink-0');
  });

  it('steers the Hugging Face preset to the droid target by default', async () => {
    render(
      <ProfileCreateDialog
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        initialMode="openrouter"
      />
    );

    const huggingFaceButton = screen.getByText('Hugging Face').closest('button');
    expect(huggingFaceButton).not.toBeNull();
    if (!huggingFaceButton) {
      throw new Error('Hugging Face preset button not found');
    }

    await userEvent.click(huggingFaceButton);

    expect(screen.getByDisplayValue('hf')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://router.huggingface.co/v1')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent('Factory Droid');
  });
});
