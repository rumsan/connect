import { parseAddresses } from './addresses';

describe('parseAddresses', () => {
  it('splits on newlines, commas and semicolons', () => {
    expect(parseAddresses('a@x.org\nb@x.org, c@x.org; d@x.org')).toEqual([
      'a@x.org',
      'b@x.org',
      'c@x.org',
      'd@x.org',
    ]);
  });

  it('trims whitespace and drops blank entries', () => {
    expect(parseAddresses('  +9779800000000 ,,\n\n  ops@x.org  ')).toEqual([
      '+9779800000000',
      'ops@x.org',
    ]);
  });

  it('removes duplicates so nobody is charged twice', () => {
    expect(parseAddresses('a@x.org\na@x.org\nb@x.org')).toEqual(['a@x.org', 'b@x.org']);
  });

  it('returns an empty list for empty input', () => {
    expect(parseAddresses('   \n  ')).toEqual([]);
  });
});
