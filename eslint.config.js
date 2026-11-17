/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['lib/allocate.js', 'lib/allocate.test.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'LogicalExpression[operator="||"][left.callee.name="parseFloat"]',
          message:
            'Do not use parseFloat(x) || 0. It keeps negatives and treats 0 as missing. Use parseNonNegativeNumber() from lib/allocate.js.',
        },
        {
          selector:
            'CallExpression[callee.property.name="toFixed"]',
          message:
            'Do not format shares with toFixed() one item at a time; they will not always sum to the total. Use allocateProportional() + formatShare().',
        },
      ],
    },
  },
];
