import { randomUUID } from 'node:crypto';
import type { ServiceJobProjection } from '../shared/protocol.js';
import { StoreError, StoreFatalError, type EditorialStore } from './store.js';

const MAX_ACTIVE_JOBS = 4;
const MAX_RETAINED_JOBS = 32;
const REIMPORT_BATCH_YIELD_MS = 20;

interface JobRecord {
  projection: ServiceJobProjection;
  subjectId: string;
  cancelRequested: boolean;
  scheduled: boolean;
}

interface TerminalReceipt {
  projection: ServiceJobProjection;
  subjectId: string;
}

export class CooperativeJobOwner {
  readonly #store: EditorialStore;
  readonly #jobs = new Map<string, JobRecord>();
  readonly #polledTerminalReceipts = new Map<string, TerminalReceipt>();
  #disposed = false;

  constructor(store: EditorialStore) {
    this.#store = store;
  }

  startSearch(manuscriptId: string, branchId: string, query: string): ServiceJobProjection {
    this.#requireCapacity();
    const search = this.#store.createSearch(manuscriptId, branchId, query);
    const jobId = randomUUID();
    const job: JobRecord = {
      subjectId: search.searchId,
      cancelRequested: false,
      scheduled: false,
      projection: {
        jobId,
        kind: 'search',
        state: 'queued',
        progress: { completed: 0, total: search.totalBlocks, label: '正在检索全稿…' },
        result: null,
        failure: null,
      },
    };
    this.#jobs.set(jobId, job);
    this.#schedule(job);
    return structuredClone(job.projection);
  }

  startReplacement(previewId: string): ServiceJobProjection {
    this.#requireCapacity();
    const jobId = randomUUID();
    const job: JobRecord = {
      subjectId: previewId,
      cancelRequested: false,
      scheduled: false,
      projection: {
        jobId,
        kind: 'replacement',
        state: 'queued',
        progress: { completed: 0, total: 1, label: '正在有界准备替换集…' },
        result: null,
        failure: null,
      },
    };
    this.#jobs.set(jobId, job);
    this.#schedule(job);
    return structuredClone(job.projection);
  }

  startReimportPreparation(
    draftId: string,
    expectedDraftVersion: number,
    target: Parameters<EditorialStore['createManuscriptReimportPreparationWork']>[2],
  ): ServiceJobProjection {
    this.#requireCapacity();
    const work = this.#store.createManuscriptReimportPreparationWork(draftId, expectedDraftVersion, target);
    const jobId = randomUUID();
    const job: JobRecord = {
      subjectId: work.workId,
      cancelRequested: false,
      scheduled: false,
      projection: {
        jobId,
        kind: 'reimport-preparation',
        state: 'queued',
        progress: { completed: 0, total: work.total, label: '正在有界准备重新导入比较…' },
        result: null,
        failure: null,
      },
    };
    this.#jobs.set(jobId, job);
    this.#schedule(job);
    return structuredClone(job.projection);
  }

  startTaskAuthorizationPreparation(
    bookId: Parameters<EditorialStore['createTaskAuthorizationPreparationWork']>[0],
    goal: Parameters<EditorialStore['createTaskAuthorizationPreparationWork']>[1],
    launchPolicy: Parameters<EditorialStore['createTaskAuthorizationPreparationWork']>[2],
  ): ServiceJobProjection {
    this.#requireCapacity();
    const work = this.#store.createTaskAuthorizationPreparationWork(bookId, goal, launchPolicy);
    const jobId = randomUUID();
    const job: JobRecord = {
      subjectId: work.workId ?? bookId,
      cancelRequested: false,
      scheduled: false,
      projection: {
        jobId,
        kind: 'task-authorization-preparation',
        state: work.done ? 'completed' : 'queued',
        progress: {
          completed: work.done ? work.total : 0,
          total: work.total,
          label: work.done ? '任务授权计划准备完成' : '正在有界准备任务输入固定点…',
        },
        result: work.projection,
        failure: null,
      },
    };
    if (work.done) this.#rememberPolledTerminal(jobId, job);
    else {
      this.#jobs.set(jobId, job);
      this.#schedule(job);
    }
    return structuredClone(job.projection);
  }

