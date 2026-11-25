// Windows, from a checkout with the enrollment helper installed:
// node tools/human-test-preset.mjs "<packaged AI7 app directory>" "<existing data root>"
// Keep AI7 closed through the upgrade, preset and four printed enrollment commands.
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const version = '0.7.9';
const effort = 'high';
const preset = [
  { route: 'opencode-go', name: 'OpenCode Go', label: 'opencodego', pro: 'gemini-4-argon', flash: 'deepseek-v4.1-flash' },
  { route: 'openai-platform', name: 'OpenAI', label: 'openai', pro: 'gpt-6.2-sol', flash: 'gpt-6.1-terra' },
  { route: 'anthropic-claude', name: 'Anthropic Claude', label: 'claude', pro: 'claude-opus-5-5', flash: 'claude-sonnet-5-5' },
  // Apply Gemini last to leave its Pro and Flash selected for editorial work.
  { route: 'google-gemini', name: 'Google Gemini', label: 'gemini', pro: 'gemini-4-argon', flash: 'gemini-4-hydrogen' },
];
const defaultConnection = preset.at(-1);
const roles = [
  ['foreground-pro', 'selectProModel', defaultConnection.pro],
  ['foreground-flash', 'selectFlashModel', defaultConnection.flash],
  ['underlying-pro', 'selectUnderlyingModel', defaultConnection.pro],
  ['underlying-flash', 'selectUnderlyingModel', defaultConnection.flash],
];
const counts = ['books', 'manuscripts', 'marks', 'reports', 'materials'];
const nodeEnv = {
  ELECTRON_RUN_AS_NODE: '1',
  SystemRoot: process.env.SystemRoot,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
};
const maxFrameBytes = 512 * 1024;

class PresetError extends Error {}

function requirePreset(condition, message) {
  if (!condition) throw new PresetError(message);
}

async function optionalJson(path) {
  const info = await lstat(path).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (info === null) return null;
  requirePreset(info.isFile() && info.size <= 32 * 1024, 'Invalid local metadata file.');
  return JSON.parse(await readFile(path, 'utf8'));
}

function overlaps(a, b) {
  const inside = (parent, child) => {
    const path = relative(parent, child);
    return path !== '..' && !path.startsWith('..\\') && !isAbsolute(path);
  };
  return inside(a, b) || inside(b, a);
}

async function assertAppClosed(app) {
  // Ask Windows for executable paths. Command lines can contain private arguments.
  const command = '@(Get-CimInstance Win32_Process -Filter "Name = \'AI7.exe\'" -ErrorAction Stop | Select-Object ExecutablePath) | ConvertTo-Json -Compress';
  const { stdout } = await exec(join(nodeEnv.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 15_000 });
  const processes = stdout.trim() ? [JSON.parse(stdout)].flat() : [];
  for (const process of processes) {
    requirePreset(typeof process.ExecutablePath === 'string', 'Could not verify where an AI7 process was started.');
    const binary = await realpath(process.ExecutablePath);
    requirePreset(!overlaps(app, dirname(binary)), 'Close AI7 started from the packaged folder before continuing.');
  }
}

async function maintenance(executable, entry, root, action) {
  const { stdout } = await exec(executable, [entry, '--storage-maintenance', action, root],
    { env: nodeEnv, windowsHide: true, maxBuffer: 1024 * 1024 });
  const result = JSON.parse(stdout);
  requirePreset(result.ok === true && result.restored === false,
    `Storage ${action} refused or restored the old library.${result.message ? ` ${result.message}` : ''}`);
  return result;
}

async function printRetainedLibrary(root) {
  const origin = await optionalJson(join(root, 'store/upgrade-origin.json'));
  const archiveName = origin?.backup?.backup?.fileName;
  requirePreset(origin?.softwareVersion === version &&
    /^\d{13}-[0-9a-f-]{36}$/u.test(origin?.id) &&
    typeof archiveName === 'string' && basename(archiveName) === archiveName &&
    /^AI7 升级前备份 \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.ai7db$/u.test(archiveName),
    'This library has no 0.7.9 storage upgrade record.');
  const oldStore = join(root, `store-before-${version}-${origin.id}`);
  const archive = join(`${root}-backups`, archiveName);
  requirePreset((await lstat(join(oldStore, 'ai7.sqlite'))).isFile() && (await lstat(archive)).isFile(),
    'The pre-upgrade library or its backup is missing.');
  console.log(`Kept pre-upgrade library: ${oldStore}`);
  console.log(`Backup: ${archive}`);
}

