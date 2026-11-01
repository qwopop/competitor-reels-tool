import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideosLinkPage } from '@/pages/VideosLinkPage';

function setup() {
  const user = userEvent.setup();
  render(<VideosLinkPage />);
  return { user, input: screen.getByLabelText(/youtube channel/i) };
}

async function generate(typed: string) {
  const { user, input } = setup();
  if (typed) await user.type(input, typed);
  await user.click(screen.getByRole('button', { name: /generate link/i }));
}

describe('VideosLinkPage', () => {
  it.each([
    ['mkbhd', '@mkbhd', 'https://www.youtube.com/@mkbhd'],
    ['@MKBHD', '@mkbhd', 'https://www.youtube.com/@mkbhd'],
    ['https://www.youtube.com/@mkbhd/featured', '@mkbhd', 'https://www.youtube.com/@mkbhd'],
    [
      'https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ',
      'UCBJycsmduvYEL83R_U4JriQ',
      'https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ',
    ],
  ])('turns %j into Videos and Shorts links', async (typed, label, channel) => {
    await generate(typed);
    const videos = screen.getByRole('link', { name: new RegExp(`watch videos ${label}`, 'i') });
    expect(videos).toHaveAttribute('href', `${channel}/videos`);
    expect(videos).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /shorts/i })).toHaveAttribute('href', `${channel}/shorts`);
  });

  it('asks for a channel when the field is empty', async () => {
    await generate('');
    expect(screen.getByRole('alert')).toHaveTextContent(/enter a channel/i);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('explains that a video link is not a channel', async () => {
    await generate('https://youtu.be/AAAAAAAAAA1');
    expect(screen.getByRole('alert')).toHaveTextContent(/video link/i);
  });

  it('rejects something that is not YouTube', async () => {
    await generate('https://instagram.com/mkbhd');
    expect(screen.getByRole('alert')).toHaveTextContent(/not a youtube channel/i);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