  startBaselineAnalysisPreparation(
    bookId: Parameters<EditorialStore['createBaselineAnalysisPreparationWork']>[0],
    goal: Parameters<EditorialStore['createBaselineAnalysisPreparationWork']>[1],
    update: Parameters<EditorialStore['createBaselineAnalysisPreparationWork']>[2],
    launchPolicy: Parameters<EditorialStore['createBaselineAnalysisPreparationWork']>[3],
    reconfirm: boolean,
  ): ServiceJobProjection {
    this.#requireCapacity();
    const work = this.#store.createBaselineAnalysisPreparationWork(bookId, goal, update, launchPolicy, reconfirm);
    const jobId = randomUUID();
    const job: JobRecord = {
      subjectId: work.workId ?? bookId,
      cancelRequested: false,
      scheduled: false,
      projection: {
        jobId,
        kind: 'baseline-analysis-preparation',
        state: work.done ? 'completed' : 'queued',
        progress: {
          completed: work.done ? work.total : 0,
          total: work.total,
          label: work.done ? '基线稿件分析计划准备完成' : '正在有界固定任务输入并派生覆盖清单…',
        },
        result: work.projection,
        failure: null,
      },
    };
    if (work.done) this.#rememberPolledTerminal(jobId, job);
    else {
      this.#jobs.set(jobId, job);
      this.#schedule(job);
    }
    return structuredClone(job.projection);
  }

