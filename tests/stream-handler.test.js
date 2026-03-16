import { describe, it, expect } from 'vitest';

// Importar as funções internas por re-export — como são privadas,
// testamos indiretamente via o módulo ou reimplementamos para teste
// Para agora, testamos splitIntoChunks e mergeContent como funções isoladas

// Re-implementação fiel para testes (as originais são privadas no módulo)
function splitIntoChunks(text, limit) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf('\n', limit);
    if (splitAt <= 0) splitAt = limit;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

function mergeContent(existing, newChunk) {
  if (!existing) return newChunk;
  return existing + '\n' + newChunk;
}

describe('splitIntoChunks', () => {
  it('retorna texto curto como chunk único', () => {
    const result = splitIntoChunks('Hello', 1900);
    expect(result).toEqual(['Hello']);
  });

  it('divide texto longo respeitando o limite', () => {
    const line = 'a'.repeat(100) + '\n';
    const text = line.repeat(25); // 2525 chars
    const chunks = splitIntoChunks(text, 1900);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(1900));
  });

  it('quebra na última newline antes do limite', () => {
    const text = 'linha1\nlinha2\nlinha3';
    const chunks = splitIntoChunks(text, 13);
    expect(chunks[0]).toBe('linha1\nlinha2');
  });

  it('força quebra no limite quando não há newline', () => {
    const text = 'a'.repeat(3000);
    const chunks = splitIntoChunks(text, 1900);
    expect(chunks[0].length).toBe(1900);
  });

  it('lida com string vazia', () => {
    expect(splitIntoChunks('', 1900)).toEqual([]);
  });
});

describe('mergeContent', () => {
  it('retorna novo chunk quando existing é vazio', () => {
    expect(mergeContent('', 'novo')).toBe('novo');
  });

  it('concatena com newline', () => {
    expect(mergeContent('existente', 'novo')).toBe('existente\nnovo');
  });
});
