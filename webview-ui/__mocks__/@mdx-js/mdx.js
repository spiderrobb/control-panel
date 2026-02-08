// Mock for @mdx-js/mdx
import React from 'react';

export const compile = jest.fn().mockResolvedValue({
  default: () => null,
});

export const run = jest.fn();

// evaluate is the main function used by App.jsx
export const evaluate = jest.fn().mockResolvedValue({
  default: () => React.createElement('div', null, 'Compiled MDX Content'),
});
