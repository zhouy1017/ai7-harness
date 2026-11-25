import { createCanonicalExternalDataRoot } from '../shared/data-root.js';
import { readBuiltIdentity } from '../shared/read-build-identity.js';
import { beginUpgrade, beginUpgradeRollback, checkUpgradeRollback, resumeUpgrade, upgradePreflight } from './in-app-upgrade.js';

export async function runStorageMaintenance(args: string[], codeRoot: string): Promise<void> {
  try {
    if (args.length !== 2) throw new Error('Invalid maintenance arguments');
    const root = await createCanonicalExternalDataRoot(args[1]!, codeRoot);
    const { softwareVersion } = await readBuiltIdentity(codeRoot);
    const reportStage = (stage: string) => process.stderr.write(`AI7_UPGRADE_STAGE/${stage}\n`);
    let result = { restored: false, message: '' };
    switch (args[0]) {
      case 'preflight': {
        const counts = await upgradePreflight(root);
        process.stdout.write(JSON.stringify({ ok: true, ...result, counts }));
        return;
      }
      case 'check-rollback': await checkUpgradeRollback(root); break;
      case 'rollback':
        await beginUpgradeRollback(root);
        result = await resumeUpgrade(root, softwareVersion) ?? result;
        break;
      case 'upgrade':
      case 'resume':
        if (args[0] === 'upgrade') await beginUpgrade(root);
        result = await resumeUpgrade(root, softwareVersion, undefined, undefined, reportStage) ?? result;
        break;
      default: throw new Error('Invalid maintenance operation');
    }
    process.stdout.write(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    const code = (error as { code?: string } | null)?.code ?? '';
    const allowed = ['PROCEDURE_RECORD_INVALID', 'UPGRADE_SOURCE_INVALID', 'UPGRADE_SOURCE_CHANGED', 'UPGRADE_SPACE', 'UPGRADE_STORE_MISSING', 'UPGRADE_FILES_INVALID', 'UPGRADE_MISMATCH',
      'UPGRADE_STATE_INVALID', 'UPGRADE_BACKUP_FAILED', 'UPGRADE_BACKUP_EXISTS', 'UPGRADE_BACKUP_UNSUPPORTED', 'DATABASE_SOURCE_DAMAGED'];
    const message = error instanceof Error && allowed.includes(code) ? error.message : '';
    process.stdout.write(JSON.stringify({ ok: false, message }));
  }
}
