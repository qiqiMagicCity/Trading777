import baseConfig from './apps/web/jest.config.js';

const unitConfig = {
  ...baseConfig,
  rootDir: './apps/web',
  testMatch: baseConfig.testMatch ?? ['**/?(*.)+(test|spec).[tj]s?(x)'],
  testPathIgnorePatterns: [
    ...(baseConfig.testPathIgnorePatterns ?? ['/node_modules/']),
    '.integration.test.',
    '.integration.spec.',
  ],
};

export default unitConfig;
