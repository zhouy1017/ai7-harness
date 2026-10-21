import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHANNEL_LABELS, channelDescription, dataLocationSyncWarning, packagedLaunchForm, readDistributionChannel, resolveChannel,
  resolvePackagedDataLocation } from '../../src/main/channel.js';
import { storeStartupDataChoice } from '../../src/shared/data-root.js';

let root: string;
let codeRoot: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai7-channel-'));
  codeRoot = join(root, 'AI7', 'app', 'resources', 'app');
  await mkdir(codeRoot, { recursive: true });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('distribution marker and packaged authority', () => {
  it('identifies only a valid host-matching marker and preserves source-checkout identity', async () => {
    const marker = { channel: 'windows-portable', softwareVersion: '0.1.0' };
    expect(resolveChannel(false, marker, 'win32')).toBe('source-checkout');
    expect(resolveChannel(true, marker, 'win32')).toBe('windows-portable');
    expect(resolveChannel(true, { ...marker, softwareVersion: '0.1.0-rc.1+source.7' }, 'win32')).toBe('windows-portable');
    expect(resolveChannel(true, { ...marker, channel: 'windows-installer' }, 'win32')).toBe('windows-installer');
    expect(resolveChannel(true, { ...marker, channel: 'macos-dmg' }, 'darwin')).toBe('macos-dmg');
    for (const invalid of [null, [], {}, { channel: 'windows-portable' }, { ...marker, channel: 'other' }, { ...marker, extra: true }]) {
      expect(resolveChannel(true, invalid, 'win32')).toBe('packaged');
    }
    expect(resolveChannel(true, marker, 'darwin')).toBe('packaged');
    expect(await readDistributionChannel(true, root)).toBe('packaged');
    await writeFile(join(root, 'channel.json'), '{');
    expect(await readDistributionChannel(true, root)).toBe('packaged');
    const hostChannel = process.platform === 'darwin' ? 'macos-dmg' : 'windows-portable';
    await writeFile(join(root, 'channel.json'), JSON.stringify({ ...marker, channel: hostChannel }));
    expect(await readDistributionChannel(true, root)).toBe(hostChannel);
    expect(await readDistributionChannel(false, root)).toBe('source-checkout');
  });
  it('derives production scope without a launcher and refuses arbitrary launch controls', () => {
    expect(packagedLaunchForm([])).toEqual({ selfCheck: false, launchForm: {
      trustedOperationalScope: 'ordinary-production', runBudgetCeiling: null, providerCacheRoot: null, validation: null,
    } });
    expect(packagedLaunchForm(['--self-check']).selfCheck).toBe(true);
    for (const args of [['--data-root', root], ['--trusted-operational-scope', 'developer-live'], ['--launcher-pid', '1'],
      ['--self-check', '--self-check'], ['--j04-model-adapter', 'fixture']]) expect(() => packagedLaunchForm(args)).toThrow();
    // Only macOS's Finder serial number is ignored, and only there; it never smuggles a control past the check.
    expect(packagedLaunchForm(['-psn_0_12345'], 'darwin').selfCheck).toBe(false);
    expect(packagedLaunchForm(['-psn_0_12345', '--self-check'], 'darwin').selfCheck).toBe(true);
    expect(() => packagedLaunchForm(['-psn_0_12345'], 'win32')).toThrow('AI7_PACKAGED_ARGUMENT_INVALID');
    expect(() => packagedLaunchForm(['-psn_0_12345', '--data-root', root], 'darwin')).toThrow('AI7_PACKAGED_ARGUMENT_INVALID');
  });
});
describe('channel-owned product data location', () => {
  const windows = () => ({ codeRoot, executablePath: join(root, 'AI7', 'app', 'AI7.exe'), platform: 'win32', env: { LOCALAPPDATA: join(root, 'local') } });
  it('uses the sibling portable data directory and keeps the actual production boundary enforced', async () => {
    const location = await resolvePackagedDataLocation({ ...windows(), channel: 'windows-portable' });
    expect(location).toEqual({ dataRoot: join(root, 'AI7', 'data'), exception: null });
    await expect(resolvePackagedDataLocation({ ...windows(), channel: 'windows-portable', codeRoot: join(root, 'AI7') }))
      .rejects.toThrow('AI7_DATA_ROOT_BOUNDARY_INVALID');
  });
  it('falls back only on portable write failure and names the exception plainly', async () => {
    const location = await resolvePackagedDataLocation({ ...windows(), channel: 'windows-portable', writable: async (path) => {
      if (path === join(root, 'AI7', 'data')) throw Object.assign(new Error('denied'), { code: 'EACCES' });
    } });
    expect(location).toEqual({ dataRoot: join(root, 'local', 'ai7', 'production'), exception: 'portable-unwritable' });
    expect(channelDescription('windows-portable', location.exception)).toContain('复制 AI7 文件夹不会带走这些数据');
    // Permission recovery cannot make the same installation silently abandon its existing fallback database.
    expect(await resolvePackagedDataLocation({ ...windows(), channel: 'windows-portable' })).toEqual(location);
  });
  it('honors the installer stored choice, while portable never reads it', async () => {
    const defaultRoot = join(root, 'local', 'ai7', 'production');
    expect((await resolvePackagedDataLocation({ ...windows(), channel: 'windows-installer' })).dataRoot).toBe(defaultRoot);
    const chosen = join(root, 'chosen');
    await storeStartupDataChoice(defaultRoot, chosen);
    expect((await resolvePackagedDataLocation({ ...windows(), channel: 'windows-installer' })).dataRoot).toBe(chosen);
    expect((await resolvePackagedDataLocation({ ...windows(), channel: 'windows-portable' })).dataRoot).toBe(join(root, 'AI7', 'data'));
  });
  it('uses bundle-id Application Support for DMG and never silently falls back', async () => {
    const options = { channel: 'macos-dmg' as const, codeRoot, executablePath: join(root, 'AI7.app', 'Contents', 'MacOS', 'AI7'), platform: 'darwin', home: root };
    expect((await resolvePackagedDataLocation(options)).dataRoot).toBe(join(root, 'Library', 'Application Support', 'io.github.zhouy1017.ai7', 'production'));
    await expect(resolvePackagedDataLocation({ ...options, writable: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } })).rejects.toThrow('denied');
  });
  it('names every channel and where it keeps product data in plain words, without filesystem notation', () => {
    expect(CHANNEL_LABELS).toEqual({ 'source-checkout': '源码检出', 'windows-installer': '安装版', 'windows-portable': '便携版',
      'macos-dmg': 'macOS 磁盘映像', packaged: '未知渠道' });
    expect(channelDescription('windows-portable', null)).toContain('程序文件与产品数据分别放在 AI7 文件夹内的两个区域');
    expect(channelDescription('windows-installer', null)).toBe('产品数据在本机用户数据区。');
    expect(channelDescription('macos-dmg', null)).toBe('产品数据在 macOS 的应用支持目录。');
    for (const channel of Object.keys(CHANNEL_LABELS) as (keyof typeof CHANNEL_LABELS)[]) {
      expect(channelDescription(channel, null)).not.toMatch(/%LOCALAPPDATA%|[\\/]|Application Support/);
    }
  });
  it('warns without changing a known sync location', () => {
    const synced = join(root, 'OneDrive', 'AI7', 'data');
    expect(dataLocationSyncWarning(synced, {})).toContain('未公开的编辑材料');
    expect(dataLocationSyncWarning(join(root, 'plain'), {})).toBeNull();
    expect(dataLocationSyncWarning(join(root, 'custom', 'data'), { OneDrive: join(root, 'custom') })).not.toBeNull();
  });
  it('refuses a redirected DMG Application Support root without falling back', async () => {
    const support = join(root, 'Library', 'Application Support', 'io.github.zhouy1017.ai7');
    const redirected = join(root, 'redirected');
    await mkdir(support, { recursive: true });
    await mkdir(redirected);
    await symlink(redirected, join(support, 'production'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(resolvePackagedDataLocation({ channel: 'macos-dmg', codeRoot,
      executablePath: join(root, 'AI7.app', 'Contents', 'MacOS', 'AI7'), platform: 'darwin', home: root }))
      .rejects.toThrow('AI7_DATA_ROOT_BOUNDARY_INVALID');
  });
});
