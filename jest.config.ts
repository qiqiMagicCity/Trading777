import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.spec.ts', '**/app/lib/**/*.(test|spec).ts'],
  transform: { '^.+\\.ts$': ['ts-jest', {}] }
};
export default config;
