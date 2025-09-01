module.exports = {
  extends: ["next/core-web-vitals"],
  rules: {
    "no-restricted-properties": ["error",
      { "objectPattern": "result", "property": "M5_1", "message": "Use normalizeMetrics(...).M5.behavior" },
      { "objectPattern": "result", "property": "M5_2", "message": "Use normalizeMetrics(...).M5.fifo" }
    ]
  }
};
