import { createRng, shuffle } from './random';

describe('createRng', () => {
  it('returns numbers in [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const n = rng();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('same seed gives the same sequence', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it('different seeds give different sequences', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
});

describe('shuffle', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('keeps the same items', () => {
    const result = shuffle(items, createRng(3));
    expect([...result].sort((a, b) => a - b)).toEqual(items);
  });

  it('does not change the input array', () => {
    const copy = [...items];
    shuffle(items, createRng(3));
    expect(items).toEqual(copy);
  });

  it('same seed gives the same order', () => {
    expect(shuffle(items, createRng(5))).toEqual(shuffle(items, createRng(5)));
  });

  it('actually changes the order', () => {
    expect(shuffle(items, createRng(5))).not.toEqual(items);
  });
});
