import { describe, expect, it } from 'vitest';
import { isPlainNavigation, sectionFromHash, sectionHref } from './navigation';
import type { NavSection } from '../types';

describe('page links', () => {
  it.each<NavSection>(['reconciliation', 'daily-view', 'fuel-management', 'operations-stone-crusher', 'reports', 'daily-add'])(
    'restores %s from a copied or newly opened URL', section => {
      expect(sectionFromHash(sectionHref(section))).toBe(section);
    },
  );
  it.each(['', '#/unknown', '#/constructor', '#/%invalid'])('uses a safe default for %s', hash => {
    expect(sectionFromHash(hash)).toBe('dashboard');
  });
  it('handles a normal left click within the app', () => {
    expect(isPlainNavigation({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBe(true);
  });
  it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])(
    'preserves native browser behavior with %s', modifier => {
      expect(isPlainNavigation({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, [modifier]: true })).toBe(false);
    },
  );
  it('preserves middle-click and right-click behavior', () => {
    for (const button of [1, 2]) {
      expect(isPlainNavigation({ button, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBe(false);
    }
  });
});
