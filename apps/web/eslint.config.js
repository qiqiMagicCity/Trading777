import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "react/prop-types": "off",
    },
  },
  {
    files: ["app/lib/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
  {
    files: [
      "app/**/__tests__/**/*.{ts,tsx}",
      "app/lib/__tests__/**/*.{ts,tsx}",
      "app/modules/__tests__/**/*.{ts,tsx}",
      "tests/**/__tests__/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      "react/prop-types": "off",
    },
  },
  {
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "result", property: "M5_1", message: "Use normalizeMetrics(...).M5.behavior" },
        { object: "result", property: "M5_2", message: "Use normalizeMetrics(...).M5.fifo" },
      ],
    },
  },
];
