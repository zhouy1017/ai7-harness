import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Repository tooling is plain JavaScript.
import { activeMarkdown, checkDocuments, linkDestinations, localTarget, readTrackedDocument } from '../../tools/check-docs.mjs';

describe('active documentation integrity', () => {
  it('reads only tracked active Markdown, never archive or non-document payloads', async () => {
    const paths = ['AGENTS.md', 'CLAUDE.md', 'docs/guide.md', 'docs/archive/old.md', 'SampleBooks/sample1.docx', 'SampleBooks/book.md', 'local.key.txt'];
    const reads: string[] = [];
    const findings = await checkDocuments(paths, async (path: string) => {
      reads.push(path);
      return path === 'CLAUDE.md' ? '@AGENTS.md\n' : '[history](archive/old.md)';
    });
    expect(activeMarkdown(paths)).toEqual(['AGENTS.md', 'CLAUDE.md', 'docs/guide.md']);
    expect(reads).toEqual(activeMarkdown(paths));
    expect(findings).toEqual([{ source: 'AGENTS.md', line: 1, reason: 'missing-tracked-target', target: 'archive/old.md' }]);
  });

  it('accepts local files, directories, encoded paths and external links but rejects case drift and missing files', async () => {
    const documents = new Map([
      ['AGENTS.md', '[guide](docs/guide.md)'], ['CLAUDE.md', '@AGENTS.md\r\n'],
      ['docs/guide.md', '[root](../AGENTS.md#entry)\n[folder](../docs/)\n[space](a%20b.md)\n[web](https://example.test/unknown)\n[wrong](../agents.md)\n[missing](lost.md)'],
      ['docs/a b.md', ''],
    ]);
    expect(await checkDocuments([...documents.keys()], async (path: string) => documents.get(path))).toEqual([
      { source: 'docs/guide.md', line: 5, reason: 'missing-tracked-target', target: 'agents.md' },
      { source: 'docs/guide.md', line: 6, reason: 'missing-tracked-target', target: 'docs/lost.md' },
    ]);
  });

  it('checks image links and reference definitions while ignoring code and comments', () => {
    const markdown = '```md\n[example](absent.md)\n```\n`[code](absent.md)`\n<!-- [hidden](absent.md) -->\n![image](images/one.png)\n[manual]: <manual (draft).md> "Guide"\n[read](manual(draft).md)';
    expect(linkDestinations(markdown)).toEqual([
      { target: 'images/one.png', line: 6 },
      { target: 'manual (draft).md', line: 7 },
      { target: 'manual(draft).md', line: 8 },
    ]);
    expect(localTarget('docs/readme.md', '#local')).toBeNull();
    expect(() => localTarget('README.md', '../outside.md')).toThrow('outside-repository');
    expect(() => localTarget('README.md', '%zz')).toThrow('invalid-url-encoding');
  });

  it('rejects wrapper drift and absent entry points', async () => {
    expect(await checkDocuments(['CLAUDE.md'], async () => '@README.md\n')).toEqual([
      { source: 'CLAUDE.md', line: 1, reason: 'wrapper-must-be-@AGENTS.md' },
      { source: 'AGENTS.md', line: 1, reason: 'missing-root-router' },
    ]);
  });

  it('keeps code delimiters and comment markers from hiding active links or checking literal examples', () => {
    expect(linkDestinations([
      '`example', '[literal](absent.md)', '`',
      '`<!--`', '[active](missing.md)', '<!-- end -->',
      '``literal ` [example](absent.md)``',
      '```md', '<!--', '```', '[after fence](also-missing.md)',
      '\\[escaped](absent.md)',
      '<a HREF = "manual.md">manual</a>',
      '<img src = \'image.png\'>',
    ].join('\n'))).toEqual([
      { target: 'missing.md', line: 5 },
      { target: 'also-missing.md', line: 11 },
      { target: 'manual.md', line: 13 },
      { target: 'image.png', line: 14 },
    ]);
  });

  it('reports unreadable tracked documents without exposing read errors', async () => {
    expect(await checkDocuments(['AGENTS.md', 'CLAUDE.md'], async (path: string) => {
      if (path === 'AGENTS.md') throw new Error('external path must not be logged');
      return '@AGENTS.md\n';
    })).toEqual([{ source: 'AGENTS.md', line: 1, reason: 'unreadable-document' }]);
  });

  it('refuses a directory link before reading document contents through it', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'ai7-docs-check-'));
    try {
      await mkdir(join(scratch, 'real'));
      await writeFile(join(scratch, 'real', 'guide.md'), 'public synthetic document');
      await symlink(join(scratch, 'real'), join(scratch, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
      await expect(readTrackedDocument(scratch, 'real/guide.md')).resolves.toBe('public synthetic document');
      await expect(readTrackedDocument(scratch, 'linked/guide.md')).rejects.toThrow('non-regular-document');
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
