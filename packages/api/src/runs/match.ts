import type { CommentEvent, MessageEvent } from '@comment-automations/gateway-contract';
import type { AutomationId, Definition, VersionId } from '@comment-automations/shared';
import { matchesKeywords } from '@comment-automations/shared';

export type LiveAutomation = {
  id: AutomationId;
  versionId: VersionId;
  definition: Definition;
};

export const selectForComment = (
  event: CommentEvent,
  automations: LiveAutomation[],
): LiveAutomation[] =>
  automations.filter(({ definition }) => {
    const trigger = definition.trigger.comments;
    if (trigger === undefined) {
      return false;
    }
    const postMatches = trigger.posts.kind === 'any' || trigger.posts.postId === event.postId;
    return postMatches && matchesKeywords(event.text, trigger.keywords);
  });

export const selectForMessage = (
  event: MessageEvent,
  automations: LiveAutomation[],
): LiveAutomation[] =>
  automations.filter(({ definition }) => {
    const trigger = definition.trigger.messages;
    return trigger !== undefined && matchesKeywords(event.text, trigger.keywords);
  });
