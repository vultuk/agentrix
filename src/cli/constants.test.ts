import os from 'node:os';
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { getConfigFilePath, CONFIG_DIR_NAME, CONFIG_FILE_NAME } from './constants.js';

describe('CLI constants', () => {
  it('computes config file path inside user home directory', () => {
    const homedirMock = mock.method(os, 'homedir', () => '/home/test');
    try {
      const expected = `/home/test/${CONFIG_DIR_NAME}/${CONFIG_FILE_NAME}`;
      assert.equal(getConfigFilePath(), expected);
    } finally {
      homedirMock.mock.restore();
    }
  });

  it('returns null when homedir is unavailable', () => {
    const homedirMock = mock.method(os, 'homedir', () => '');
    try {
      assert.equal(getConfigFilePath(), null);
    } finally {
      homedirMock.mock.restore();
    }
  });
});

