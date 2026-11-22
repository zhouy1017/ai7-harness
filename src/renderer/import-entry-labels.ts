/**
 * The words of the two ways a new file reaches the import page from a Book that already has work in it (Issue #1682):
 * 「导入新版本…」 and the question a dropped file asks. 更新稿件 and 存为来源材料 are the import page's own two relationships.
 */
export const IMPORT_ENTRY_WORDS = {
  newVersion: '导入新版本…',
  question: (fileName: string) => `「${fileName}」要怎样导入？`,
  update: '更新稿件',
  asSource: '存为来源材料',
  asDerivative: '存为衍生稿件',
  cancel: '取消',
  notDocx: '请拖入 DOCX 格式的文件。',
  pickerCancelled: '已取消文件选择',
  parsing: '正在本地解析 DOCX…',
  startFailed: '无法开始导入新版本。',
  dropFailed: '无法导入拖入的 DOCX。',
  derivativeFormUnavailable: '现在不能新建衍生稿件，请稍后再试。',
} as const;