// Use Settings' existing service operations over the packaged service's framed stdio.
async function withSettings(executable, entry, root, apply) {
  // Default launch is development-ci. No environment or request enables provider access.
  const child = spawn(executable, [entry, '--data-root', root, '--parent-pid', String(process.pid)], {
    cwd: dirname(entry), env: nodeEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  let stoppedCode;
  let stderrTail = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => {
    stderrTail = (stderrTail + chunk).slice(-2048);
    stoppedCode = /AI7_SERVICE_STOPPED\/([A-Z][A-Z0-9_]{0,63})(?:\/|\r?\n)/u.exec(stderrTail)?.[1] ?? stoppedCode;
  });
  const exited = new Promise(resolveExit => {
    child.once('error', () => resolveExit(null));
    child.once('close', resolveExit);
  });
  child.stdin.on('error', () => child.kill());
  const chunks = child.stdout[Symbol.asyncIterator]();
  let buffer = Buffer.alloc(0);
  async function readBytes(size) {
    while (buffer.length < size) {
      const { value, done } = await chunks.next();
      if (done) {
        await exited;
        throw new PresetError(`Packaged service ended before its reply${stoppedCode ? ` (${stoppedCode})` : ''}.`);
      }
      buffer = Buffer.concat([buffer, value]);
    }
    const bytes = buffer.subarray(0, size);
    buffer = buffer.subarray(size);
    return bytes;
  }
  async function call(op, input = {}) {
    const id = randomUUID();
    const payload = Buffer.from(JSON.stringify({ id, op, input }));
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length);
    const deadline = setTimeout(() => child.kill(), 120_000);
    try {
      child.stdin.write(Buffer.concat([header, payload]));
      const size = (await readBytes(4)).readUInt32BE();
      requirePreset(size > 0 && size <= maxFrameBytes, 'Invalid packaged service frame.');
      const reply = JSON.parse(await readBytes(size));
      requirePreset(reply.id === id, 'Unmatched packaged service reply.');
      const code = /^[A-Z][A-Z0-9_]{0,63}$/u.test(reply.error?.code) ? ` (${reply.error.code})` : '';
      requirePreset(reply.ok === true && reply.op === op, `Settings refused ${op}${code}.`);
      return reply.result;
    } finally {
      clearTimeout(deadline);
    }
  }
  try {
    const ready = await call('ready');
    requirePreset(ready.state === 'ready' && ready.protocolVersion === 206, 'Unexpected packaged service protocol.');
    try {
      return await apply(call);
    } finally {
      await call('shutdown');
      child.stdin.end();
      const deadline = setTimeout(() => child.kill(), 120_000);
      try {
        requirePreset(await exited === 0, 'Packaged service failed to shut down cleanly.');
      } finally {
        clearTimeout(deadline);
      }
    }
  } finally {
    if (child.exitCode === null) child.kill();
    await exited;
  }
}

function matches(binding, route, model) {
  return binding?.providerId === route && binding.modelId === model && binding.reasoningEffort === effort;
}

function connectionOf(state, route) {
  return state.connections.find(connection => connection.binding.providerId === route);
}

