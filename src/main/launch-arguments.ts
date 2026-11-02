import { release } from 'node:os';
import { isAbsolute } from 'node:path';
import {
  J04_MODEL_ADAPTER_CONTROL_PATTERN,
  PROVIDER_CACHE_ROOT_ARGUMENT,
  RUN_BUDGET_CEILING_ARGUMENT,
  BACKGROUND_QUIET_ARGUMENT,
  CALIBRATION_MIN_BOOKS_ARGUMENT,
  EDIT_JOURNAL_FAULT_CONTROL_ARGUMENT,
  editJournalFaultControlAdmitted,
  calibrationMinBooksForLaunch,
  parseBackgroundQuietMs,
  TRUSTED_SCOPE_ARGUMENT,
  VALIDATION_CASE_ARGUMENT,
  VALIDATION_DELTA_ARGUMENT,
  parseTrustedLaunchForm,
  type J01ImportControl,
  type J03ForegroundExecutionControl,
  type J04ModelAdapterControl,
  type J08RecoveryControl,
  type TrustedLaunchForm,
} from '../shared/protocol.js';
import { requireDesktop } from './handler-guards.js';

export interface LaunchArguments {
  dataRoot: string | undefined;
  allowFirstRunChooser: boolean;
  /** The trusted launch form (ADR 0065): scope, ceiling, and cache root exactly as the launcher passed them. */
  launchForm: TrustedLaunchForm;
  injectedPickerPath: string | undefined;
  /** J-07 only (Issue #413): the one answer the Save dialog gives, once, in place of the platform's own. */
  injectedSavePath: string | undefined;
  /** J-07's answer to the folder dialog of a 图书交付包 export (Issue #416, S67b): single-use, like the Save dialog's. */
  injectedFolderPath: string | undefined;
  injectedDiagnosticsFolder: string | undefined;
  importControl: J01ImportControl | undefined;
  foregroundExecutionControl: J03ForegroundExecutionControl | undefined;
  recoveryControl: J08RecoveryControl | undefined;
  modelAdapterControl: J04ModelAdapterControl | undefined;
  /** J-04 only (Issue #502): the file whose word, `offline`, the service reads as this device's connectivity. */
  connectivityPath: string | undefined;
  /** J-10 only (Issue #422): the file whose number says how many units may settle; a unit waits, in flight, for it. */
  unitHoldPath: string | undefined;
  /** J-16 only (Issue #52, S17a): the file whose number says how many text deltas a dialogue answer may stream. */
  answerHoldPath: string | undefined;
  /** J-09 only (Issue #95, S39): the 后台分析登记 quiet period in milliseconds, within its bounds. */
  backgroundQuietMs: number | undefined;
  /** J-11 only (Issue #429, EVAL-011a): the calibration gate in Books, 2–10, so the Journey proves the house offset with two Books. */
  calibrationMinBooks: number | undefined;
  /** J-05 only: the first Apply commits and its acknowledgement is withheld from the renderer, once. */
  applyControl: 'lose-first-acknowledgement' | undefined;
  observeJ12Reveal: boolean;
  launcherPid: number;
  /** J-02 only (Issue #951, T0-1): the Edit Journal write-failure injection may be set; every other launch refuses it. */
  journalFaultArmed: boolean;
}

