import type { Comment, Delivery, LogEntry } from '../api.js';

export type Tag = { text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' };

const PRIVATE_REPLY_USED: Tag = { text: 'private reply used', tone: 'ok' };

const payloadString = (payload: Record<string, unknown>, key: string): string | undefined => {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
};

const requestOf = (payload: Record<string, unknown>): Record<string, unknown> =>
  typeof payload.request === 'object' && payload.request !== null
    ? (payload.request as Record<string, unknown>)
    : {};

export const annotate = (comment: Comment, log: LogEntry[], deliveries: Delivery[]): Tag[] => {
  const tags: Tag[] = comment.private_reply_sent ? [PRIVATE_REPLY_USED] : [];
  for (const entry of log) {
    if (
      entry.direction === 'to_service' &&
      payloadString(entry.payload, 'commentId') === comment.id
    ) {
      if (entry.result_code === 'DROPPED') {
        tags.push({ text: 'dropped', tone: 'warn' });
        continue;
      }
      if (entry.result_code === 'DUPLICATED') {
        tags.push({ text: 'duplicate', tone: 'warn' });
      }
      const eventId = payloadString(entry.payload, 'eventId');
      const attempts = deliveries.filter((delivery) => delivery.event_id === eventId);
      if (attempts.some((delivery) => delivery.status === 'delivered')) {
        tags.push({ text: 'delivered', tone: 'ok' });
      } else if (attempts.length > 0) {
        tags.push({ text: `delivery failed (${attempts.length} attempts)`, tone: 'danger' });
      } else {
        tags.push({ text: 'delivering…', tone: 'muted' });
      }
    }
    if (entry.direction === 'from_service' && entry.kind === 'reply') {
      const request = requestOf(entry.payload);
      if (request.commentId !== comment.id) {
        continue;
      }
      if (entry.result_code !== 'OK') {
        tags.push({ text: `refused ${entry.result_code}`, tone: 'danger' });
      } else if (request.visibility !== 'private') {
        tags.push({ text: 'public reply', tone: 'ok' });
      } else if (!tags.includes(PRIVATE_REPLY_USED)) {
        tags.push(PRIVATE_REPLY_USED);
      }
    }
  }
  return tags;
};
