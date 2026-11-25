import { render, screen, userEvent } from '@tests/setup/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@/components/shared/error-boundary';

let shouldThrow = true;

function Bomb() {
  if (shouldThrow) {
    throw new Error('Boom during render');
  }
  return <div>Recovered content</div>;
}

describe('ErrorBoundary', () => {
  it('catches render errors and recovers when Try again is clicked', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    shouldThrow = true;

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Boom during render')).toBeInTheDocument();

    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
