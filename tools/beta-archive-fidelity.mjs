/** Inspect the ordinary delivery ZIP format without exporting or changing records. */
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';

export function inspectDeliveryArchive(bytes) {
 const sha256=value=>createHash('sha256').update(value).digest('hex');
 const files=unzipSync(bytes),names=Object.keys(files);
 if(names.some(n=>/^(?:\/|[A-Za-z]:)|(?:^|\/)\.\.(?:\/|$)|\\/.test(n)))throw Error('archive-member-path');
 if(!files['交付包清单.md']||!files['checksums.txt']||!names.some(n=>n.endsWith('.docx')))throw Error('archive-required-members');
 const manifest=strFromU8(files['交付包清单.md']);
 const contentDigest=/^- 内容摘要：([a-f0-9]{64})$/m.exec(manifest)?.[1];
 if(!contentDigest||!['## 包含','## 不包含','## 说明'].every(h=>manifest.includes(h)))throw Error('archive-manifest');
 const lines=strFromU8(files['checksums.txt']).trimEnd().split('\n');
 const checksums=lines.map(line=>{const match=/^([a-f0-9]{64})  (.+)$/.exec(line);if(!match)throw Error('archive-checksum-line');return {sha256:match[1],path:match[2]};});
 if(new Set(checksums.map(c=>c.path)).size!==checksums.length||checksums.length!==names.length-1||checksums.some(c=>c.path==='checksums.txt'||!files[c.path]||sha256(files[c.path])!==c.sha256))throw Error('archive-checksums');
 return {sha256:sha256(bytes),byteLength:bytes.length,contentDigest,manifest,
  members:names.map(path=>({path,sha256:sha256(files[path]),byteLength:files[path].length}))};
}
