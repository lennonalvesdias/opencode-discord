import { describe, it, expect, vi } from 'vitest';
import { parseSSEStream } from '../src/sse-parser.js';

/**
 * Cria um mock de Response com um ReadableStream a partir de chunks de texto.
 * @param {string[]} chunks - Pedaços de texto SSE a enviar
 * @returns {Response}
 */
function createMockResponse(chunks) {
  const encoder = new TextEncoder();
  let index = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });

  return { body: stream };
}

describe('parseSSEStream', () => {
  it('parseia evento SSE simples com data JSON', async () => {
    const events = [];
    const response = createMockResponse([
      'data: {"type":"test","value":1}\n\n',
    ]);

    await parseSSEStream(response, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('message');
    expect(events[0].data).toEqual({ type: 'test', value: 1 });
  });

  it('parseia evento com tipo customizado', async () => {
    const events = [];
    const response = createMockResponse([
      'event: session.status\ndata: {"status":"idle"}\n\n',
    ]);

    await parseSSEStream(response, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('session.status');
    expect(events[0].data).toEqual({ status: 'idle' });
  });

  it('parseia múltiplos eventos em sequência', async () => {
    const events = [];
    const response = createMockResponse([
      'data: {"n":1}\n\n',
      'data: {"n":2}\n\ndata: {"n":3}\n\n',
    ]);

    await parseSSEStream(response, (e) => events.push(e));

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.data.n)).toEqual([1, 2, 3]);
  });

  it('lida com data não-JSON (mantém como string)', async () => {
    const events = [];
    const response = createMockResponse([
      'data: texto puro\n\n',
    ]);

    await parseSSEStream(response, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('texto puro');
  });

  it('lida com evento com id', async () => {
    const events = [];
    const response = createMockResponse([
      'id: 42\ndata: {"ok":true}\n\n',
    ]);

    await parseSSEStream(response, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('42');
  });

  it('lida com chunks fragmentados (dados divididos entre chunks)', async () => {
    const events = [];
    const response = createMockResponse([
      'data: {"par',
      'tial":true}\n\n',
    ]);

    await parseSSEStream(response, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ partial: true });
  });

  it('ignora linhas de comentário', async () => {
    const events = [];
    const response = createMockResponse([
      ': this is a comment\ndata: {"ok":true}\n\n',
    ]);

    await parseSSEStream(response, (e) => events.push(e));

    expect(events).toHaveLength(1);
  });

  it('lida com data multiline', async () => {
    const events = [];
    const response = createMockResponse([
      'data: line1\ndata: line2\n\n',
    ]);

    await parseSSEStream(response, (e) => events.push(e));

    expect(events).toHaveLength(1);
    // Multiline data é juntada com \n — como não é JSON válido, retorna string
    expect(events[0].data).toBe('line1\nline2');
  });
});
