export const DIAGNOSTICS_TITLE = '诊断';
export const CRASH_LIST_HEADING = '本机崩溃记录';
export const DIAGNOSTICS_EXCLUSIONS = '诊断包不含数据库、书稿、暂存文件、导出文件、模型缓存或凭据；仅保存到本机，不上传。';
export const CRASH_KIND_LABELS: Readonly<Record<string, string>> = {
  'render-process-gone': '界面进程退出', 'child-process-gone': '子进程退出',
  uncaughtException: '未处理异常', unhandledRejection: '未处理的异步异常', 'service-exit': '本地服务异常退出',
};
