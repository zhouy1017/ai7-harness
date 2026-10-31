import { buildIdentityLine, currentBuildIdentity, requireMatchingVersions } from '../shared/build-identity.js';
import { DATA_VERSION_DATA, DATA_VERSION_HEADING, DATA_VERSION_MARKER, DATA_VERSION_MEANING, DATA_VERSION_PROMISE, DATA_VERSION_SOFTWARE, DATA_VERSION_UNAVAILABLE, DATA_VERSION_UPDATE, DATA_VERSION_UPGRADE, dataVersionRecordsLabel, dataVersionRollbackSteps, dataVersionStateLine, dataVersionUpdateLine, dataVersionUpgradeBackupLine, dataVersionUpgradeLine, dataVersionMarkerLine, storeVersionLine } from './data-version-labels.js';
import { mountDatabaseExport } from './database-export.js';
import { mountDatabaseImport } from './database-import.js';
import { mountScheduledBackup } from './scheduled-backup.js';
import { localInstantLabel } from './plan-preview-labels.js';
import { PREFERENCES_LOCAL_LINE } from './shell-labels.js';
import { DISTRIBUTION_CHANNEL_ROW } from './distribution-channel-labels.js';
import type { ShellPlace } from './shell.js';

/** The shell's helpers and routes used by 数据与存储. */
export interface DataStorageOptions {
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly panel: () => HTMLElement;
  readonly element: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K];
  readonly button: (label: string, className: 'primary' | 'secondary' | 'quiet', action: () => void | Promise<void>) => HTMLButtonElement;
  readonly rendererErrorMessage: (error: unknown, fallback: string) => string;
  readonly initializeStartup: () => Promise<void>;
  readonly technicalDetails: (gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>) => HTMLElement;
  readonly replaceScreen: (state: string, content: HTMLElement, place?: ShellPlace | null) => void;
}

