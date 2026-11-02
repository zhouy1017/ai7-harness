import { basename, extname, isAbsolute, resolve } from 'node:path';
import { app, dialog } from 'electron';
import { USAGE_CSV_DIALOG, usageCsvFileName } from '../shared/usage-labels.js';
import { requireDesktop } from './handler-guards.js';
import type { OwnedRendererWindow } from './application-types.js';

export function createFilePickers(context: {
  consumeInjectedSavePath: () => string | undefined;
  consumeInjectedFolderPath: () => string | undefined;
}) {
  const { consumeInjectedSavePath, consumeInjectedFolderPath } = context;
  const chooseManuscript = async (owned: OwnedRendererWindow): Promise<string | undefined> => {
    let selectedPath = owned.injectedPickerPath;
    owned.injectedPickerPath = undefined;
    if (!selectedPath) {
      // Intake accepts a file whatever its extension and identifies the format from its content
      // (ADR 0072 §1), so the picker suggests the recognised formats without restricting to them.
      const selected = await dialog.showOpenDialog(owned.window, {
        title: '选择要导入的稿件文件',
        buttonLabel: '选择稿件',
        properties: ['openFile'],
        filters: [
          { name: '稿件文件', extensions: ['docx', 'doc', 'pdf', 'odt', 'rtf', 'txt', 'md'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (selected.canceled || selected.filePaths.length !== 1) return undefined;
      selectedPath = selected.filePaths[0];
    }
    requireDesktop(selectedPath !== undefined && isAbsolute(selectedPath));
    return selectedPath;
  };

  /**
   * 导入新版本 of a review guideline document (Issue #427, S79a): the platform's own open dialog, suggesting Word and plain
   * text. J-15 alone answers it through its picker control, which serves one choice per window as the manuscript picker's.
   */
  const chooseGuidelineFile = async (owned: OwnedRendererWindow): Promise<string | undefined> => {
    let selectedPath = owned.injectedPickerPath;
    owned.injectedPickerPath = undefined;
    if (!selectedPath) {
      const selected = await dialog.showOpenDialog(owned.window, {
        title: '选择审阅规范文件',
        buttonLabel: '选择文件',
        properties: ['openFile'],
        filters: [
          { name: '审阅规范文件', extensions: ['docx', 'txt', 'md'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (selected.canceled || selected.filePaths.length !== 1) return undefined;
      selectedPath = selected.filePaths[0];
    }
    requireDesktop(selectedPath !== undefined && isAbsolute(selectedPath));
    return selectedPath;
  };

  /**
   * 放入资料… (Issue #427, S79c): the platform's own open dialog. 资料库 keeps a file whole whatever it is and names its format
   * from its content, so the dialog suggests the usual ones without restricting to them. J-15 answers it through its picker
   * control, and J-07 through its own for the 资料库 item its last 写作任务 lists (Issue #428); each serves one choice per window
   * as the manuscript picker's.
   */
  const chooseLibraryMaterialFile = async (owned: OwnedRendererWindow): Promise<string | undefined> => {
    let selectedPath = owned.injectedPickerPath;
    owned.injectedPickerPath = undefined;
    if (!selectedPath) {
      const selected = await dialog.showOpenDialog(owned.window, {
        title: '选择要放入资料库的文件',
        buttonLabel: '放入资料库',
        properties: ['openFile'],
        filters: [
          { name: '图书、论文、资料与网页', extensions: ['pdf', 'epub', 'docx', 'doc', 'odt', 'rtf', 'txt', 'md', 'html', 'htm'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (selected.canceled || selected.filePaths.length !== 1) return undefined;
      selectedPath = selected.filePaths[0];
    }
    requireDesktop(selectedPath !== undefined && isAbsolute(selectedPath));
    return selectedPath;
  };

  /**
   * 选择保存位置… (Issue #413): the platform's own Save dialog, which owns an existing file's replace-or-rename
   * choice (V2-UX-EXP-019), offering the review's file name in the documents folder. J-07 alone may answer it
   * once with a launch control instead, exactly as it answers the picker; `undefined` is a cancelled dialog.
   */
  const chooseExportDestination = async (owned: OwnedRendererWindow, suggestedFileName: unknown, formatInput: unknown): Promise<string | undefined> => {
    // The format the review was of (Issue #500, S64b): the dialog offers its extension, and the service checks it again.
    requireDesktop(formatInput === undefined || formatInput === 'docx' || formatInput === 'pdf' || formatInput === 'markdown');
    const format = EXPORT_DIALOG_FORMATS[(formatInput ?? 'docx') as keyof typeof EXPORT_DIALOG_FORMATS];
    const injected = consumeInjectedSavePath();
    if (injected === 'cancel' && process.env.AI7_E2E_JOURNEY === 'J-07') return undefined;
    if (injected !== undefined) {
      requireDesktop(isAbsolute(injected));
      return injected;
    }
    const offered = typeof suggestedFileName === 'string' && suggestedFileName.isWellFormed()
      ? basename(suggestedFileName).replace(/[\\/:*?"<>|]/gu, '_').slice(0, 180)
      : '';
    const fileName = extname(offered).toLowerCase() === `.${format.extension}` ? offered : `稿件.${format.extension}`;
    const chosen = await dialog.showSaveDialog(owned.window, {
      title: '选择导出位置',
      buttonLabel: '选择此位置',
      defaultPath: resolve(app.getPath('documents'), fileName),
      filters: [{ name: format.name, extensions: [format.extension] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (chosen.canceled || chosen.filePath === undefined || chosen.filePath.length === 0) return undefined;
    requireDesktop(isAbsolute(chosen.filePath));
    return chosen.filePath;
  };

  /**
   * 导出为文件… of a 开发建议 (Issue #65, S30; ADR 0087 §6): the platform's own Save dialog, which owns an existing file's
   * replace-or-rename choice, offering the proposal's own file name in the documents folder. J-13 alone may answer it once with
   * a launch control instead; `undefined` is a cancelled dialog. The proposal holds no Book material.
   */
  const chooseDeveloperProposalFile = async (owned: OwnedRendererWindow, suggestedFileName: string): Promise<string | undefined> => {
    const injected = consumeInjectedSavePath();
    if (injected !== undefined) {
      requireDesktop(isAbsolute(injected));
      return injected;
    }
    const chosen = await dialog.showSaveDialog(owned.window, {
      title: '选择开发建议的保存位置',
      buttonLabel: '保存到此位置',
      defaultPath: resolve(app.getPath('documents'), suggestedFileName),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (chosen.canceled || chosen.filePath === undefined || chosen.filePath.length === 0) return undefined;
    requireDesktop(isAbsolute(chosen.filePath));
    return chosen.filePath;
  };

  /**
   * 导出数据库… (Issue #434, S86a; DSTO-017): the platform's own Save dialog for the database package, which owns an existing
   * file's replace-or-rename choice (EXP-019), offering `AI7 数据库 <date>.ai7db` in the documents folder. J-12 alone may answer
   * it once with a launch control instead; `undefined` is a cancelled dialog.
   */
  const chooseDatabaseExportFile = async (owned: OwnedRendererWindow): Promise<string | undefined> => {
    const injected = consumeInjectedSavePath();
    if (injected !== undefined) {
      requireDesktop(isAbsolute(injected));
      return injected;
    }
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const chosen = await dialog.showSaveDialog(owned.window, {
      title: '选择导出数据库的位置',
      buttonLabel: '选择此位置',
      defaultPath: resolve(app.getPath('documents'), `AI7 数据库 ${date}.ai7db`),
      filters: [{ name: 'AI7 数据库', extensions: ['ai7db'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (chosen.canceled || chosen.filePath === undefined || chosen.filePath.length === 0) return undefined;
    requireDesktop(isAbsolute(chosen.filePath));
    return chosen.filePath;
  };

  /** 导出为 CSV… of 用量 (Issue #936, S11c): the platform's own Save dialog; `undefined` is a cancelled dialog. */
  const chooseUsageCsvFile = async (owned: OwnedRendererWindow): Promise<string | undefined> => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const chosen = await dialog.showSaveDialog(owned.window, {
      title: USAGE_CSV_DIALOG.title,
      buttonLabel: USAGE_CSV_DIALOG.button,
      defaultPath: resolve(app.getPath('documents'), usageCsvFileName(date)),
      filters: [{ name: USAGE_CSV_DIALOG.filter, extensions: ['csv'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (chosen.canceled || chosen.filePath === undefined || chosen.filePath.length === 0) return undefined;
    requireDesktop(isAbsolute(chosen.filePath));
    return chosen.filePath;
  };

  /**
   * 导入数据库… (Issue #434, S86c; DSTO-017): the platform's own Open dialog, suggesting AI7's database files. J-12 alone answers
   * it through its picker control, which serves one choice per window as the manuscript picker's; `undefined` is a cancelled
   * dialog.
   */
  const chooseDatabaseImportFile = async (owned: OwnedRendererWindow): Promise<string | undefined> => {
    let selectedPath = owned.injectedPickerPath;
    owned.injectedPickerPath = undefined;
    if (!selectedPath) {
      const selected = await dialog.showOpenDialog(owned.window, {
        title: '选择要导入的数据库文件',
        buttonLabel: '选择此文件',
        defaultPath: app.getPath('documents'),
        properties: ['openFile'],
        filters: [
          { name: 'AI7 数据库', extensions: ['ai7db'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (selected.canceled || selected.filePaths.length !== 1) return undefined;
      selectedPath = selected.filePaths[0];
    }
    requireDesktop(selectedPath !== undefined && isAbsolute(selectedPath));
    return selectedPath;
  };

  /**
   * The system's own folder dialog for a 图书交付包 export (Issue #416, S67b; EXP-019, EXP-020): the editor chooses a folder,
   * or makes a new one in the dialog. J-07 answers it once with a launch control instead; `undefined` is a cancelled dialog.
   */
  const chooseExportFolder = async (owned: OwnedRendererWindow): Promise<string | undefined> => {
    const injected = consumeInjectedFolderPath();
    if (injected !== undefined) {
      requireDesktop(isAbsolute(injected));
      return injected;
    }
    const chosen = await dialog.showOpenDialog(owned.window, {
      title: '选择导出图书交付包的文件夹',
      buttonLabel: '导出到此文件夹',
      defaultPath: app.getPath('documents'),
      // `createDirectory` makes a new folder inside the dialog on macOS; Windows' dialog makes one by itself. Windows'
      // `promptToCreate` would answer with a folder that does not exist yet, which AI7 never creates, so it is not asked.
      properties: ['openDirectory', 'createDirectory'],
    });
    const folder = chosen.canceled ? undefined : chosen.filePaths[0];
    if (folder === undefined || folder.length === 0) return undefined;
    requireDesktop(isAbsolute(folder));
    return folder;
  };

  const choosePackageArchiveFile = async (owned: OwnedRendererWindow): Promise<string | undefined> => {
    const injected = consumeInjectedSavePath();
    if (injected !== undefined) { requireDesktop(isAbsolute(injected)); return injected; }
    const chosen = await dialog.showSaveDialog(owned.window, {
      title: '选择导出图书交付包压缩包的位置', buttonLabel: '选择此位置',
      defaultPath: resolve(app.getPath('documents'), '图书交付包.zip'),
      filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (chosen.canceled || !chosen.filePath) return undefined;
    requireDesktop(isAbsolute(chosen.filePath));
    return chosen.filePath;
  };
  return { chooseManuscript, chooseGuidelineFile, chooseLibraryMaterialFile, chooseExportDestination, chooseDeveloperProposalFile, chooseDatabaseExportFile, chooseUsageCsvFile, chooseDatabaseImportFile, chooseExportFolder, choosePackageArchiveFile };
}

const EXPORT_DIALOG_FORMATS = {
  docx: { extension: 'docx', name: 'Word 文档' },
  pdf: { extension: 'pdf', name: 'PDF 文档' },
  markdown: { extension: 'md', name: 'Markdown 文本' },
} as const;

export type NativeFilePickers = ReturnType<typeof createFilePickers>;