  startReimportResolution(
    draftId: string,
    expectedDraftVersion: number,
    mappingId: string,
    resolution: Parameters<EditorialStore['createReimportResolutionWork']>[3],
    currentBlockId: string | null,
  ): ServiceJobProjection {
    this.#requireCapacity();
    const work = this.#store.createReimportResolutionWork(
      draftId, expectedDraftVersion, mappingId, resolution, currentBlockId);
    const jobId = randomUUID();
    const job: JobRecord = {
      subjectId: work.workId,
      cancelRequested: false,
      scheduled: false,
      projection: {
        jobId,
        kind: 'reimport-resolution',
        state: 'queued',
        progress: { completed: 0, total: work.total, label: '正在有界核对结构身份解决…' },
        result: null,
        failure: null,
      },
    };
    this.#jobs.set(jobId, job);
    this.#schedule(job);
    return structuredClone(job.projection);
  }

  async startReimportCommit(
    input: Parameters<EditorialStore['createManuscriptReimportCommitWork']>[0],
    options: Parameters<EditorialStore['createManuscriptReimportCommitWork']>[1] = {},
  ): Promise<ServiceJobProjection> {
    this.#requireCapacity();
    const work = await this.#store.createManuscriptReimportCommitWork(input, options);
    const jobId = randomUUID();
    const total = work.result === null ? work.total : 1;
    const job: JobRecord = {
      subjectId: work.workId ?? input.commitId,
      cancelRequested: false,
      scheduled: false,
      projection: {
        jobId,
        kind: 'reimport-commit',
        state: work.result === null ? 'queued' : 'completed',
        progress: {
          completed: work.result === null ? 0 : total,
          total,
          label: work.result === null ? '正在有界核对并提交重新导入…' : '稿件重新导入提交完成',
        },
        result: work.result,
        failure: null,
      },
    };
    if (work.result === null) {
      this.#jobs.set(jobId, job);
      this.#schedule(job);
    } else {
      this.#rememberPolledTerminal(jobId, job);
    }
    return structuredClone(job.projection);
  }

  poll(jobId: string): ServiceJobProjection {
    const job = this.#requireJob(jobId);
    const projection = structuredClone(job.projection);
    if (projection.state === 'completed' || projection.state === 'cancelled' || projection.state === 'failed') {
      this.#rememberPolledTerminal(jobId, job);
      this.#jobs.delete(jobId);
    }
    return projection;
  }

  cancel(jobId: string): ServiceJobProjection {
    this.#validateJobId(jobId);
    const job = this.#jobs.get(jobId);
    if (!job) {
      const receipt = this.#polledTerminalReceipts.get(jobId);
      if (!receipt) throw new StoreError('JOB_NOT_FOUND', '本地处理不存在或已结束。');
      if (receipt.projection.kind === 'replacement' && receipt.projection.state === 'completed') {
        const cancelled = this.#store.cancelReplacement(receipt.subjectId);
        if (cancelled) {
          receipt.projection = {
            ...receipt.projection,
            state: 'cancelled',
            result: null,
            failure: null,
            progress: { ...receipt.projection.progress, label: '替换准备已取消' },
          };
        }
      }
      return structuredClone(receipt.projection);
    }
    if (job.projection.kind === 'replacement' && job.projection.state !== 'cancelled' && job.projection.state !== 'failed') {
      const cancelled = this.#store.cancelReplacement(job.subjectId);
      if (cancelled) {
        job.cancelRequested = true;
        job.projection = {
          ...job.projection,
          state: 'cancelled',
          result: null,
          failure: null,
          progress: { ...job.projection.progress, label: '替换准备已取消' },
        };
      }
    } else if ((job.projection.kind === 'reimport-preparation' || job.projection.kind === 'reimport-resolution' ||
      job.projection.kind === 'task-authorization-preparation' || job.projection.kind === 'baseline-analysis-preparation' ||
      job.projection.kind === 'reimport-commit') &&
      (job.projection.state === 'queued' || job.projection.state === 'running')) {
      job.cancelRequested = true;
      if (job.projection.kind === 'reimport-preparation') {
        this.#store.cancelManuscriptReimportPreparationWork(job.subjectId);
      } else if (job.projection.kind === 'task-authorization-preparation') {
        this.#store.cancelTaskAuthorizationPreparationWork(job.subjectId);
      } else if (job.projection.kind === 'baseline-analysis-preparation') {
        this.#store.cancelBaselineAnalysisPreparationWork(job.subjectId);
      } else if (job.projection.kind === 'reimport-resolution') {
        this.#store.cancelReimportResolutionWork(job.subjectId);
      } else {
        this.#store.cancelManuscriptReimportCommitWork(job.subjectId);
      }
      job.projection = {
        ...job.projection,
        state: 'cancelled',
        result: null,
        failure: null,
        progress: {
          ...job.projection.progress,
          label: job.projection.kind === 'reimport-preparation'
            ? '重新导入比较准备已取消'
            : job.projection.kind === 'task-authorization-preparation'
              ? '任务授权计划准备已取消'
            : job.projection.kind === 'baseline-analysis-preparation'
              ? '基线稿件分析计划准备已取消'
            : job.projection.kind === 'reimport-resolution'
              ? '结构身份解决已取消'
              : '重新导入提交已取消',
        },
      };
    } else if (job.projection.kind === 'search' &&
      (job.projection.state === 'queued' || job.projection.state === 'running')) {
      job.cancelRequested = true;
      this.#store.cancelSearch(job.subjectId);
      job.projection = {
        ...job.projection,
        state: 'cancelled',
        progress: { ...job.projection.progress, label: '搜索已取消' },
      };
    }
    return structuredClone(job.projection);
  }

  dispose(): void {
    this.#disposed = true;
    for (const job of this.#jobs.values()) {
      if (job.projection.state === 'queued' || job.projection.state === 'running') {
        job.cancelRequested = true;
        if (job.projection.kind === 'search') this.#store.cancelSearch(job.subjectId);
        else if (job.projection.kind === 'replacement') this.#store.cancelReplacement(job.subjectId);
        else if (job.projection.kind === 'reimport-preparation') {
          this.#store.cancelManuscriptReimportPreparationWork(job.subjectId);
        } else if (job.projection.kind === 'task-authorization-preparation') {
          this.#store.cancelTaskAuthorizationPreparationWork(job.subjectId);
        } else if (job.projection.kind === 'baseline-analysis-preparation') {
          this.#store.cancelBaselineAnalysisPreparationWork(job.subjectId);
        } else if (job.projection.kind === 'reimport-resolution') {
          this.#store.cancelReimportResolutionWork(job.subjectId);
        } else {
          this.#store.cancelManuscriptReimportCommitWork(job.subjectId);
        }
        job.projection = { ...job.projection, state: 'cancelled' };
      }
    }
    this.#jobs.clear();
    this.#polledTerminalReceipts.clear();
  }

  #schedule(job: JobRecord, delayMilliseconds = 0): void {
    if (this.#disposed || job.scheduled || job.cancelRequested) return;
    job.scheduled = true;
    const advance = (): void => {
      job.scheduled = false;
      void this.#advance(job).catch((error: unknown) => {
        setImmediate(() => { throw error; });
      });
    };
    if (delayMilliseconds > 0) setTimeout(advance, delayMilliseconds);
    else setImmediate(advance);
  }

  async #advance(job: JobRecord): Promise<void> {
    if (this.#disposed || job.cancelRequested || (job.projection.state !== 'queued' && job.projection.state !== 'running')) return;
    job.projection = { ...job.projection, state: 'running' };
    try {
      if (job.projection.kind === 'search') {
        const progress = this.#store.advanceSearch(job.subjectId);
        job.projection = {
          ...job.projection,
          state: progress.done ? 'completed' : 'running',
          progress: {
            completed: progress.done ? progress.totalBlocks : progress.scannedPosition,
            total: progress.totalBlocks,
            label: progress.done ? `搜索完成 · ${progress.summary.totalMatches} 项` : '正在检索全稿…',
          },
          result: progress.done ? progress.summary : null,
        };
        if (!progress.done) this.#schedule(job);
        return;
      }
      if (job.projection.kind === 'reimport-preparation') {
        const progress = this.#store.advanceManuscriptReimportPreparationWork(job.subjectId);
        job.projection = {
          ...job.projection,
          state: progress.done ? 'completed' : 'running',
          progress: {
            completed: progress.completed,
            total: progress.total,
            label: progress.done ? '重新导入比较准备完成' : '正在有界准备重新导入比较…',
          },
          result: progress.review,
        };
        if (!progress.done) this.#schedule(job, REIMPORT_BATCH_YIELD_MS);
        return;
      }
      if (job.projection.kind === 'task-authorization-preparation') {
        const progress = this.#store.advanceTaskAuthorizationPreparationWork(job.subjectId);
        job.projection = {
          ...job.projection,
          state: progress.done ? 'completed' : 'running',
          progress: {
            completed: progress.completed,
            total: progress.total,
            label: progress.done ? '任务授权计划准备完成' : '正在有界准备任务输入固定点…',
          },
          result: progress.projection,
        };
        if (!progress.done) this.#schedule(job, REIMPORT_BATCH_YIELD_MS);
        return;
      }
      if (job.projection.kind === 'baseline-analysis-preparation') {
        const progress = this.#store.advanceBaselineAnalysisPreparationWork(job.subjectId);
        job.projection = {
          ...job.projection,
          state: progress.done ? 'completed' : 'running',
          progress: {
            completed: progress.completed,
            total: progress.total,
            label: progress.done ? '基线稿件分析计划准备完成' : '正在有界固定任务输入并派生覆盖清单…',
          },
          result: progress.projection,
        };
        if (!progress.done) this.#schedule(job, REIMPORT_BATCH_YIELD_MS);
        return;
      }
      if (job.projection.kind === 'reimport-resolution') {
        const progress = this.#store.advanceReimportResolutionWork(job.subjectId);
        job.projection = {
          ...job.projection,
          state: progress.done ? 'completed' : 'running',
          progress: {
            completed: progress.completed,
            total: progress.total,
            label: progress.done ? '结构身份解决完成' : '正在有界核对结构身份解决…',
          },
          result: progress.review,
        };
        if (!progress.done) this.#schedule(job, REIMPORT_BATCH_YIELD_MS);
        return;
      }
      if (job.projection.kind === 'reimport-commit') {
        const progress = await this.#store.advanceManuscriptReimportCommitWork(job.subjectId);
        job.projection = {
          ...job.projection,
          state: progress.done ? 'completed' : 'running',
          progress: {
            completed: progress.completed,
            total: progress.total,
            label: progress.done ? '稿件重新导入提交完成' : '正在有界核对并提交重新导入…',
          },
          result: progress.result,
        };
        if (!progress.done) this.#schedule(job, REIMPORT_BATCH_YIELD_MS);
        return;
      }
      const progress = this.#store.advanceReplacementWork(job.subjectId);
      const preparing = progress.phase === 'preparing';
      job.projection = {
        ...job.projection,
        progress: {
          completed: progress.completed,
          total: progress.total,
          label: progress.done
            ? preparing ? '替换预览准备完成' : '冻结匹配复核完成'
            : preparing ? '正在有界准备替换预览…' : '正在复核冻结匹配…',
        },
      };
      if (!progress.done) {
        this.#schedule(job);
        return;
      }
      job.projection = {
        ...job.projection,
        state: 'completed',
        progress: { completed: progress.total, total: progress.total, label: preparing ? '替换预览准备完成' : '冻结匹配复核完成' },
        result: progress.preview,
      };
    } catch (error) {
      if (error instanceof StoreFatalError) throw error;
      if (job.projection.kind === 'search') this.#store.cancelSearch(job.subjectId);
      else if (job.projection.kind === 'replacement') this.#store.cancelReplacement(job.subjectId);
      else if (job.projection.kind === 'reimport-preparation') {
        this.#store.cancelManuscriptReimportPreparationWork(job.subjectId);
      } else if (job.projection.kind === 'task-authorization-preparation') {
        this.#store.cancelTaskAuthorizationPreparationWork(job.subjectId);
      } else if (job.projection.kind === 'baseline-analysis-preparation') {
        this.#store.cancelBaselineAnalysisPreparationWork(job.subjectId);
      } else if (job.projection.kind === 'reimport-resolution') {
        this.#store.cancelReimportResolutionWork(job.subjectId);
      } else {
        this.#store.cancelManuscriptReimportCommitWork(job.subjectId);
      }
      const failure = error instanceof StoreError
        ? { code: error.code, message: error.message }
        : { code: 'SERVICE_JOB_FAILED', message: '本地协作处理未完成。' };
      job.projection = {
        ...job.projection,
        state: job.cancelRequested ? 'cancelled' : 'failed',
        failure: job.cancelRequested ? null : failure,
        progress: { ...job.projection.progress, label: job.cancelRequested ? '操作已取消' : failure.message },
      };
    }
  }

  #requireCapacity(): void {
    if (this.#disposed) throw new StoreError('SERVICE_STOPPING', '本地业务服务正在停止。');
    if (this.#jobs.size >= MAX_RETAINED_JOBS) {
      throw new StoreError('SERVICE_BUSY', '本地处理记录已达到安全上限；请先读取已完成操作。');
    }
    const active = Array.from(this.#jobs.values()).filter((job) => job.projection.state === 'queued' || job.projection.state === 'running').length;
    if (active >= MAX_ACTIVE_JOBS) throw new StoreError('SERVICE_BUSY', '当前已有多项本地处理，请稍后再试。');
  }

  #requireJob(jobId: string): JobRecord {
    this.#validateJobId(jobId);
    const job = this.#jobs.get(jobId);
    if (!job) throw new StoreError('JOB_NOT_FOUND', '本地处理不存在或已结束。');
    return job;
  }

  #validateJobId(jobId: string): void {
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new StoreError('JOB_INVALID', '本地处理标识无效。');
  }

  #rememberPolledTerminal(jobId: string, job: JobRecord): void {
    this.#polledTerminalReceipts.delete(jobId);
    this.#polledTerminalReceipts.set(jobId, {
      projection: structuredClone(job.projection),
      subjectId: job.subjectId,
    });
    while (this.#polledTerminalReceipts.size > MAX_RETAINED_JOBS) {
      const oldest = this.#polledTerminalReceipts.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#polledTerminalReceipts.delete(oldest);
    }
  }
}
