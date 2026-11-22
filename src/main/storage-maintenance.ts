import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dialog } from 'electron';

export async function storageMaintenance(entry: string, root: string, action: 'preflight'|'upgrade'|'resume'|'rollback'): Promise<boolean> {
  const { stdout } = await promisify(execFile)(process.execPath,[entry,'--storage-maintenance',action,root],{
    windowsHide:true, env:{ ELECTRON_RUN_AS_NODE:'1',SystemRoot:process.env.SystemRoot, TEMP:process.env.TEMP,TMP:process.env.TMP },
    maxBuffer:8192, encoding:'utf8',
  });
  const result = JSON.parse(stdout);
  if (result.message) await dialog.showMessageBox({type: result.ok ? 'info' : 'error',title:'书库升级',message:result.message,buttons:['关闭']});
  return result.ok === true && !result.restored;
}
