import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', {}] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/apps/web/app/$1' }
};
export default config;
