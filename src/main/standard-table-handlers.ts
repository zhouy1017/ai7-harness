import { dialog, ipcMain } from 'electron';
import { IPC_CHANNELS, type RendererApi } from '../shared/protocol.js';
import type { registerKnowledgeBaseHandlers } from './knowledge-base-handlers.js';
import { envelope, requireDesktop } from './handler-guards.js';
import { ServiceCallError } from './service-client.js';

export function registerStandardTableHandlers(context: Parameters<typeof registerKnowledgeBaseHandlers>[0]): void {
  const { requireSender, requireAuthority, serializeEffect, service } = context;
  const operations = ['inspectStandardTables', 'inspectStandardTable', 'commitStandardTableImport', 'saveStandardTable',
    'setStandardTableEnabled', 'deleteStandardTable', 'restorePreinstalledStandardTables'] as const;
  for (const op of operations) ipcMain.handle(IPC_CHANNELS[op], (event, input) => envelope(async () => {
    requireSender(event); requireDesktop(input !== null && typeof input === 'object');
    return serializeEffect(async () => { requireAuthority(); return service.call(op, input); });
  }));
  ipcMain.handle(IPC_CHANNELS.previewStandardTableImport, (event, input: Parameters<RendererApi['previewStandardTableImport']>[0]) => envelope(async () => {
    const owned = requireSender(event); requireDesktop(input !== null && typeof input === 'object');
    // Pick the path in main; renderer input cannot select filesystem paths or assert model consent.
    const { tableId, previewId, offset, text, fileName, name, kind, versionLabel, sourceDescription, strength } = input;
    return serializeEffect(async () => {
      requireAuthority();
      const request = { tableId, previewId, offset, text, fileName, name, kind, versionLabel, sourceDescription, strength };
      if (previewId) return service.call('previewStandardTableImport', request);
      let path: string | undefined;
      if (text === undefined) {
        path = owned.injectedPickerPath; owned.injectedPickerPath = undefined;
        if (!path) {
          const picked = await dialog.showOpenDialog(owned.window, { title: tableId ? '导入新版本' : '导入字表或词表', properties: ['openFile'],
            filters: [{ name: '字表与词表文件', extensions: ['json', 'csv', 'tsv', 'xlsx', 'docx', 'txt', 'html', 'htm', 'pdf'] }] });
          if (picked.canceled || !picked.filePaths[0]) return null; path = picked.filePaths[0];
        }
      }
      try { return await service.call('previewStandardTableImport', { ...request, path }); }
      catch (error) {
        if (!(error instanceof ServiceCallError) || error.code !== 'STANDARD_TABLE_FORMAT_OFFER') throw error;
        const choice = await dialog.showMessageBox({ type: 'question', message: error.message,
          buttons: ['取消', '发送并预览条目'], defaultId: 0, cancelId: 0 });
        if (choice.response !== 1) return null; requireAuthority();
        return service.call('previewStandardTableImport', { ...request, path, formatConfirmed: true });
      }
    });
  }));
}
