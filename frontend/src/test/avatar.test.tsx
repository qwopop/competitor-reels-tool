import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Avatar } from '@/components/Avatar';
import { sizedAvatarUrl } from '@/utils/youtube';

describe('sizedAvatarUrl', () => {
  it('asks Google for the size that is shown, not 900px', () => {
    expect(sizedAvatarUrl('https://yt3.googleusercontent.com/ytc/AIdro_abc=s900-c-k-c0x00ffffff-no-rj', 96)).toBe(
      'https://yt3.googleusercontent.com/ytc/AIdro_abc=s96-c-k-c0x00ffffff-no-rj'
    );
    expect(sizedAvatarUrl('https://yt3.ggpht.com/abc=s900', 128)).toBe('https://yt3.ggpht.com/abc=s128');
  });

  it('leaves other images alone', () => {
    expect(sizedAvatarUrl('https://picsum.photos/seed/x-avatar/96/96', 96)).toBe('https://picsum.photos/seed/x-avatar/96/96');
    expect(sizedAvatarUrl('not a url', 96)).toBe('not a url');
  });
});

describe('Avatar', () => {
  it('loads a small copy without sending a referrer', () => {
    const { container } = render(
      <Avatar url="https://yt3.googleusercontent.com/a=s900-c-k" name="Marques Brownlee" size={48} />
    );
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', 'https://yt3.googleusercontent.com/a=s96-c-k');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('shows the channel initial when the image fails or is missing', () => {
    const { container } = render(<Avatar url="https://yt3.ggpht.com/broken=s900" name="kuplinovplay" size={64} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('K')).toBeInTheDocument();

    render(<Avatar url="" name="@mkbhd" size={48} />);
    expect(screen.getByText('M')).toBeInTheDocument();
  });
});
