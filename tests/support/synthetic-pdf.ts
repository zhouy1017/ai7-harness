/**
 * A minimal well-formed PDF: a catalog, an empty page tree, a cross-reference table and a trailer.
 * It carries no text object and therefore no manuscript content of any kind — it exists only so a
 * source-only intake has a real fixed-layout file to identify, retain and record.
 *
 * `e2e/run-j01.mjs` writes the same document itself, because a Journey runner is plain ESM and does
 * not import the TypeScript supports.
 */
export function syntheticPdfBytes(): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [] /Count 0 >>',
  ];
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const startXref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
