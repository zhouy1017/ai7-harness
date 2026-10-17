export const DIAGNOSTICS_TITLE = '诊断';
export const DIAGNOSTICS_BREADCRUMB = '设置 · 本机';
export const DIAGNOSTICS_OPENED = '本机诊断已打开';
export const CRASH_LIST_HEADING = '本机崩溃记录';
export const CRASH_LIST_LOADING = '正在读取本机崩溃记录…';
export const CRASH_LIST_EMPTY = '暂无崩溃记录。';
export const CRASH_LIST_FAILED = '无法读取本机崩溃记录，请稍后重试。';
export const CRASH_RECORD_VIEW = '查看';
export const CRASH_KIND_FALLBACK = '异常';
export const DIAGNOSTICS_EXCLUSIONS = '诊断包不含数据库、书稿、暂存文件、导出文件、模型缓存或凭据；仅保存到本机，不上传。';
export const DIAGNOSTICS_BUNDLE_ACTION = '导出诊断包…';
export const DIAGNOSTICS_BUNDLE_SAVED = '诊断包已保存到所选文件夹。';
export const DIAGNOSTICS_BUNDLE_CANCELLED = '已取消保存诊断包。';
export const DIAGNOSTICS_LOCATION_ACTION = '查看诊断位置';
export const DIAGNOSTICS_LOCATION_REQUESTED = '已请求系统显示本机崩溃记录位置。';
export const DIAGNOSTICS_ACTION_FAILED = '无法完成本机诊断操作，请稍后重试。';
export const DIAGNOSTICS_BACK = '返回';
export const CRASH_KIND_LABELS: Readonly<Record<string, string>> = {
  'render-process-gone': '界面进程退出', 'child-process-gone': '子进程退出',
  uncaughtException: '未处理异常', unhandledRejection: '未处理的异步异常', 'service-exit': '本地服务异常退出',
};
