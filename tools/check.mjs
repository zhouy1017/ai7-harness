import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

// L0 of the Local Verification Ladder (ADR 0062): the exact TypeScript check the build performs,
// with full diagnostics for the developer host, then a syntax parse of every tracked runner and
// tool so a parse error fails here rather than riding green to Electron (#346, the #332 finding).
// It is a developer command, never a hosted gate.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Feature operations may depend on domain owners, never the composition root or UI.
// Later extractions add one entry; targets are root-relative resolved paths or directory prefixes.
const forbiddenFeatureImports = {
  'src/service/import-retention.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/manuscript-export.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/manuscript-reimport-operations.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/import-review-records.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/import-intake-operations.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/review/review-operations.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/book-findings.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/house-review-preference.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/learning/memory-facade.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/learning/ledger.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/store-inventory.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/production-document-operations.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/evaluation-calibration-operations.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/evaluation-market.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/readers-reports.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
  'src/service/initial-evaluation-operations.ts': ['src/service/store.ts', 'src/renderer/', 'src/main/'],
};
for (const [module, forbidden] of Object.entries(forbiddenFeatureImports)) {
  const source = ts.createSourceFile(module, readFileSync(resolve(ROOT, module), 'utf8'), ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
    const target = relative(ROOT, resolve(ROOT, dirname(module), specifier.text)).replaceAll('\\', '/').replace(/\.js$/u, '.ts');
    if (forbidden.some((entry) => entry.endsWith('/') ? target.startsWith(entry) : target === entry)) {
      console.error(`CHECK/feature-import-boundary: ${module} -> ${target}`);
      process.exit(1);
    }
  }
}

const compiler = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const ENV = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR };

if (!existsSync(compiler)) {
  console.error('CHECK/typescript-absent: run the frozen bootstrap first.');
  process.exit(1);
}

const typeCheck = spawnSync(process.execPath, [compiler, '--noEmit', '--pretty', 'false'], {
  cwd: ROOT,
  env: ENV,
  stdio: 'inherit',
  windowsHide: true,
});

if (typeCheck.error) {
  console.error('CHECK/typescript-spawn-failed');
  process.exit(1);
}
if (typeCheck.status !== 0) {
  process.exit(typeCheck.status ?? 1);
}

// ADR 0073 §2: the provider configuration's generated files must be exactly what the documents under
// `config/providers/` generate. A reviewer reads the document diff, and this rung is why that is enough.
const providerConfiguration = spawnSync(process.execPath, [resolve(ROOT, 'tools', 'generate-provider-configuration.mjs'), '--check'], {
  cwd: ROOT,
  env: ENV,
  stdio: 'inherit',
  windowsHide: true,
});

if (providerConfiguration.error || providerConfiguration.status !== 0) {
  console.error('CHECK/provider-configuration-stale');
  process.exit(1);
}

const documentation = spawnSync(process.execPath, [resolve(ROOT, 'tools', 'check-docs.mjs')], {
  cwd: ROOT,
  env: ENV,
  stdio: 'inherit',
  windowsHide: true,
});
if (documentation.error || documentation.status !== 0) {
  console.error('CHECK/documentation-invalid');
  process.exit(1);
}

// ADR 0098: package.json, the version ledger, PROGRESS and the development plan name one x.y.z version.
const version = spawnSync(process.execPath, [resolve(ROOT, 'tools', 'check-version.mjs')], {
  cwd: ROOT,
  env: ENV,
  stdio: 'inherit',
  windowsHide: true,
});
if (version.error || version.status !== 0) {
  console.error('CHECK/version-inconsistent');
  process.exit(1);
}

const enumerated = spawnSync('git', ['ls-files', '-z', '--', 'e2e/*.mjs', 'tools/*.mjs'], {
  cwd: ROOT,
  env: ENV,
  windowsHide: true,
});

if (enumerated.error || enumerated.status !== 0) {
  console.error('CHECK/runner-enumeration-failed');
  process.exit(1);
}

const separator = String.fromCharCode(0);
const runners = enumerated.stdout.toString('utf8').split(separator).filter(Boolean);

for (const runner of runners) {
  const parsed = spawnSync(process.execPath, ['--check', runner], {
    cwd: ROOT,
    env: ENV,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (parsed.error || parsed.status !== 0) {
    console.error(`CHECK/runner-parse-failed: ${runner}`);
    process.exit(1);
  }
}

process.exit(0);
