import { ago, segs, splitRefPath } from './format';

describe('splitRefPath', () => {
  const branches = ['main', 'feature/hourly', 'feature'];

  it('takes the longest branch that fits, since refs can contain slashes', () => {
    expect(splitRefPath('feature/hourly/src/api.ts', branches)).toEqual({ ref: 'feature/hourly', path: 'src/api.ts' });
    expect(splitRefPath('feature/src', branches)).toEqual({ ref: 'feature', path: 'src' });
    expect(splitRefPath('main', branches)).toEqual({ ref: 'main', path: '' });
  });

  it('falls back to the first segment for SHAs and tags', () => {
    expect(splitRefPath('0a1b2c3/docs/readme.md', branches)).toEqual({ ref: '0a1b2c3', path: 'docs/readme.md' });
  });
});

describe('helpers', () => {
  it('builds router segments without empty parts', () => {
    expect(segs('tree', 'feature/x', '', 'src/app')).toEqual(['tree', 'feature', 'x', 'src', 'app']);
  });

  it('says how long ago', () => {
    const now = Date.now() / 1000;
    expect(ago(now - 5)).toBe('just now');
    expect(ago(now - 3 * 86400)).toBe('3 days ago');
    expect(ago(now - 3600)).toBe('1 hour ago');
  });
});
