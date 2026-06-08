import { buildPlaceholderQrSvg } from './placeholder-qr';

describe('buildPlaceholderQrSvg', () => {
  it('produces a well-formed SVG document', () => {
    const svg = buildPlaceholderQrSvg('QR 1');
    expect(svg.trimStart().startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('embeds the label as visible text and an accessible name', () => {
    const svg = buildPlaceholderQrSvg('QR 3');
    expect(svg).toContain('>QR 3<');
    expect(svg).toContain('aria-label="QR 3"');
  });

  it('escapes XML-significant characters in the label', () => {
    const svg = buildPlaceholderQrSvg('A & B <2>');
    expect(svg).toContain('A &amp; B &lt;2&gt;');
    expect(svg).not.toContain('A & B <2>');
  });

  it('varies output by label', () => {
    expect(buildPlaceholderQrSvg('QR 1')).not.toBe(
      buildPlaceholderQrSvg('QR 2'),
    );
  });
});
