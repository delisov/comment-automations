import type { Comment, Delivery, LogEntry, Message } from '../api.js';

export type Tag = { text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' };

const PRIVATE_REPLY_USED: Tag = { text: 'private reply used', tone: 'ok' };

const payloadString = (payload: Record<string, unknown>, key: string): string | undefined => {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
};

const payloadNumber = (payload: Record<string, unknown>, key: string): number | undefined => {
  const value = payload[key];
  return typeof value === 'number' ? value : undefined;
};

const FAILURE_CODES = ['NETWORK_DROP', 'SERVICE_ERROR'];

const serviceAnswer = (payload: Record<string, unknown>): string => {
  const status = payloadNumber(payload, 'status');
  return status === undefined ? 'service unreachable' : `service answered ${status}`;
};

const deliveryTag = (eventId: string | undefined, log: LogEntry[], deliveries: Delivery[]): Tag => {
  const attempts = deliveries
    .filter((delivery) => delivery.event_id === eventId)
    .map((delivery) => delivery.attempt);
  const delivered = deliveries
    .filter((delivery) => delivery.event_id === eventId && delivery.status === 'delivered')
    .map((delivery) => delivery.attempt);
  if (delivered.length > 0) {
    return { text: `delivered on attempt ${Math.min(...delivered)}`, tone: 'ok' };
  }
  const gaveUp = log.find(
    (entry) =>
      entry.result_code === 'GAVE_UP' && payloadString(entry.payload, 'eventId') === eventId,
  );
  if (gaveUp) {
    return {
      text: `gave up after ${payloadNumber(gaveUp.payload, 'attempts') ?? attempts.length} attempts`,
      tone: 'danger',
    };
  }
  const failure = log
    .filter(
      (entry) =>
        FAILURE_CODES.includes(entry.result_code ?? '') &&
        payloadString(entry.payload, 'eventId') === eventId,
    )
    .reduce<LogEntry | undefined>(
      (latest, entry) =>
        latest === undefined ||
        (payloadNumber(entry.payload, 'attempt') ?? 0) >
          (payloadNumber(latest.payload, 'attempt') ?? 0)
          ? entry
          : latest,
      undefined,
    );
  if (failure?.result_code === 'NETWORK_DROP') {
    return {
      text: `network drop on attempt ${payloadNumber(failure.payload, 'attempt')}, retrying`,
      tone: 'warn',
    };
  }
  if (failure) {
    return { text: `${serviceAnswer(failure.payload)}, retrying`, tone: 'warn' };
  }
  if (attempts.length > 0) {
    return { text: `attempt ${Math.max(...attempts)} failed, retrying`, tone: 'warn' };
  }
  return { text: 'delivering…', tone: 'muted' };
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
      if (entry.result_code === 'DUPLICATED') {
        tags.push({ text: 'duplicate', tone: 'warn' });
      }
      tags.push(deliveryTag(payloadString(entry.payload, 'eventId'), log, deliveries));
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

export const annotateMessage = (message: Message, log: LogEntry[], deliveries: Delivery[]): Tag[] =>
  log
    .filter(
      (entry) =>
        entry.direction === 'to_service' &&
        payloadString(entry.payload, 'messageId') === message.id,
    )
    .flatMap((entry) => [
      ...(entry.result_code === 'DUPLICATED' ? [{ text: 'duplicate', tone: 'warn' } as const] : []),
      deliveryTag(payloadString(entry.payload, 'eventId'), log, deliveries),
    ]);

export const deliveryLogLine = (entry: LogEntry): string | null => {
  const payload = entry.payload;
  if (entry.result_code === 'GAVE_UP') {
    return `gave up after ${payloadNumber(payload, 'attempts')} attempts`;
  }
  if (!FAILURE_CODES.includes(entry.result_code ?? '')) {
    return null;
  }
  const attempt = payloadNumber(payload, 'attempt') ?? 0;
  const cause =
    entry.result_code === 'NETWORK_DROP'
      ? `network drop, ${payloadString(payload, 'shape')}`
      : serviceAnswer(payload);
  const retryInMs = payloadNumber(payload, 'retryInMs');
  const next =
    retryInMs === undefined
      ? 'no further attempt'
      : `attempt ${attempt + 1} at ${new Date(Date.parse(entry.at) + retryInMs).toISOString()} (in ${retryInMs / 1000} s)`;
  return `attempt ${attempt} failed: ${cause}; ${next}`;
};
