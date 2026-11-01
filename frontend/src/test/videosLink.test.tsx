import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideosLinkPage } from '@/pages/VideosLinkPage';

function setup() {
  const user = userEvent.setup();
  render(<VideosLinkPage />);
  return { user, input: screen.getByLabelText(/instagram username/i) };
}

describe('VideosLinkPage', () => {
  it.each([
    ['durov', 'durov'],
    ['@Nick_Saraev', 'nick_saraev'],
    ['  @@durov  ', null],
    ['https://www.instagram.com/nick_saraev/', 'nick_saraev'],
    ['instagram.com/nick_saraev/videos/', 'nick_saraev'],
  ])('turns %j into a Videos link', async (typed, expected) => {
    const { user, input } = setup();
    await user.type(input, typed);
    await user.click(screen.getByRole('button', { name: /generate link/i }));
    if (expected === null) {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      return;
    }
    const link = screen.getByRole('link', { name: new RegExp(`watch videos @${expected}`, 'i') });
    expect(link).toHaveAttribute('href', `https://www.instagram.com/${expected}/videos/`);
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
    await user.type(input, 'https://www.instagram.com/video/DfMPGCguhRQ/');
    await user.click(screen.getByRole('button', { name: /generate link/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/not a valid/i);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
