/**
 * Offline, a plan whose Task kind has no Connectivity Wait is started later (Issue #706; #714): the one sentence the Task
 * Drawer's bar shows beside its disabled 开始任务 and a 快速开始 that stopped at the plan records as its reason. One owner in the
 * shared layer, so the renderer's label and the service's reason never drift; the service's form ends the sentence with 。, as
 * every quick-start reason does, and the bar's form carries no final stop, as every bar reason does.
 */
export const OFFLINE_START_LATER = '离线：这份计划要连到模型服务，而这台设备现在没有网络；联网后再开始' as const;
