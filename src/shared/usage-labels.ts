/** Shared words for usage projections and the native CSV save dialog (#936). */
export const USAGE_EMPTY_LABEL = '尚无用量' as const;
export const UNBOUND_ROUTE_LABEL = '未绑定模型服务';
export const USAGE_CSV_DIALOG = { title: '选择用量表的保存位置', button: '保存到此位置', filter: 'CSV 表格' } as const;
export const usageCsvFileName = (day: string): string => `AI7 用量 ${day}.csv`;