async function applySettings(call) {
  const read = () => call('getModelServiceStoredState');
  let state = await read();
  requirePreset(state.launchPolicy.operationalScope === 'development-ci', 'The packaged service must be provider-free.');
  for (const plan of preset) {
    const channel = state.channels.find(entry => entry.route === plan.route);
    requirePreset(channel, `Missing packaged model channel ${plan.route}.`);
    for (const [modelId, tier] of [[plan.pro, 'main'], [plan.flash, 'fast']]) {
      const model = channel.models.find(entry => entry.modelId === modelId);
      // A cached account list can omit a documented model. The save operation still validates its effort.
      if (model) {
        requirePreset(model[tier] === 'eligible' && model.supportedEfforts?.levels.includes(effort),
          `High effort is unavailable for ${plan.route}/${modelId}.`);
      }
    }
  }
  for (const plan of preset) {
    const prior = connectionOf(state, plan.route);
    if (!prior) {
      await call('saveModelServiceConnection', { route: plan.route, connectionName: plan.name,
        credentialReference: null, credentialOperationState: 'ready' });
    } else if (prior.credentialOperationState !== 'ready') {
      await call('setModelServiceCredentialState', {
        credentialReference: prior.credentialReference, credentialOperationState: 'ready',
      });
    }
  }
  state = await read();
  // Only the two foreground operations remember the channel's own Pro and Flash choices.
  for (const { route, pro, flash } of preset) {
    const connection = connectionOf(state, route);
    if (!matches(connection.binding, route, pro)) await call('selectProModel', { route, modelId: pro, reasoningEffort: effort });
    if (!matches(connection.fastBinding, route, flash)) await call('selectFlashModel', { route, modelId: flash, reasoningEffort: effort });
  }
  state = await read();
  const route = defaultConnection.route;
  for (const [roleId, op, modelId] of roles) {
    const role = state.modelRoles.find(entry => entry.roleId === roleId);
    const explicit = roleId.endsWith('pro') ? 'pro-tier' : 'flash-tier';
    // Underlying Pro inherits the same projected source as an explicit Pro choice.
    // Write it explicitly once with the other role bindings.
    if (roleId === 'underlying-pro' || role?.source !== explicit ||
        !matches(role.binding, route, modelId)) {
      await call(op, { route, modelId, reasoningEffort: effort,
        ...(op === 'selectUnderlyingModel' ? { roleId } : {}) });
    }
  }

  state = await read();
  for (const [roleId, , modelId] of roles) {
    const role = state.modelRoles.find(entry => entry.roleId === roleId);
    requirePreset(role?.status === 'available' && matches(role.binding, route, modelId), `Preset role verification failed for ${roleId}.`);
  }
  return preset.map(plan => {
    const connection = connectionOf(state, plan.route);
    requirePreset(matches(connection?.binding, plan.route, plan.pro) && matches(connection.fastBinding, plan.route, plan.flash) &&
      connection.credentialOperationState === 'ready' && /^[0-9a-f-]{36}$/u.test(connection.credentialReference),
      `Preset connection verification failed for ${plan.route}.`);
    const models = state.channels.find(channel => channel.route === plan.route).models;
    const proFamily = models.find(model => model.modelId === plan.pro)?.family;
    const flashFamily = models.find(model => model.modelId === plan.flash)?.family;
    requirePreset(plan.route !== 'opencode-go' || proFamily === 'google-generate-content',
      'OpenCode Go Argon must use native generateContent.');
    return { ...plan, reference: connection.credentialReference, proFamily, flashFamily };
  });
}

