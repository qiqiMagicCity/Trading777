/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  moduleNameMapper: {
    '^@/app/(.*)$': '<rootDir>/apps/web/app/$1',
    '^@/(.*)$': '<rootDir>/apps/web/app/$1',
  },
  roots: ['<rootDir>/apps/web/app', '<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'apps/web/tsconfig.json',
    }],
  },
};
