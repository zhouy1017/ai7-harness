import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { builderConfiguration, copyRuntimeClosure, packagerArtifacts, plannedOutputs, selfCheckEnvironment } from '../../tools/package.mjs';

const identity = { schema: 1, softwareVersion: '0.4.0', dataVersion: 1, buildNumber: 1234, sourceCommit: 'a'.repeat(40), dirty: false };

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
    expect(plannedOutputs('0.1.0-rc.1+source.7', 'darwin')).toEqual(['AI7-0.1.0-rc.1+source.7-mac-arm64.dmg']);
  });

  it('uses only declared toolsets and the bootstrap Electron, with signing and native rebuilds disabled', async () => {
    const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    const artifacts = JSON.parse(await readFile(new URL('../../config/dependency-artifacts.json', import.meta.url), 'utf8'));
    const config = builderConfiguration(manifest, resolve('stage'), identity);
    expect(manifest.devDependencies['electron-builder']).toBe('26.15.3');
    expect(config.asar).toBe(false);
    expect(config.electronVersion).toBe('43.4.1');
    expect(config.electronDist).toContain('.runtime');
    expect(config.electronDownload).toBeUndefined();
    expect(config.toolsets).toEqual({ nsis: '1.2.1' });
    expect(config.nsis.customNsisBinary).toBeUndefined();
    expect(config.nsis.customNsisResources).toBeUndefined();
    expect(config.npmRebuild).toBe(false);
    expect(config.win.signAndEditExecutable).toBe(true); // Pinned resedit JS, no secondary tool acquisition.
    expect(config.win.signExecutable).toBe(false);
    expect(config.buildNumber).toBe('1234');
    expect(config.buildVersion).toBe('0.4.0.1234');
    expect(config.mac.bundleVersion).toBe('1.12.34');
    expect(config.mac.bundleShortVersion).toBe('0.4.0');
    expect(config.mac.extendInfo.AI7SourceCommit).toBe(identity.sourceCommit);
    expect(() => builderConfiguration(manifest, resolve('stage'), { ...identity, dirty: true })).toThrow();
    expect(() => builderConfiguration(manifest, resolve('stage'), { ...identity, softwareVersion: '0.5.0' })).toThrow();
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

  it('stamps numeric Windows resources through pinned builder code without invoking signing', async () => {
    const require = createRequire(import.meta.url);
    require('electron-builder'); // Initialize the package entrypoint before its mutually importing packager classes.
    const builderRequire = createRequire(require.resolve('electron-builder'));
    const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib'));
    const { AppInfo } = appBuilderRequire('app-builder-lib/out/appInfo');
    const { WinPackager } = appBuilderRequire('app-builder-lib/out/winPackager');
    const { NtExecutable, NtExecutableResource, Resource } = appBuilderRequire('resedit');
    const root = await mkdtemp(join(tmpdir(), 'ai7-resource-version-'));
    try {
      const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
      const config = builderConfiguration(manifest, root, identity);
      const appInfo = new AppInfo({ metadata: manifest, config });
      const file = join(root, 'AI7.exe');
      const executable = NtExecutable.createEmpty(false, false);
      const initialResources = NtExecutableResource.from(executable);
      const initialVersion = Resource.VersionInfo.createEmpty();
      initialVersion.lang = 1033;
      initialVersion.setFileVersion('43.4.1.0');
      initialVersion.setProductVersion('43.4.1.0');
      initialVersion.outputToResourceEntries(initialResources.entries);
      initialResources.outputResource(executable);
      await writeFile(file, Buffer.from(executable.generate()));
      const sign = vi.fn(() => { throw new Error('Signing must never run'); });
      const packager = { appInfo, config, platformSpecificBuildOptions: config.win, forceCodeSigning: false,
        getIconPath: async () => null, _sign: sign, shouldSignFile: WinPackager.prototype.shouldSignFile,
        signIf: WinPackager.prototype.signIf, signAndEditResources: WinPackager.prototype.signAndEditResources };
      await WinPackager.prototype.signApp.call(packager, { appOutDir: root, outDir: root, arch: 1 }, false);
      expect(sign).not.toHaveBeenCalled();
      const resources = NtExecutableResource.from(NtExecutable.from(await readFile(file)));
      const info = Resource.VersionInfo.fromEntries(resources.entries)[0];
      expect(info.fixedInfo.fileVersionMS).toBe(4); // 0.4
      expect(info.fixedInfo.fileVersionLS).toBe(1234); // 0.1234
      expect(info.fixedInfo.productVersionMS).toBe(4);
      expect(info.fixedInfo.productVersionLS).toBe(1234);
      const strings = info.getStringValues(info.getAllLanguagesForStringValues()[0]);
      expect(strings).toMatchObject({ FileVersion: '0.4.0.1234', ProductVersion: '0.4.0.1234', ProductName: 'AI7' });
    } finally { await rm(root, { recursive: true, force: true }); }
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
