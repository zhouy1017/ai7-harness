import { createCanonicalExternalDataRoot } from '../shared/data-root.js';
import { readBuiltIdentity } from '../shared/read-build-identity.js';
import { beginUpgrade, beginUpgradeRollback, resumeUpgrade, upgradePreflight } from './in-app-upgrade.js';

export async function runStorageMaintenance(args: string[], codeRoot: string): Promise<void> {
  if (args.length !== 2) throw new Error('Invalid maintenance arguments');
  const root = await createCanonicalExternalDataRoot(args[1]!, codeRoot);
  try {
    const { softwareVersion } = await readBuiltIdentity(codeRoot);
    let result = { restored: false, message: '' };
    switch (args[0]) {
      case 'preflight': await upgradePreflight(root); break;
      case 'rollback': await beginUpgradeRollback(root); break;
      case 'upgrade':
      case 'resume':
        if (args[0] === 'upgrade') await beginUpgrade(root);
        result = await resumeUpgrade(root, softwareVersion) ?? result;
        break;
      default: throw new Error('Invalid maintenance operation');
    }
    process.stdout.write(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    const allowed = ['PROCEDURE_RECORD_INVALID', 'UPGRADE_SOURCE_INVALID', 'UPGRADE_SOURCE_CHANGED', 'UPGRADE_SPACE', 'UPGRADE_STORE_MISSING', 'UPGRADE_FILES_INVALID', 'UPGRADE_MISMATCH',
      'UPGRADE_STATE_INVALID', 'UPGRADE_BACKUP_FAILED', 'UPGRADE_BACKUP_EXISTS', 'UPGRADE_BACKUP_UNSUPPORTED', 'DATABASE_SOURCE_DAMAGED'];
    const message = error instanceof Error && allowed.includes(code) ? error.message : '数据核对未通过。请检查升级前的数据库与备份后重试。';
    process.stdout.write(JSON.stringify({ ok: false, message }));
  }
}
