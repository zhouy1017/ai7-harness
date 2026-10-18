// Distribution channel words (Issue #966, wave 14 slice 14a; PLAT-007, DSTO-002..006): the 分发渠道 row of 设置 › 数据与存储,
// the one plain sentence that says where each channel keeps product data, the portable fallback notice and the sync warning.
// Main projects them; none needs filesystem notation.

export const DISTRIBUTION_CHANNEL_ROW = '分发渠道';

/** The marker names the channel; a missing or unknown marker is said honestly, never guessed. */
export const CHANNEL_LABELS = Object.freeze({
  'source-checkout': '源码检出', 'windows-installer': '安装版', 'windows-portable': '便携版',
  'macos-dmg': 'macOS 磁盘映像', packaged: '未知渠道',
} as const);

export const CHANNEL_DESCRIPTIONS = Object.freeze({
  'source-checkout': '源码检出运行，产品数据保存在独立的本机位置。',
  'windows-installer': '产品数据在本机用户数据区。',
  'windows-portable': '程序文件与产品数据分别放在 AI7 文件夹内的两个区域；移动或复制文件夹会带走产品数据，但不会带走模型服务凭据。',
  'macos-dmg': '产品数据在 macOS 的应用支持目录。',
  packaged: '未能识别分发渠道；这里显示实际使用的数据位置。',
} as const);

/** DSTO-005: the Data Location Exception State, no longer described as self-contained. */
export const PORTABLE_UNWRITABLE_NOTICE = '便携文件夹无法写入，产品数据已保存在本机用户数据区；复制 AI7 文件夹不会带走这些数据。';

/** DSTO-006: informs without blocking or moving anything. */
export const SYNC_LOCATION_WARNING = '此位置可能由同步或备份服务复制，未公开的编辑材料也可能被该服务带走；AI7 没有移动数据或公开发布内容。';
