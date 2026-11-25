import { execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dialog } from 'electron';

type Action = 'preflight' | 'upgrade' | 'resume' | 'rollback' | 'check-rollback';
type MaintenanceResult = {
  ok: boolean;
  message: string;
  restored?: boolean;
  counts?: { books: number; manuscripts: number; marks: number; reports: number; materials: number };
};

export async function storageMaintenance(
  entry: string, root: string, action: Action,
  onStage?: (stage: string) => void,
): Promise<MaintenanceResult | undefined> {
  let result: MaintenanceResult;
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = execFile(process.execPath, [entry, '--storage-maintenance', action, root], {
        windowsHide: true,
        env: { ELECTRON_RUN_AS_NODE: '1', SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP },
        maxBuffer: 1024 * 1024,
        encoding: 'utf8',
      }, (error, output) => error ? reject(error) : resolve(output));
      if (onStage && child.stderr) {
        createInterface({ input: child.stderr }).on('line', (line: string) => {
          if (line.startsWith('AI7_UPGRADE_STAGE/')) onStage(line.slice('AI7_UPGRADE_STAGE/'.length));
        });
      }
    });
    result = JSON.parse(stdout);
    if (typeof result.ok !== 'boolean' || typeof result.message !== 'string' ||
        (result.ok && action === 'preflight' && !result.counts)) throw new Error('Invalid maintenance reply');
  } catch {
    result = { ok: false, message: '' };
  }
  const message = result.ok ? result.message : [
    '书库操作未能完成。升级前的书库会安全保留。',
    `如果备份已完成，可在此文件夹找到备份：${root}-backups`,
    result.message,
  ].filter(Boolean).join('\n');
  if (message) await dialog.showMessageBox({ type: result.ok ? 'info' : 'error', title: '书库升级', message, buttons: ['关闭'] });
  return result.ok && !result.restored ? result : undefined;
}
