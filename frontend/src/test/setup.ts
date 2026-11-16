import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  // Saved creator voices and the last voice live in localStorage (issue #98): start every test clean.
  try {
    window.localStorage.clear();
  } catch {
    // no storage in this environment
  }
});
