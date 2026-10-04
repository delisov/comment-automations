import type { Step, Trigger } from '@comment-automations/shared';
import { capabilities } from '@comment-automations/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCapabilities } from '../capabilities.js';
import { StepPalette } from './StepPalette.js';

afterEach(cleanup);

const trigger: Trigger = {
  comments: { posts: { kind: 'any' }, keywords: ['pricing'] },
  onRepeatWhileWaiting: 'supersede',
};

const firstMessage: Step = { kind: 'send_message', text: 'Hey', buttons: [] };

const wait: Step = {
  kind: 'wait_for_reply',
  expect: 'email',
  giveUpHours: 72,
  nudge: { text: '', then: 'wait' },
};

const openPalette = (platform: 'instagram' | 'youtube' | 'bluesky', steps: Step[]) => {
  const caps = deriveCapabilities(capabilities[platform]);
  render(<StepPalette caps={caps} trigger={trigger} steps={steps} onPick={vi.fn()} />);
  fireEvent.click(screen.getByText('+ Add step'));
  return screen.getAllByRole('menuitem').map((item) => item.querySelector('b')?.textContent);
};

describe('step palette', () => {
  it('offers Instagram a reply, a wait and a webhook after the first message', () => {
    expect(openPalette('instagram', [firstMessage])).toEqual([
      'Reply to the comment',
      'Wait for a reply',
      'Send to a webhook',
    ]);
  });

  it('offers YouTube replies and webhooks only', () => {
    expect(openPalette('youtube', [])).toEqual(['Reply to the comment', 'Send to a webhook']);
  });

  it('offers Bluesky every kind after the first message', () => {
    expect(openPalette('bluesky', [firstMessage])).toEqual([
      'Reply to the comment',
      'Send a message',
      'Wait for a reply',
      'Send to a webhook',
    ]);
  });

  it('describes the message step with the platform button limit', () => {
    openPalette('bluesky', []);
    expect(screen.getByText('Direct message with text')).not.toBeNull();
    cleanup();
    openPalette('instagram', [firstMessage, wait]);
    expect(screen.getByText('Direct message with text and up to 3 buttons')).not.toBeNull();
  });

  it('describes the Instagram message before any wait as the private reply to the comment', () => {
    openPalette('instagram', []);
    expect(screen.getByText('Private reply to the comment with text')).not.toBeNull();
  });

  describe('placement', () => {
    const placeMenu = (buttonTop: number, menuHeight: number) => {
      vi.stubGlobal('innerHeight', 800);
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const isMenu = this.getAttribute('role') === 'menu';
        const top = isMenu ? 0 : buttonTop;
        const height = isMenu ? menuHeight : 44;
        return new DOMRect(0, top, 300, height);
      });
      openPalette('bluesky', [firstMessage]);
      return { menu: screen.getByRole('menu'), scrollIntoView };
    };

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('opens upward from the button top when the viewport has no room below', () => {
      const { menu, scrollIntoView } = placeMenu(700, 220);
      expect(menu.style.top).toBe('auto');
      expect(menu.style.bottom).toBe('calc(100% + 6px)');
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('opens downward and scrolls the menu into view when there is room below', () => {
      const { menu, scrollIntoView } = placeMenu(100, 220);
      expect(menu.style.top).toBe('');
      expect(menu.style.bottom).toBe('');
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    });

    it('opens downward when neither side fits the menu but below is larger', () => {
      const { menu, scrollIntoView } = placeMenu(300, 700);
      expect(menu.style.top).toBe('');
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    });
  });
});
