import { randomUUID } from 'node:crypto';
import type { ServiceJobProjection } from '../shared/protocol.js';
import { StoreError, type EditorialStore } from './store.js';

const MAX_ACTIVE_JOBS = 4;
const MAX_RETAINED_JOBS = 32;

interface JobRecord {
  projection: ServiceJobProjection;
  subjectId: string;
  cancelRequested: boolean;
  scheduled: boolean;
}

export class CooperativeJobOwner {
  readonly #store: EditorialStore;
  readonly #jobs = new Map<string, JobRecord>();
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

  poll(jobId: string): ServiceJobProjection {
    const job = this.#requireJob(jobId);
    const projection = structuredClone(job.projection);
    if (projection.state === 'completed' || projection.state === 'cancelled' || projection.state === 'failed') {
      this.#jobs.delete(jobId);
    }
    return projection;
  }

  cancel(jobId: string): ServiceJobProjection {
    const job = this.#requireJob(jobId);
    if (job.projection.state === 'queued' || job.projection.state === 'running') {
      job.cancelRequested = true;
      if (job.projection.kind === 'search') this.#store.cancelSearch(job.subjectId);
      else this.#store.cancelReplacement(job.subjectId);
      job.projection = {
        ...job.projection,
        state: 'cancelled',
        progress: { ...job.projection.progress, label: job.projection.kind === 'search' ? '搜索已取消' : '替换准备已取消' },
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
        else this.#store.cancelReplacement(job.subjectId);
        job.projection = { ...job.projection, state: 'cancelled' };
      }
    }
    this.#jobs.clear();
  }

  #schedule(job: JobRecord): void {
    if (this.#disposed || job.scheduled || job.cancelRequested) return;
    job.scheduled = true;
    setImmediate(() => {
      job.scheduled = false;
      this.#advance(job);
    });
  }

  #advance(job: JobRecord): void {
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
      if (job.projection.kind === 'search') this.#store.cancelSearch(job.subjectId);
      else this.#store.cancelReplacement(job.subjectId);
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
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new StoreError('JOB_INVALID', '本地处理标识无效。');
    const job = this.#jobs.get(jobId);
    if (!job) throw new StoreError('JOB_NOT_FOUND', '本地处理不存在或已结束。');
    return job;
  }
}
