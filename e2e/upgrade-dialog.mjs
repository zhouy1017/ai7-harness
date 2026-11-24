import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
export async function pressUpgradeDialog(executable, root, title, button, disclosure = '') {
  const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  await run(powershell, ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
    fileURLToPath(new URL('./upgrade-dialog.ps1',import.meta.url)),root,executable,title,button,disclosure],
    { windowsHide:true,timeout:60000,maxBuffer:4096 });
}
