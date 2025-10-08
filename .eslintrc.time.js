/* 专用时间系统 ESLint 配置（Flat Config） */
const tsParser = require('@typescript-eslint/parser');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: [
      '**/__tests__/**',
      '**/*.test.*',
      '**/*.spec.*',
      'apps/web/public/js/services/priceService.js',
    ],
  },
  {
    files: [
      'apps/**/*.{ts,tsx,js,mjs,cjs}',
      'packages/**/*.{ts,tsx,js,mjs,cjs}',
      'libs/**/*.{ts,tsx,js,mjs,cjs}',
      'server/**/*.{ts,tsx,js,mjs,cjs}',
      'api/**/*.{ts,tsx,js,mjs,cjs}',
      'public/**/*.{ts,tsx,js,mjs,cjs}',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        project: false,
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='slice'][arguments.0.value=0][arguments.1.value=10][callee.object.type='CallExpression'][callee.object.callee.property.name='toISOString']",
          message: '禁止 toISOString().slice(0,10)，请改用纽约口径工具。',
        },
        {
          selector:
            "NewExpression[callee.name='Date'][arguments.0.type='Literal'][arguments.0.value=/^\\\d{4}-\\\d{2}-\\\d{2}$/]",
          message: "禁止 new Date('YYYY-MM-DD')，请使用纽约正午锚点解析。",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='UTC']",
          message: '禁止 Date.UTC(...)，请使用纽约口径工具计算时间。',
        },
      ],
    },
  },
];
