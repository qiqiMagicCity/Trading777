/** @type {import('jest').Config} */
const config = {
  rootDir: ".",
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { useESM: true, tsconfig: "<rootDir>/tsconfig.json" }],
    "^.+\\.(js|jsx)$": ["ts-jest", { useESM: true, tsconfig: "<rootDir>/tsconfig.json" }]
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    "^@/app/(.*)$": "<rootDir>/app/$1",
    "^@/(.*)$": "<rootDir>/app/$1"
  },
  transformIgnorePatterns: ["/node_modules/"],
  testMatch: ["**/__tests__/**/*.test.(ts|tsx|js)"],
  verbose: false
};
export default config;
