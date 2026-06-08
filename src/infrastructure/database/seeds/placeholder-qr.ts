/**
 * Generates a placeholder QR asset — a plain bordered square with a centered
 * label (e.g. "QR 1"). This is a technical stand-in so the storage/seed
 * pipeline has a real, valid SVG to upload for each `qr_tool`; it is NOT a real
 * QR code or final artwork. Real QR SVGs replace it later by re-running the
 * seed against updated assets.
 */

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

/** Build a self-contained placeholder SVG carrying the given label. */
export function buildPlaceholderQrSvg(label: string): string {
  const safe = escapeXml(label);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="${safe}">`,
    '  <rect width="256" height="256" fill="#ffffff"/>',
    '  <rect x="16" y="16" width="224" height="224" fill="none" stroke="#000000" stroke-width="8"/>',
    '  <rect x="72" y="72" width="112" height="112" fill="#000000"/>',
    `  <text x="128" y="240" font-family="monospace" font-size="22" text-anchor="middle" fill="#000000">${safe}</text>`,
    '</svg>',
    '',
  ].join('\n');
}
