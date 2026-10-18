import { lstat, readFile, open, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createCanonicalProductionDataRoot, defaultProductionDataRoot, ensureCanonicalDataDirectory,
  inspectCanonicalDataFile, readStartupDataChoice } from '../shared/data-root.js';
import { parseTrustedLaunchForm, type DistributionChannel, type TrustedLaunchForm } from '../shared/protocol.js';
import { CHANNEL_DESCRIPTIONS, PORTABLE_UNWRITABLE_NOTICE, SYNC_LOCATION_WARNING } from '../renderer/distribution-channel-labels.js';

export { CHANNEL_LABELS } from '../renderer/distribution-channel-labels.js';

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
export function packagedLaunchForm(args: readonly string[], platform = process.platform): { launchForm: TrustedLaunchForm; selfCheck: boolean } {
  // macOS can hand a Finder-launched app its process serial number (`-psn_0_<n>`), e.g. on a quarantined first open; it carries no control.
  const given = platform === 'darwin' ? args.filter((value) => !/^-psn_\d+_\d+$/.test(value)) : args;
  if (!(given.length === 0 || (given.length === 1 && given[0] === '--self-check'))) throw new Error('AI7_PACKAGED_ARGUMENT_INVALID');
  return { launchForm: parseTrustedLaunchForm({ trustedOperationalScope: 'ordinary-production' })!, selfCheck: given.length === 1 };
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
    // DSTO-014: the DMG's selected Application Support location cannot redirect through an alias.
    if (platform === 'darwin' && canonical !== resolve(root)) throw new Error('AI7_DATA_ROOT_BOUNDARY_INVALID');
    await writable(canonical);
    return canonical;
  };
  if (options.channel === 'windows-portable') {
    // Remember a fallback per portable folder. Restored permissions must not silently open a new empty database.
    const folder = resolve(dirname(options.executablePath), '..');
    const identity = createHash('sha256').update(platform === 'win32' ? folder.toLowerCase() : folder).digest('hex');
    const stateName = `portable-location-${identity}.json`;
    const statePath = resolve(fallback, 'shell', stateName);
    let stored = false;
    try { await lstat(statePath); stored = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const fallbackLocation = async (): Promise<PackagedDataLocation> => {
      const dataRoot = await prepare(fallback);
      const shell = await ensureCanonicalDataDirectory(dataRoot, 'shell');
      const state = await inspectCanonicalDataFile(dataRoot, shell, stateName);
      if (state.exists) {
        const value: unknown = JSON.parse(await readFile(state.path, 'utf8'));
        if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).length !== 2 ||
            (value as Record<string, unknown>)['version'] !== 1 || (value as Record<string, unknown>)['state'] !== 'portable-unwritable') {
          throw new Error('AI7_DATA_LOCATION_EXCEPTION_INVALID');
        }
      } else await writeFile(state.path, `${JSON.stringify({ version: 1, state: 'portable-unwritable' })}\n`, { flag: 'wx' });
      return { dataRoot, exception: 'portable-unwritable' };
    };
    if (stored) return fallbackLocation();
    try { return { dataRoot: await prepare(resolve(folder, 'data')), exception: null }; }
    catch (error) {
      // Boundary failures never turn a prohibited location into a portable permission fallback.
      if (!['EACCES', 'EPERM', 'EROFS', 'ENOSPC'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      return fallbackLocation();
    }
  }
  const stored = options.channel === 'windows-installer' ? await readStartupDataChoice(fallback) : null;
  return { dataRoot: await prepare(stored ?? fallback), exception: null };
}

export function channelDescription(channel: DistributionChannel, exception: PackagedDataLocation['exception']): string {
  return exception !== null ? PORTABLE_UNWRITABLE_NOTICE : CHANNEL_DESCRIPTIONS[channel];
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
    ? SYNC_LOCATION_WARNING : null;
}
