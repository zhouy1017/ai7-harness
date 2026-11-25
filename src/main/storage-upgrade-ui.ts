import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import type { RestoreOnQuit } from './application-quit.js';
import { lockWindowNavigation } from './source-browser.js';
import { storageMaintenance } from './storage-maintenance.js';

const steps = ['备份', '转换', '核对', '切换'];
const stepByStage = new Map([
  ['backup', 0], ['convert', 1], ['verify', 2], ['save-old', 3], ['publish', 3], ['record', 3],
]);
const progressPage = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>正在整理书库</title><style>
body { margin: 0; padding: 24px; font: 16px "Microsoft YaHei UI", sans-serif; background: #f5f7fa; color: #182233; }
h1 { margin: 0 0 16px; font-size: 22px; }
ol { display: flex; gap: 8px; padding: 0; list-style: none; }
li { flex: 1; padding: 7px 0; text-align: center; border: 1px solid #cbd5e1; border-radius: 5px; }
li[aria-current="step"] { background: #234b83; color: white; border-color: #234b83; }
</style><main><h1>正在整理书库</h1><ol aria-label="升级步骤">
${steps.map(step => `<li>${step}</li>`).join('')}
</ol><p role="status">正在准备，请稍候。</p></main></html>`;

async function upgradeWithProgress(entry: string, root: string, action: 'upgrade' | 'resume'): Promise<boolean> {
  const window = new BrowserWindow({
    title: '正在整理书库', width: 440, height: 220, useContentSize: true,
    resizable: false, maximizable: false, closable: false, show: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  // The main workbench will open after maintenance exits.
  app.once('window-all-closed', () => undefined);
  lockWindowNavigation(window.webContents);
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(progressPage)}`);
    window.show();
    return Boolean(await storageMaintenance(entry, root, action, { window, onStage: stage => {
      const index = stepByStage.get(stage);
      if (index === undefined || window.isDestroyed()) return;
      void window.webContents.executeJavaScript(`{
        for (const item of document.querySelectorAll('[aria-current]')) item.removeAttribute('aria-current');
        document.querySelectorAll('li')[${index}].setAttribute('aria-current', 'step');
        document.querySelector('[role="status"]').textContent = ${JSON.stringify(`正在${steps[index]}，请稍候。`)};
      }`).catch(() => undefined);
    } }));
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

export async function resumeStorageUpgrade(entry: string, root: string, shellRoot: string): Promise<boolean> {
  return !existsSync(join(shellRoot, 'storage-upgrade.json')) || upgradeWithProgress(entry, root, 'resume');
}

export async function offerStorageUpgrade(entry: string, root: string): Promise<boolean> {
  const counts = (await storageMaintenance(entry, root, 'preflight'))?.counts;
  if (!counts) return false;
  const answer = await dialog.showMessageBox({
    type: 'question', title: '升级书库',
    message: 'AI7 将先备份，再整理为新格式。升级前的书库会保留，旧版 AI7 无法打开升级后的数据。升级前的修改不能逐步撤销，可以通过「版本」恢复整份稿件。',
    detail: `待升级：${counts.books} 本书、${counts.manuscripts} 份稿件、${counts.marks} 条批注、${counts.reports} 份审阅报告、${counts.materials} 份资料。`,
    buttons: ['升级', '关闭'], defaultId: 0, cancelId: 1,
  });
  return answer.response === 0 && upgradeWithProgress(entry, root, 'upgrade');
}

export async function prepareUpgradeRollback(entry: string, root: string, closeBlocked: () => boolean): Promise<RestoreOnQuit | undefined> {
  if (closeBlocked()) return;
  const answer = await dialog.showMessageBox({
    type: 'warning', title: '回到升级前的数据',
    message: '升级后所做的修改不在旧书库中。恢复后，请使用上一版 AI7 打开。',
    buttons: ['回到升级前的数据', '取消'], defaultId: 1, cancelId: 1,
  });
  if (answer.response !== 0 || !(await storageMaintenance(entry, root, 'check-rollback'))) return;
  return () => storageMaintenance(entry, root, 'rollback');
}
