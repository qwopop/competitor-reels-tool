import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReelsLinkPage } from '@/pages/ReelsLinkPage';

function setup() {
  const user = userEvent.setup();
  render(<ReelsLinkPage />);
  return { user, input: screen.getByLabelText(/instagram username/i) };
}

describe('ReelsLinkPage', () => {
  it.each([
    ['durov', 'durov'],
    ['@Nick_Saraev', 'nick_saraev'],
    ['  @@durov  ', null],
    ['https://www.instagram.com/nick_saraev/', 'nick_saraev'],
    ['instagram.com/nick_saraev/reels/', 'nick_saraev'],
  ])('turns %j into a Reels link', async (typed, expected) => {
    const { user, input } = setup();
    await user.type(input, typed);
    await user.click(screen.getByRole('button', { name: /generate link/i }));
    if (expected === null) {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      return;
    }
    const link = screen.getByRole('link', { name: new RegExp(`watch reels @${expected}`, 'i') });
    expect(link).toHaveAttribute('href', `https://www.instagram.com/${expected}/reels/`);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('asks for a username when the field is empty', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /generate link/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/enter a username/i);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('rejects a post link and hides the previous result', async () => {
    const { user, input } = setup();
    await user.type(input, 'durov');
    await user.click(screen.getByRole('button', { name: /generate link/i }));
    await user.clear(input);
    await user.type(input, 'https://www.instagram.com/reel/DfMPGCguhRQ/');
    await user.click(screen.getByRole('button', { name: /generate link/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/not a valid/i);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