export function parseArguments(argv: string[]): LaunchArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    requireDesktop(
      key !== undefined &&
        value !== undefined &&
        !values.has(key) &&
        (key === '--data-root' ||
          key === '--allow-first-run-chooser' ||
          key === '--j01-picker-path' ||
          key === '--j02-picker-path' ||
          key === '--j08-picker-path' ||
          key === '--j12-picker-path' ||
          key === '--j03-picker-path' ||
          key === '--j04-picker-path' ||
          key === '--j05-picker-path' ||
          key === '--j06-picker-path' ||
          key === '--j07-picker-path' ||
          key === '--j09-picker-path' ||
          key === '--j10-picker-path' ||
          key === '--j16-picker-path' ||
          key === '--j15-picker-path' ||
          key === '--j11-picker-path' ||
          key === '--j13-picker-path' ||
          key === '--j07-save-path' ||
          key === '--j07-folder-path' ||
          key === '--j12-diagnostics-folder' ||
          key === '--j04-save-path' ||
          key === '--j12-save-path' ||
          key === '--j11-save-path' ||
          key === '--j13-save-path' ||
          key === '--j01-import-control' ||
          key === '--j03-foreground-execution-control' ||
          key === '--j08-recovery-control' ||
          key === EDIT_JOURNAL_FAULT_CONTROL_ARGUMENT ||
          key === '--j04-model-adapter' ||
          key === '--j04-connectivity-path' ||
          key === '--j10-unit-hold-path' ||
          key === '--j16-answer-hold-path' ||
          key === CALIBRATION_MIN_BOOKS_ARGUMENT ||
          key === BACKGROUND_QUIET_ARGUMENT ||
          key === '--j05-apply-control' ||
          key === '--j12-observe-reveal' ||
          key === '--launcher-pid' ||
          key === TRUSTED_SCOPE_ARGUMENT ||
          key === RUN_BUDGET_CEILING_ARGUMENT ||
          key === PROVIDER_CACHE_ROOT_ARGUMENT ||
          key === VALIDATION_CASE_ARGUMENT ||
          key === VALIDATION_DELTA_ARGUMENT),
    );
    values.set(key, value);
  }
  const dataRoot = values.get('--data-root');
  requireDesktop(dataRoot === undefined || isAbsolute(dataRoot));
  // The trusted launch form: an unknown scope, a malformed ceiling, a relative cache root, or a developer-live launch that
  // names no development validation denies startup.
  const launchForm = parseTrustedLaunchForm({
    trustedOperationalScope: values.get(TRUSTED_SCOPE_ARGUMENT),
    runBudgetCeiling: values.get(RUN_BUDGET_CEILING_ARGUMENT),
    providerCacheRoot: values.get(PROVIDER_CACHE_ROOT_ARGUMENT),
    validationCase: values.get(VALIDATION_CASE_ARGUMENT),
    validationDelta: values.get(VALIDATION_DELTA_ARGUMENT),
  });
  requireDesktop(launchForm !== null);
  const allowFirstRunChooser = values.get('--allow-first-run-chooser') === 'true';
  requireDesktop(!values.has('--allow-first-run-chooser') || (allowFirstRunChooser && dataRoot === undefined && launchForm.trustedOperationalScope === 'ordinary-production'));
  requireDesktop(dataRoot !== undefined || allowFirstRunChooser);
  if (allowFirstRunChooser) requireDesktop([...values.keys()].every((key) => ['--allow-first-run-chooser', '--trusted-operational-scope', '--launcher-pid'].includes(key)));
  requireDesktop(launchForm.providerCacheRoot === null || isAbsolute(launchForm.providerCacheRoot));
  const j01PickerPath = values.get('--j01-picker-path');
  const j02PickerPath = values.get('--j02-picker-path');
  const j08PickerPath = values.get('--j08-picker-path');
  const j12PickerPath = values.get('--j12-picker-path');
  const j03PickerPath = values.get('--j03-picker-path');
  const j04PickerPath = values.get('--j04-picker-path');
  const j05PickerPath = values.get('--j05-picker-path');
  const j06PickerPath = values.get('--j06-picker-path');
  const j07PickerPath = values.get('--j07-picker-path');
  const j09PickerPath = values.get('--j09-picker-path');
  const j10PickerPath = values.get('--j10-picker-path');
  const j16PickerPath = values.get('--j16-picker-path');
  // J-15's picker serves 导入新版本 of a review guideline document (Issue #427, S79a).
  const j15PickerPath = values.get('--j15-picker-path');
  // J-11's picker imports the manuscript its 评估 evaluates (Issue #429, S81a).
  const j11PickerPath = values.get('--j11-picker-path');
  // J-13's picker imports the member Book whose words become a Series Knowledge Candidate (Issue #63, S28b).
  const j13PickerPath = values.get('--j13-picker-path');
  requireDesktop(
    [j01PickerPath, j02PickerPath, j08PickerPath, j12PickerPath, j03PickerPath, j04PickerPath, j05PickerPath, j06PickerPath, j07PickerPath, j09PickerPath,
      j10PickerPath, j16PickerPath, j15PickerPath, j11PickerPath, j13PickerPath].filter(Boolean).length <= 1,
  );
  // The picker-path launch controls carry whatever their Journey selects, in any recognised format
  // or none, so each one asks only that it is its own Journey's absolute path.
  requireDesktop(
    j01PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-01' && isAbsolute(j01PickerPath)),
  );
  requireDesktop(
    j02PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-02' && isAbsolute(j02PickerPath)),
  );
  requireDesktop(
    j08PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-08' && isAbsolute(j08PickerPath)),
  );
  requireDesktop(
    j12PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-12' && isAbsolute(j12PickerPath)),
  );
  requireDesktop(
    j03PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-03' && isAbsolute(j03PickerPath)),
  );
  requireDesktop(
    j04PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-04' && isAbsolute(j04PickerPath)),
  );
  requireDesktop(
    j05PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-05' && isAbsolute(j05PickerPath)),
  );
  requireDesktop(
    j06PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-06' && isAbsolute(j06PickerPath)),
  );
  requireDesktop(
    j07PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-07' && isAbsolute(j07PickerPath)),
  );
  requireDesktop(
    j09PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-09' && isAbsolute(j09PickerPath)),
  );
  requireDesktop(
    j10PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-10' && isAbsolute(j10PickerPath)),
  );
  requireDesktop(
    j16PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-16' && isAbsolute(j16PickerPath)),
  );
  requireDesktop(
    j15PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-15' && isAbsolute(j15PickerPath)),
  );
  requireDesktop(
    j11PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-11' && isAbsolute(j11PickerPath)),
  );
  requireDesktop(
    j13PickerPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-13' && isAbsolute(j13PickerPath)),
  );
  const injectedPickerPath =
    j01PickerPath ?? j02PickerPath ?? j08PickerPath ?? j12PickerPath ?? j03PickerPath ?? j04PickerPath ?? j05PickerPath ?? j06PickerPath ??
      j07PickerPath ?? j09PickerPath ?? j10PickerPath ?? j16PickerPath ?? j15PickerPath ?? j11PickerPath ?? j13PickerPath;
  // The Save dialog's launch control is guarded exactly as the picker controls are: each Journey's own, and absolute —
  // J-07's for its exports, J-04's for the 审阅报告's (Issue #500, S64b part 2).
  const j07SavePath = values.get('--j07-save-path');
  const j04SavePath = values.get('--j04-save-path');
  // J-12's for 导出数据库 (Issue #434, S86a).
  const j12SavePath = values.get('--j12-save-path');
  requireDesktop(j07SavePath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-07' && (isAbsolute(j07SavePath) || j07SavePath === 'cancel')));
  requireDesktop(j04SavePath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-04' && isAbsolute(j04SavePath)));
  requireDesktop(j12SavePath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-12' && isAbsolute(j12SavePath)));
  // J-11's for a 审稿意见 draft's DOCX (Issue #429, S81c).
  const j11SavePath = values.get('--j11-save-path');
  requireDesktop(j11SavePath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-11' && isAbsolute(j11SavePath)));
  // J-13's for a 开发建议's 导出为文件… (Issue #65, S30).
  const j13SavePath = values.get('--j13-save-path');
  requireDesktop(j13SavePath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-13' && isAbsolute(j13SavePath)));
  const injectedSavePath = j07SavePath ?? j04SavePath ?? j12SavePath ?? j11SavePath ?? j13SavePath;
  const injectedFolderPath = values.get('--j07-folder-path');
  requireDesktop(injectedFolderPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-07' && isAbsolute(injectedFolderPath)));
  const importControlValue = values.get('--j01-import-control');
  const importControl =
    importControlValue === 'before-commit' ||
    importControlValue === 'after-commit-before-response' ||
    importControlValue === 'legacy-result-json-without-receipt' ||
    importControlValue === 'uncertain-reconciliation' ||
    importControlValue === 'legacy-reviewed-v2' ||
    importControlValue === 'tamper-reimport-proof-before-validation' ||
    importControlValue === 'abandon-object-delete-failure' ||
    importControlValue === 'after-abandon-object-delete-before-finalize'
      ? importControlValue
      : undefined;
  const foregroundExecutionControlValue = values.get('--j03-foreground-execution-control');
  const foregroundExecutionControl =
    foregroundExecutionControlValue === 'interrupt-before-foreground-boundary-response'
      ? foregroundExecutionControlValue
      : undefined;
  const recoveryControlValue = values.get('--j08-recovery-control');
  const recoveryControl = recoveryControlValue === 'interrupt-after-journal-ack'
    ? recoveryControlValue
    : undefined;
  const modelAdapterControlValue = values.get('--j04-model-adapter');
  const modelAdapterControl = modelAdapterControlValue !== undefined && J04_MODEL_ADAPTER_CONTROL_PATTERN.test(modelAdapterControlValue)
    ? modelAdapterControlValue
    : undefined;
  const applyControlValue = values.get('--j05-apply-control');
  const applyControl = applyControlValue === 'lose-first-acknowledgement' ? applyControlValue : undefined;
  requireDesktop(applyControlValue === undefined || (process.env.AI7_E2E_JOURNEY === 'J-05' && applyControl !== undefined));
  const observeJ12RevealValue = values.get('--j12-observe-reveal');
  const observeJ12Reveal = observeJ12RevealValue === 'true';
  const injectedDiagnosticsFolder = values.get('--j12-diagnostics-folder');
  requireDesktop(injectedDiagnosticsFolder === undefined ||
    (process.env.AI7_E2E_JOURNEY === 'J-12' && isAbsolute(injectedDiagnosticsFolder)));
  const launcherPid = Number(values.get('--launcher-pid'));
  requireDesktop(
    importControlValue === undefined || (process.env.AI7_E2E_JOURNEY === 'J-01' && importControl !== undefined),
  );
  requireDesktop(
    foregroundExecutionControlValue === undefined ||
      (process.env.AI7_E2E_JOURNEY === 'J-03' && foregroundExecutionControl !== undefined),
  );
  requireDesktop(
    recoveryControlValue === undefined || (process.env.AI7_E2E_JOURNEY === 'J-08' && recoveryControl !== undefined),
  );
  // J-02's Edit Journal write-failure injection (Issue #951, T0-1): `armed`, J-02's own, development-ci only.
  const journalFaultArmed = editJournalFaultControlAdmitted(values.get(EDIT_JOURNAL_FAULT_CONTROL_ARGUMENT), process.env.AI7_E2E_JOURNEY,
    launchForm.trustedOperationalScope);
  requireDesktop(journalFaultArmed !== null);
  // The model adapter binds a Journey whose Runs execute: J-04's analysis, J-09's 运行中 and 最近完成 (Issue #424),
  // J-10's cancelled Run (Issue #422), J-16's 任务 panel (Issue #423), J-11's 分析反馈 (Issue #94), and J-13's 书系一致性
  // (Issue #64) and the Review Runs a Captured Procedure is captured from and run as (Issue #65), and J-07's 写作任务 (Issue #432).
  requireDesktop(
    modelAdapterControlValue === undefined ||
      ((process.env.AI7_E2E_JOURNEY === 'J-04' || process.env.AI7_E2E_JOURNEY === 'J-09' || process.env.AI7_E2E_JOURNEY === 'J-10' ||
        process.env.AI7_E2E_JOURNEY === 'J-16' || process.env.AI7_E2E_JOURNEY === 'J-11' || process.env.AI7_E2E_JOURNEY === 'J-13' ||
        process.env.AI7_E2E_JOURNEY === 'J-07') &&
        modelAdapterControl !== undefined),
  );
  requireDesktop([importControl, foregroundExecutionControl, recoveryControl, modelAdapterControl].filter(Boolean).length <= 1);
  // The connectivity control is guarded as the picker paths are — J-04's own, and absolute — and, since it only
  // simulates whether the adapter's route has a network, it sits beside the adapter rather than excluding it.
  const connectivityPath = values.get('--j04-connectivity-path');
  requireDesktop(connectivityPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-04' && isAbsolute(connectivityPath)));
  // J-10's unit hold (Issue #422) is guarded the same way — J-10's own, J-16's to hold a Run in its 任务 panel (Issue
  // #423), J-09's to hold several Books' Runs at once (Issue #49), J-11's to keep a Run under way while ②A's follower is held
  // (#641), and J-13's to hold a 书系一致性 Run while an exclusion is recorded (Issue #64, S29b), and absolute — and sits
  // beside the adapter. J-04 uses the same hold for its genuine retained-/1 pause and continuation refusal (#1161).
  const unitHoldPath = values.get('--j10-unit-hold-path');
  requireDesktop(unitHoldPath === undefined ||
    ((process.env.AI7_E2E_JOURNEY === 'J-04' || process.env.AI7_E2E_JOURNEY === 'J-09' || process.env.AI7_E2E_JOURNEY === 'J-10' || process.env.AI7_E2E_JOURNEY === 'J-11' ||
      process.env.AI7_E2E_JOURNEY === 'J-13' || process.env.AI7_E2E_JOURNEY === 'J-16') && isAbsolute(unitHoldPath)));
  // J-16's answer hold (Issue #52, S17a): J-16's own, absolute, beside the adapter — it holds a dialogue answer mid-stream.
  const answerHoldPath = values.get('--j16-answer-hold-path');
  requireDesktop(answerHoldPath === undefined || (process.env.AI7_E2E_JOURNEY === 'J-16' && isAbsolute(answerHoldPath)));
  // J-09's 后台分析登记 pace (Issue #95, S39): J-09's own, development-ci only, beside the adapter, within its bounds.
  const backgroundQuietValue = values.get(BACKGROUND_QUIET_ARGUMENT);
  const backgroundQuietMs = backgroundQuietValue === undefined ? undefined : parseBackgroundQuietMs(backgroundQuietValue);
  requireDesktop(backgroundQuietValue === undefined || (process.env.AI7_E2E_JOURNEY === 'J-09' && backgroundQuietMs !== null));
  // J-11's calibration gate (Issue #429, EVAL-011a): J-11's own, development-ci only, beside the adapter, 2–10 Books.
  const calibrationMinBooksValue = values.get(CALIBRATION_MIN_BOOKS_ARGUMENT);
  const calibrationMinBooks = calibrationMinBooksForLaunch(calibrationMinBooksValue, process.env.AI7_E2E_JOURNEY);
  requireDesktop(calibrationMinBooks !== null);
  requireDesktop(
    observeJ12RevealValue === undefined ||
      (process.env.AI7_E2E_JOURNEY === 'J-12' && observeJ12RevealValue === 'true'),
  );
  requireDesktop(Number.isSafeInteger(launcherPid) && launcherPid > 0 && launcherPid === process.ppid);
  // developer-live is a human-attended developer-host launch: never a Journey launch and never combined with a Journey control.
  requireDesktop(
    launchForm.trustedOperationalScope === 'development-ci' ||
      (process.env.AI7_E2E_JOURNEY === undefined && injectedPickerPath === undefined && observeJ12RevealValue === undefined &&
        importControlValue === undefined && foregroundExecutionControlValue === undefined && recoveryControlValue === undefined && modelAdapterControlValue === undefined &&
        applyControlValue === undefined && injectedSavePath === undefined && injectedFolderPath === undefined && injectedDiagnosticsFolder === undefined && connectivityPath === undefined &&
        unitHoldPath === undefined && answerHoldPath === undefined && backgroundQuietValue === undefined && calibrationMinBooksValue === undefined),
  );
  return {
    dataRoot,
    allowFirstRunChooser,
    launchForm,
    injectedPickerPath,
    injectedSavePath,
    injectedFolderPath,
    injectedDiagnosticsFolder,
    importControl,
    foregroundExecutionControl,
    recoveryControl,
    modelAdapterControl,
    connectivityPath,
    unitHoldPath,
    answerHoldPath,
    backgroundQuietMs: backgroundQuietMs ?? undefined,
    calibrationMinBooks: calibrationMinBooks ?? undefined,
    applyControl,
    observeJ12Reveal,
    launcherPid,
    journalFaultArmed: journalFaultArmed === true,
  };
}

export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function validateRuntime(): void {
  requireDesktop(
    process.versions.electron === '43.4.1' &&
      process.versions.node === '24.18.1' &&
      process.versions.modules === '148' &&
      ((process.platform === 'win32' && process.arch === 'x64' && Number(release().split('.')[2]) >= 26_100) ||
        (process.platform === 'darwin' && process.arch === 'arm64' && Number(release().split('.')[0]) >= 24)),
  );
}
