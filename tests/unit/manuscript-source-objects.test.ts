import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readSourceObjects } from '../../src/service/manuscript/source-objects.js';
import { buildSyntheticDocx } from '../support/synthetic-docx.js';

// Container tests use authored tokens: no manuscript semantics or external image fetch is involved.
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const archive = (target: string, mode = '') => buildSyntheticDocx({ extraEntries: {
  'word/document.xml': strToU8(`<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r><w:del><w:r><w:delText>old</w:delText></w:r></w:del><w:ins><w:r><w:t>new</w:t></w:r></w:ins></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p></w:body></w:document>`),
  'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/image" Target="${target}" ${mode}/></Relationships>`),
  'word/media/object.svg': strToU8('<svg xmlns="http://www.w3.org/2000/svg"><script>throw 1</script></svg>'),
} });

describe('read-only source object projection', () => {
  it('uses the selected Word reading for table text', () => {
    expect(readSourceObjects(archive('media/object.svg')).tables[0]!.rows).toEqual([['cellold']]);
    expect(readSourceObjects(archive('media/object.svg'), 'accepted').tables[0]!.rows).toEqual([['cellnew']]);
  });
  it.each([['https://example.invalid/image.png', 'TargetMode="External"'], ['../../outside.png', ''], ['media/object.svg', '']])(
    'keeps %s as a source-only image without an executable or external preview', (target, mode) => {
      const image = readSourceObjects(archive(target, mode)).images[0]!;
      expect(image.preview.dataUrl).toBeNull();
      expect(image.media).toBeUndefined();
    });
});
