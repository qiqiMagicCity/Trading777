import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
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
