import { describe, expect, it } from 'vitest';

import { ModelFetchError } from '../src/errors.js';
import { isModelPath, modelFileName, resolveModel } from '../src/models.js';

describe('modelFileName', () => {
  it('maps names to ggml file names', () => {
    expect(modelFileName('base-q5_1')).toBe('ggml-base-q5_1.bin');
    expect(modelFileName('large-v3-turbo')).toBe('ggml-large-v3-turbo.bin');
    expect(modelFileName('tiny.en')).toBe('ggml-tiny.en.bin');
  });
});

describe('isModelPath', () => {
  it('treats names as names', () => {
    expect(isModelPath('base')).toBe(false);
    expect(isModelPath('large-v3-turbo-q5_0')).toBe(false);
  });

  it('treats paths and .bin files as paths', () => {
    expect(isModelPath('/models/ggml-base.bin')).toBe(true);
    expect(isModelPath('./ggml-base.bin')).toBe(true);
    expect(isModelPath('my-model.bin')).toBe(true);
  });
});

describe('resolveModel', () => {
  it('rejects missing model file paths without hitting the network', async () => {
    await expect(resolveModel('/definitely/not/here/ggml-x.bin')).rejects.toThrow(ModelFetchError);
  });
});
