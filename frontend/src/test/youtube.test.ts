import { describe, it, expect } from 'vitest';
import {
  channelLabel,
  channelUrlFor,
  channelVideosUrl,
  isVideoLink,
  parseChannelInput,
  refOpenUrl,
} from '@/utils/youtube';

const ID = 'UCBJycsmduvYEL83R_U4JriQ';

// Same cases as backend/tests/test_youtube.py, so both sides accept the same input.
describe('parseChannelInput', () => {
  it.each([
    ['https://www.youtube.com/@MKBHD', { kind: 'handle', value: 'mkbhd' }],
    ['youtube.com/@mkbhd/videos', { kind: 'handle', value: 'mkbhd' }],
    ['https://m.youtube.com/@mkbhd/shorts?si=abc', { kind: 'handle', value: 'mkbhd' }],
    ['@mkbhd', { kind: 'handle', value: 'mkbhd' }],
    ['mkbhd', { kind: 'handle', value: 'mkbhd' }],
    ['@vibe.coder-1', { kind: 'handle', value: 'vibe.coder-1' }],
    [`https://www.youtube.com/channel/${ID}`, { kind: 'id', value: ID }],
    [ID, { kind: 'id', value: ID }],
    ['https://www.youtube.com/c/LinusTechTips', { kind: 'c', value: 'LinusTechTips' }],
    ['https://www.youtube.com/user/marquesbrownlee/videos', { kind: 'user', value: 'marquesbrownlee' }],
    ['https://www.youtube.com/watch?v=AAAAAAAAAA1&t=30s', { kind: 'video', value: 'AAAAAAAAAA1' }],
    ['https://youtu.be/AAAAAAAAAA1?si=x', { kind: 'video', value: 'AAAAAAAAAA1' }],
    ['https://www.youtube.com/shorts/BBBBBBBBBB2', { kind: 'video', value: 'BBBBBBBBBB2' }],
    ['https://www.youtube.com/live/AAAAAAAAAA1', { kind: 'video', value: 'AAAAAAAAAA1' }],
  ])('accepts %s', (input, expected) => {
    expect(parseChannelInput(input)).toEqual(expected);
  });

  it.each([
    '',
    '   ',
    '@ab',
    '@' + 'a'.repeat(31),
    '@vibe coder',
    'https://www.youtube.com/',
    'https://www.youtube.com/feed/trending',
    'https://www.youtube.com/results?search_query=x',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/channel/not-an-id',
    'https://evil.com/www.youtube.com/@mkbhd',
    'https://notyoutube.com/@mkbhd',
    'https://youtube.com.evil.com/@mkbhd',
    'javascript://www.youtube.com/@mkbhd',
    'https://instagram.com/mkbhd',
  ])('rejects %j', (input) => {
    expect(parseChannelInput(input)).toBeNull();
  });
});

describe('YouTube links', () => {
  it('builds channel links from a handle or a channel ID', () => {
    expect(channelUrlFor('MKBHD')).toBe('https://www.youtube.com/@mkbhd');
    expect(channelUrlFor(ID)).toBe(`https://www.youtube.com/channel/${ID}`);
    expect(channelVideosUrl('mkbhd')).toBe('https://www.youtube.com/@mkbhd/videos');
    expect(channelLabel('mkbhd')).toBe('@mkbhd');
    expect(channelLabel(ID)).toBe(ID);
  });

  it('opens a channel at its Videos tab and a video link at the video', () => {
    expect(refOpenUrl({ kind: 'handle', value: 'mkbhd' })).toBe('https://www.youtube.com/@mkbhd/videos');
    expect(refOpenUrl({ kind: 'user', value: 'x' })).toBe('https://www.youtube.com/user/x/videos');
    expect(refOpenUrl({ kind: 'video', value: 'AAAAAAAAAA1' })).toBe('https://www.youtube.com/watch?v=AAAAAAAAAA1');
  });

  it('tells a video link from a channel link', () => {
    expect(isVideoLink('https://www.youtube.com/watch?v=AAAAAAAAAA1')).toBe(true);
    expect(isVideoLink('https://www.youtube.com/watch?feature=share&v=AAAAAAAAAA1')).toBe(true);
    expect(isVideoLink('https://www.youtube.com/shorts/BBBBBBBBBB2')).toBe(true);
    expect(isVideoLink('https://youtu.be/AAAAAAAAAA1')).toBe(true);
    expect(isVideoLink('https://www.youtube.com/@mkbhd')).toBe(false);
    expect(isVideoLink('https://www.youtube.com/@mkbhd/videos')).toBe(false);
    expect(isVideoLink('https://evil.com/watch?v=AAAAAAAAAA1')).toBe(false);
  });
});