async function main() {
  const [appInput, rootInput, ...extra] = process.argv.slice(2);
  requirePreset(process.platform === 'win32' && appInput && rootInput && extra.length === 0,
    'Usage (Windows): node tools/human-test-preset.mjs "<packaged AI7 app directory>" "<existing data root>"');
  const app = await realpath(resolve(appInput));
  const root = await realpath(resolve(rootInput));
  requirePreset(!overlaps(app, root), 'The packaged app and data must be in separate directories.');
  requirePreset((await stat(root)).isDirectory(), 'The existing data root must be a directory.');
  const executable = join(app, 'AI7.exe');
  const dist = join(app, 'resources/app/dist');
  const entry = join(dist, 'service/index.mjs');
  const identity = await optionalJson(join(dist, 'build-identity.json'));
  requirePreset(identity?.softwareVersion === version && identity.dataVersion === 2 &&
    (await stat(executable)).isFile() && (await stat(entry)).isFile(), 'Provide the packaged 0.7.9 AI7 app directory.');
  await assertAppClosed(app);

  const store = join(root, 'store');
  requirePreset(await realpath(store) === store && (await lstat(join(store, 'ai7.sqlite'))).isFile(), 'The library store must be local to the data root.');
  const markerPath = join(store, 'ai7-data-version.json');
  const journalPath = join(root, 'shell/storage-upgrade.json');
  const receiptPath = join(root, 'shell/human-test-preset-0.7.9.json');
  const marker = () => optionalJson(markerPath);
  const current = found => found?.softwareVersion === version && found.dataVersion === 2 && found.schemaRevision === 117;
  requirePreset(!await optionalJson(journalPath), 'An interrupted storage operation needs recovery in AI7 before running the preset.');
  // The service updates writtenAt on every open, even for Settings reads. Avoid another
  // open on an immediate rerun. The receipt holds no connection data or references.
  const stamp = async found => {
    const db = await stat(join(store, 'ai7.sqlite'), { bigint: true });
    return [found.writtenAt, String(db.mtimeNs), String(db.size)].join('/');
  };
  const alreadyApplied = async found => current(found) && (await optionalJson(receiptPath))?.stamp === await stamp(found);
  if (await alreadyApplied(await marker())) {
    console.log('0.7.9 preset already applied. No changes.');
    return;
  }
  // A 0.7.3 library can legitimately have no shell directory yet.
  const lockPath = join(root, 'human-test-preset.lock');
  const lock = await open(lockPath, 'wx').catch(() => {
    throw new PresetError('Cannot lock the data root for the preset. Check for another preset process.');
  });
  try {
    const before = await marker();
    if (await alreadyApplied(before)) {
      console.log('0.7.9 preset already applied. No changes.');
      return;
    }
    if (!current(before)) {
      requirePreset(before?.dataVersion === 1 && before.schemaRevision === 116 && /^0\.7\.\d+$/u.test(before.softwareVersion),
        'Provide an existing 0.7.x library supported by the 0.7.9 upgrade.');
      const preflight = await maintenance(executable, entry, root, 'preflight');
      requirePreset(counts.every(key => Number.isSafeInteger(preflight.counts?.[key]) && preflight.counts[key] >= 0),
        'Invalid preflight entity counts.');
      console.log(`Preflight: ${counts.map(key => `${key}=${preflight.counts[key]}`).join(' ')}`);
      console.log(`Backup directory: ${root}-backups`);
      await assertAppClosed(app);
      await maintenance(executable, entry, root, 'upgrade');
    }
    requirePreset(current(await marker()) && !await optionalJson(journalPath), 'The storage upgrade did not publish a 0.7.9 library.');
    await printRetainedLibrary(root);
    await assertAppClosed(app);
    const connections = await withSettings(executable, entry, root, applySettings);
    for (const { name, route, pro, flash, proFamily, flashFamily } of connections) {
      console.log(`${name} (${route}): ${pro} [${proFamily}] / ${flash} [${flashFamily}], ${effort}`);
    }
    for (const [role, , model] of roles) console.log(`${role}: ${defaultConnection.name} / ${model} / ${effort}`);
    console.log('Run all four enrollment commands before opening AI7. Replace <KEYFILE> with the labelled credential file path.');
    for (const { route, reference, label } of connections) {
      console.log(`node tools/enroll-dev-credential.mjs --slot ${route} --credential-reference ${reference} --from-file "<KEYFILE>" --label ${label}`);
    }
    requirePreset(await realpath(dirname(receiptPath)) === dirname(receiptPath), 'The library shell must be local to the data root.');
    await writeFile(receiptPath, JSON.stringify({ stamp: await stamp(await marker()) }));
  } finally {
    await lock.close();
    await rm(lockPath);
  }
}

await main().catch(error => {
  console.error(error instanceof PresetError ? error.message : `Preset failed${/^[A-Z0-9_]{1,64}$/u.test(error?.code) ? ` (${error.code})` : ''}.`);
  process.exitCode = 1;
});
