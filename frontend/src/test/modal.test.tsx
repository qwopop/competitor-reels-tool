import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '@/components/Modal';

function Harness({ withAutoFocusField = false }: { withAutoFocusField?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Modal title="Example" onClose={() => setOpen(false)}>
          {withAutoFocusField && <input aria-label="Field" autoFocus />}
          <button>One</button>
          <button>Two</button>
        </Modal>
      )}
    </>
  );
}

describe('Modal keyboard behaviour', () => {
  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('button', { name: 'One' })).toHaveFocus();
  });

  it('keeps Tab inside the dialog and wraps in both directions', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    await user.tab();
    expect(screen.getByRole('button', { name: 'Two' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'One' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Two' })).toHaveFocus();
  });

  it('closes on Escape and gives focus back to the opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('returns focus to the opener even when a field inside the dialog uses autoFocus', async () => {
    const user = userEvent.setup();
    render(<Harness withAutoFocusField />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByLabelText('Field')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('does not steal focus back when the parent re-renders', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });
});
