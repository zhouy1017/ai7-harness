import { readFile, open, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createCanonicalProductionDataRoot, defaultProductionDataRoot, readStartupDataChoice } from '../shared/data-root.js';
import { parseTrustedLaunchForm, type DistributionChannel, type TrustedLaunchForm } from '../shared/protocol.js';

export const CHANNEL_LABELS = {
  'source-checkout': '源码检出', 'windows-installer': '安装版', 'windows-portable': '便携版',
  'macos-dmg': 'macOS 磁盘映像', packaged: '未知渠道',
} as const;

/** The marker is a packaging input, never inferred from the OS or executable name. */
export function resolveChannel(packaged: boolean, marker: unknown, platform = process.platform): DistributionChannel {
  if (!packaged) return 'source-checkout';
  if (typeof marker !== 'object' || marker === null || Array.isArray(marker)) return 'packaged';
  const value = marker as Record<string, unknown>;
  if (Object.keys(value).length !== 2 || typeof value['softwareVersion'] !== 'string' ||
      !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(value['softwareVersion'])) return 'packaged';
  const channel = value['channel'];
  if (platform === 'win32' && (channel === 'windows-installer' || channel === 'windows-portable')) return channel;
  if (platform === 'darwin' && channel === 'macos-dmg') return channel;
  return 'packaged';
}

export async function readDistributionChannel(packaged: boolean, resourcesPath: string): Promise<DistributionChannel> {
  if (!packaged) return 'source-checkout';
  try { return resolveChannel(true, JSON.parse(await readFile(resolve(resourcesPath, 'channel.json'), 'utf8'))); }
  catch { return 'packaged'; }
}

/** Packaged command lines cannot supply development scope, a cache, controls or an arbitrary data root. */
export function packagedLaunchForm(args: readonly string[]): { launchForm: TrustedLaunchForm; selfCheck: boolean } {
  if (!(args.length === 0 || (args.length === 1 && args[0] === '--self-check'))) throw new Error('AI7_PACKAGED_ARGUMENT_INVALID');
  return { launchForm: parseTrustedLaunchForm({ trustedOperationalScope: 'ordinary-production' })!, selfCheck: args.length === 1 };
}

export async function requireWritableDataRoot(root: string): Promise<void> {
  const probe = resolve(root, `.ai7-write-${randomUUID()}`);
  const handle = await open(probe, 'wx');
  try { await handle.write(''); } finally { await handle.close(); await unlink(probe); }
}

export interface PackagedDataLocation {
  dataRoot: string;
  exception: 'portable-unwritable' | null;
}

/** A portable executable lives in AI7/app; the data root is its sibling, never an ancestor of code. */
export async function resolvePackagedDataLocation(options: {
  channel: DistributionChannel; codeRoot: string; executablePath: string;
  platform?: string; env?: Record<string, string | undefined>; home?: string;
  writable?: (root: string) => Promise<void>;
}): Promise<PackagedDataLocation> {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const fallback = platform === 'darwin'
    ? resolve(home, 'Library', 'Application Support', 'io.github.zhouy1017.ai7', 'production')
    : defaultProductionDataRoot({ platform, ...(options.env ? { env: options.env } : {}) });
  const writable = options.writable ?? requireWritableDataRoot;
  const prepare = async (root: string): Promise<string> => {
    const canonical = await createCanonicalProductionDataRoot(root, options.codeRoot);
    await writable(canonical);
    return canonical;
  };
  if (options.channel === 'windows-portable') {
    try { return { dataRoot: await prepare(resolve(dirname(options.executablePath), '..', 'data')), exception: null }; }
    catch (error) {
      // Boundary failures never turn a prohibited location into a portable permission fallback.
      if (!['EACCES', 'EPERM', 'EROFS', 'ENOSPC'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      return { dataRoot: await prepare(fallback), exception: 'portable-unwritable' };
    }
  }
  const stored = options.channel === 'windows-installer' ? await readStartupDataChoice(fallback) : null;
  return { dataRoot: await prepare(stored ?? fallback), exception: null };
}

export function channelDescription(channel: DistributionChannel, exception: PackagedDataLocation['exception']): string {
  if (exception !== null) return '便携文件夹无法写入，产品数据已保存在本机用户数据区；复制 AI7 文件夹不会带走这些数据。';
  if (channel === 'windows-portable') return '程序文件与产品数据分别放在 AI7 文件夹内的两个区域；移动或复制文件夹会带走产品数据，但不会带走模型服务凭据。';
  if (channel === 'windows-installer') return '产品数据在本机用户数据区。';
  if (channel === 'macos-dmg') return '产品数据在 macOS 的应用支持目录。';
  return channel === 'source-checkout' ? '源码检出运行，产品数据保存在独立的本机位置。' : '未能识别分发渠道；这里显示实际使用的数据位置。';
}

/** Non-blocking placement awareness, with no recursive inventory or network access. */
export function dataLocationSyncWarning(root: string, env = process.env): string | null {
  const normalized = root.replace(/\\/g, '/').toLowerCase();
  const known = [env['OneDrive'], env['OneDriveConsumer'], env['OneDriveCommercial']].filter((entry): entry is string => !!entry);
  const insideKnown = known.some((entry) => {
    const base = entry.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
    return normalized === base || normalized.startsWith(`${base}/`);
  });
  return insideKnown || /\/(?:onedrive(?: - [^/]+)?|dropbox|google drive|googledrive|icloud drive|mobile documents|cloudstorage)(?:\/|$)/i.test(normalized)
    ? '此位置可能由同步或备份服务复制，未公开的编辑材料也可能被该服务带走；AI7 没有移动数据或公开发布内容。' : null;
}
