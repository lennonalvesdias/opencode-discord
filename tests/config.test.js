import { describe, it, expect } from 'vitest';
import { validateProjectPath } from '../src/config.js';

describe('validateProjectPath', () => {
  it('rejeita path traversal com ../', () => {
    const result = validateProjectPath('../../../etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('inválido');
  });

  it('aceita nome de projeto simples', () => {
    const result = validateProjectPath('meu-projeto');
    expect(result.valid).toBe(true);
    expect(result.projectPath).toContain('meu-projeto');
  });

  it('rejeita caminhos absolutos fora da base', () => {
    const result = validateProjectPath('/tmp/exploit');
    expect(result.valid).toBe(false);
  });
});
