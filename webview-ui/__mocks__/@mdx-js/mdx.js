// Mock for @mdx-js/mdx compile function
export const compile = jest.fn().mockResolvedValue({
  default: () => null,
});

export const run = jest.fn();
export const evaluate = jest.fn();
