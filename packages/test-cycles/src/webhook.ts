import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type WebhookCall = {
  method: string;
  path: string;
  authorization: string | null;
  body: unknown;
};

export type WebhookReceiver = {
  url: string;
  calls: WebhookCall[];
  status: number;
  close(): Promise<void>;
};

export const startWebhookReceiver = async (
  host: string,
  port: number,
): Promise<WebhookReceiver> => {
  const calls: WebhookCall[] = [];
  const receiver = {
    url: '',
    calls,
    status: 200,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
  const server = http.createServer((request, response) => {
    let text = '';
    request.on('data', (chunk: Buffer) => {
      text += chunk.toString();
    });
    request.on('end', () => {
      calls.push({
        method: request.method ?? '',
        path: request.url ?? '',
        authorization: request.headers.authorization ?? null,
        body: text === '' ? null : JSON.parse(text),
      });
      response.writeHead(receiver.status).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(port, '0.0.0.0', resolve));
  const { port: bound } = server.address() as AddressInfo;
  receiver.url = `http://${host}:${bound}`;
  return receiver;
};
