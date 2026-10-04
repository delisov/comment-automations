import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar.js';

type ButtonElement = ReactElement<{
  className?: string;
  onClick: () => void;
  children?: ReactNode;
}>;

const buttons = (node: ReactNode): ButtonElement[] => {
  if (Array.isArray(node)) {
    return node.flatMap(buttons);
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  const element = node as ReactElement<{ children?: ReactNode }>;
  const own = element.type === 'button' ? [element as ButtonElement] : [];
  return [...own, ...buttons(element.props.children)];
};

const text = (node: ReactNode): string =>
  Array.isArray(node) ? node.map(text).join('') : typeof node === 'string' ? node : '';

const renderTopBar = (onRestore: () => void) =>
  buttons(
    TopBar({
      platform: 'instagram',
      onPlatform: () => undefined,
      now: '2026-10-04T10:00:00.000Z',
      standNow: '2026-10-04T10:00:00.000Z',
      onClock: () => undefined,
      onShift: () => undefined,
      onRestore,
    }),
  );

const resetButton = (onRestore: () => void) =>
  renderTopBar(onRestore).find((button) => text(button.props.children) === 'Reset')!;

describe('top bar reset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for confirmation with the plain sentence and restores when confirmed', () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('window', { confirm });
    const onRestore = vi.fn();

    resetButton(onRestore).props.onClick();

    expect(confirm.mock.calls).toEqual([
      [
        'Reset the test stand? This deletes all comments and messages and restores the starting accounts, posts and users. Your automations are kept.',
      ],
    ]);
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('does not restore when the confirmation is declined', () => {
    vi.stubGlobal('window', { confirm: () => false });
    const onRestore = vi.fn();

    resetButton(onRestore).props.onClick();

    expect(onRestore).not.toHaveBeenCalled();
  });

  it('keeps the danger styling and renders no Seed button', () => {
    const all = renderTopBar(() => undefined);

    expect(resetButton(() => undefined).props.className).toBe('danger');
    expect(all.map((button) => text(button.props.children))).not.toContain('Seed');
  });
});
