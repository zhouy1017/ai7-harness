import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { builderConfiguration, copyRuntimeClosure, packagerArtifacts, plannedOutputs, selfCheckEnvironment } from '../../tools/package.mjs';

describe('host-native offline package inputs', () => {
  it('passes only OS prerequisites to the installed-product self-check', () => {
    const executable = resolve('AI7', 'app', 'AI7.exe');
    const env = selfCheckEnvironment(executable, { SystemRoot: resolve('system'), LOCALAPPDATA: resolve('local'),
      NODE_OPTIONS: '--inspect', ELECTRON_RUN_AS_NODE: '1', NPM_CONFIG_REGISTRY: 'https://example.invalid/', UNRELATED: 'synthetic' }, 'win32');
    expect(Object.keys(env).sort()).toEqual(['LOCALAPPDATA', 'PATH', 'SystemRoot']);
    expect(env.PATH).not.toContain('example.invalid');
  });
  it('lists only host-native outputs and never promises a Windows-built DMG', () => {
    expect(plannedOutputs('0.1.0', 'win32')).toEqual(['AI7-0.1.0-win-x64-setup.exe', 'AI7-0.1.0-win-x64-portable.zip', 'self-check.txt']);
    expect(plannedOutputs('0.1.0', 'darwin')).toEqual(['AI7-0.1.0-mac-arm64.dmg']);
    expect(() => plannedOutputs('0.1.0', 'linux')).toThrow();
    expect(() => plannedOutputs('../escape', 'win32')).toThrow();
  });

  it('uses only declared toolsets and the bootstrap Electron, with signing and native rebuilds disabled', async () => {
    const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    const artifacts = JSON.parse(await readFile(new URL('../../config/dependency-artifacts.json', import.meta.url), 'utf8'));
    const config = builderConfiguration(manifest, resolve('stage'));
    expect(manifest.devDependencies['electron-builder']).toBe('26.15.3');
    expect(config.asar).toBe(false);
    expect(config.electronVersion).toBe('43.4.1');
    expect(config.electronDist).toContain('.runtime');
    expect(config.electronDownload).toBeUndefined();
    expect(config.toolsets).toEqual({ nsis: '1.2.1' });
    expect(config.nsis.customNsisBinary).toBeUndefined();
    expect(config.nsis.customNsisResources).toBeUndefined();
    expect(config.npmRebuild).toBe(false);
    expect(config.win.signAndEditExecutable).toBe(false); // No rcedit/winCodeSign acquisition.
    expect(config.mac.identity).toBeNull();
    expect(config.mac.notarize).toBe(false);
    expect(config.dmg.sign).toBe(false);
    expect(config.publish).toBeNull();
    expect(config.files).toEqual(['dist/**', 'package.json', 'node_modules/**']);
    for (const [platform, arch, tool] of [['win32', 'x64', 'nsis@1.2.1'], ['darwin', 'arm64', 'dmg-builder@1.2.5']]) {
      const inputs = packagerArtifacts(artifacts, platform, arch);
      expect(inputs.map((input: { cacheDirectory: string }) => input.cacheDirectory).sort()).toEqual(['7zip@1.0.0', tool].sort());
      for (const input of inputs) expect(input).toMatchObject({ sha256: expect.stringMatching(/^[0-9a-f]{64}$/), size: expect.any(Number), sha256Source: expect.any(String) });
    }
    expect(() => packagerArtifacts({ artifacts: [] }, 'win32', 'x64')).toThrow();
  });

  it('copies a runtime graph as regular files, retaining conflicting transitive versions without dev packages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai7-package-closure-'));
    try {
      const source = join(root, 'source');
      const target = join(root, 'target');
      const pkg = async (path: string, value: object) => {
        await mkdir(path, { recursive: true });
        await writeFile(join(path, 'package.json'), JSON.stringify(value));
      };
      await pkg(source, { dependencies: { '@napi-rs/keyring': '1', alpha: '1', beta: '1' }, devDependencies: { 'dev-only': '1' } });
      await pkg(join(source, 'node_modules/@napi-rs/keyring'), { name: '@napi-rs/keyring', version: '1', optionalDependencies: { '@napi-rs/keyring-win32-x64-msvc': '1' } });
      await pkg(join(source, 'node_modules/@napi-rs/keyring-win32-x64-msvc'), { name: '@napi-rs/keyring-win32-x64-msvc', version: '1', os: ['win32'], cpu: ['x64'] });
      for (const [name, sharedVersion] of [['alpha', '1'], ['beta', '2']]) {
        await pkg(join(source, 'node_modules', name!), { name, version: '1', dependencies: { shared: sharedVersion } });
        await pkg(join(source, 'node_modules', name!, 'node_modules/shared'), { name: 'shared', version: sharedVersion });
      }
      const copied = await copyRuntimeClosure(source, target, 'win32', 'x64');
      expect(copied).not.toContain('dev-only');
      const version = async (path: string) => JSON.parse(await readFile(join(path, 'package.json'), 'utf8')).version;
      expect(await version(join(target, 'node_modules/shared'))).toBe('1');
      expect(await version(join(target, 'node_modules/beta/node_modules/shared'))).toBe('2');
      expect((await readdir(join(target, 'node_modules'), { withFileTypes: true })).every((entry) => !entry.isSymbolicLink())).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