/** 数据与存储, moved verbatim from the shell (Issue #1235). */
export function createDataStorage(options: DataStorageOptions) {
  const {
    setStatus, panel, element, button, rendererErrorMessage, initializeStartup, technicalDetails, replaceScreen,
  } = options;

  async function renderDataAndStorage(): Promise<void> {
    setStatus('正在读取本机数据位置…', 'busy');
    try {
      const projection = await window.ai7.getProductDataLocation();
      const content = panel();
      content.classList.add('data-storage-summary');
      content.dataset['platform'] = projection.platform;
      content.dataset['runtimeForm'] = projection.runtimeForm;
      content.dataset['channel'] = projection.channel;
      content.dataset['footprintComplete'] = String(projection.footprint.complete);
      content.dataset['footprintMaximumEntries'] = String(projection.footprint.maximumEntries);
      content.append(
        element('p', 'section-label', '设置 · 数据与存储'),
        element('h2', undefined, '数据与存储摘要'),
        element('p', 'lede', '这里显示当前运行实例实际使用的本机产品数据位置。查看位置不会更改存储、导出内容或授予文件系统权限。'),
      );
      const summary = element('section', 'source-card');
      const values = element('dl');
      // The one value this screen exists to state (V2-UX-LAYER-001: what the surface is about) — an editor
      // came here to read where their data lives. Demoting it would put the answer behind a disclosure on
      // the screen whose whole purpose is to give it, so it reads at full rank, not as technical identity.
      const root = element('dd', undefined, projection.canonicalRoot);
      root.dataset['productDataRoot'] = projection.canonicalRoot;
      values.append(
        element('dt', undefined, '当前平台'), element('dd', undefined, projection.platformLabel),
        element('dt', undefined, '运行方式'), element('dd', undefined, projection.runtimeFormLabel),
        element('dt', undefined, DISTRIBUTION_CHANNEL_ROW), element('dd', undefined, projection.channelLabel),
        element('dt', undefined, '数据保存在'), element('dd', undefined, projection.locationLabel),
        element('dt', undefined, '实际位置'), root,
        element('dt', undefined, '本机占用'), element('dd', undefined, projection.footprint.label),
      );
      // The shell's own file stays on this machine (Issue #934): it is not a record and 导出数据库 does not carry it.
      summary.append(element('h3', undefined, '产品数据位置'), values, element('p', 'field-note preferences-local-line', PREFERENCES_LOCAL_LINE));
      summary.append(element('p', 'field-note', projection.channelDescription));
      if (projection.dataLocationException !== null) summary.dataset['dataLocationException'] = projection.dataLocationException;
      if (projection.syncWarning !== null) summary.append(element('p', 'field-note', projection.syncWarning));
      const credentials = element('section', 'review-section');
      credentials.append(
        element('h3', undefined, '凭据与产品数据分开'),
        element('p', undefined, projection.separationLabel),
        element('p', 'field-note', `当前系统保护位置：${projection.protectedSecretStoreLabel}。复制产品数据不会复制模型服务凭据。`),
      );
      const reveal = button('查看数据位置', 'secondary', async () => {
        reveal.disabled = true;
        try {
          const result = await window.ai7.revealProductDataLocation();
          content.dataset['revealRequested'] = result.state;
          content.dataset['nativeRevealSuppressedForE2e'] = String(result.nativeRevealSuppressedForE2e);
          setStatus('已请求系统显示当前产品数据位置。', 'success');
        } catch (error) {
          setStatus(rendererErrorMessage(error, '系统无法显示当前产品数据位置。'), 'error');
        } finally {
          reveal.disabled = false;
        }
      });
      reveal.dataset['action'] = 'reveal-product-data-location';
      // 查看数据位置 is the location's own action, so it stays with the location — and stays the screen's first keyboard
      // stop — whatever sections follow the credentials (Issue #433: 版本, DSTO-016).
      const revealRow = element('div', 'button-row');
      revealRow.append(reveal);
      summary.append(revealRow);
      const actions = element('div', 'button-row');
      actions.append(button('返回', 'quiet', () => void initializeStartup()));
      // 版本 (Issue #433, S85a; DSTO-016): the software version and the Data Version apart, read from the store.
      const versions = element('section', 'source-card data-version');
      versions.append(element('h3', undefined, DATA_VERSION_HEADING), element('p', 'field-note', '正在读取版本…'));
      // 导出数据库 (Issue #434, S86a; DSTO-017): the one file, through the system's Save dialog and an approval as stated.
      const databaseExport = element('section', 'source-card');
      // 导入数据库 (Issue #434, S86c; DSTO-017): the file previewed whole, then the one choice, never preselected, of what to do.
      const databaseImport = element('section', 'source-card');
      // 定期自动备份 (Issue #434, S86b; DSTO-018): the switch, off by default, and the backups kept beside the data.
      const scheduledBackup = element('section', 'source-card');
      content.append(summary, credentials, versions, databaseExport, databaseImport, scheduledBackup, actions);
      mountDatabaseExport({ root: databaseExport, api: window.ai7, setStatus, errorMessage: rendererErrorMessage, instant: localInstantLabel });
      mountDatabaseImport({ root: databaseImport, api: window.ai7, setStatus, errorMessage: rendererErrorMessage, instant: localInstantLabel });
      mountScheduledBackup({ root: scheduledBackup, api: window.ai7, setStatus, errorMessage: rendererErrorMessage, instant: localInstantLabel });
      void window.ai7.inspectDataVersion().then((version) => {
        if (!versions.isConnected) return;
        const identity = currentBuildIdentity();
        requireMatchingVersions(identity, version);
        versions.dataset['dataVersion'] = String(version.dataVersion);
        versions.dataset['softwareVersion'] = version.softwareVersion;
        versions.dataset['frozen'] = String(version.frozen);
        const rows = element('dl');
        rows.append(
          element('dt', undefined, DATA_VERSION_SOFTWARE), element('dd', 'data-version-software', version.softwareVersion),
          element('dt', undefined, '构建来源'), element('dd', 'data-version-build', buildIdentityLine(identity)),
          element('dt', undefined, DATA_VERSION_DATA), element('dd', 'data-version-data', String(version.dataVersion)),
          element('dt', undefined, DATA_VERSION_MEANING), element('dd', 'data-version-state', dataVersionStateLine(version)),
          element('dt', undefined, DATA_VERSION_UPDATE), element('dd', 'data-version-update', dataVersionUpdateLine(version.update)),
        );
        // An upgrade to a later Data Version (Issue #433, S85b; DSTO-016): what changed, the backup made first, and how to go back.
        versions.dataset['upgrades'] = String(version.upgrades.length);
        const upgraded = version.upgrades[0];
        if (upgraded !== undefined) {
          const lines = element('dd', 'data-version-upgrade');
          lines.append(
            element('p', undefined, dataVersionUpgradeLine(upgraded, localInstantLabel)),
            element('p', 'field-note', dataVersionUpgradeBackupLine(upgraded)),
          );
          // Going back uses the earlier complete backup when this upgrade began from an unfinished one's middle state, so the steps
          // stand while that backup does, whatever became of this upgrade's own (Issue #433 review).
          if (upgraded.rollback?.backupPresent ?? upgraded.backupPresent) {
            const rollback = dataVersionRollbackSteps(upgraded, { dataRoot: projection.canonicalRoot, backupLocation: version.backupLocation });
            const steps = element('ol', 'data-version-rollback');
            for (const step of rollback.steps) steps.append(element('li', 'field-note', step));
            lines.append(element('p', 'field-note', rollback.lead), steps);
          }
          rows.append(element('dt', undefined, DATA_VERSION_UPGRADE), lines);
        }
        const history = element('details', 'data-version-history');
        const list = element('ol');
        for (const record of version.history) list.append(element('li', undefined, storeVersionLine(record, localInstantLabel)));
        history.append(element('summary', undefined, dataVersionRecordsLabel(version.history.length, version.historyTruncated)), list);
        versions.replaceChildren(
          element('h3', undefined, DATA_VERSION_HEADING),
          element('p', 'field-note data-version-promise', DATA_VERSION_PROMISE),
          rows,
          history,
          technicalDetails(undefined, element('dt', undefined, '数据库修订'), element('dd', 'technical-identity', String(version.schemaRevision)),
            element('dt', undefined, DATA_VERSION_MARKER), element('dd', 'data-version-marker', dataVersionMarkerLine(version.marker, localInstantLabel))),
        );
      }, (error: unknown) => {
        if (!versions.isConnected) return;
        versions.replaceChildren(element('h3', undefined, DATA_VERSION_HEADING), element('p', 'attention-note', rendererErrorMessage(error, DATA_VERSION_UNAVAILABLE)));
      });
      replaceScreen('data-storage', content);
      setStatus('数据与存储摘要已打开');
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法读取本机数据位置。'), 'error');
    }
  }

  return { renderDataAndStorage };
}
