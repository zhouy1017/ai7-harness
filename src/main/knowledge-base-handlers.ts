import type { NativeFilePickers } from './file-pickers.js';
import { basename, isAbsolute } from 'node:path';
import { dialog, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  type RendererApi,
  type ResolvedBookWorkbenchRoute,
  type WireServiceOperationMap as ServiceOperationMap,
} from '../shared/protocol.js';
import { developerProposalFileName } from '../shared/developer-proposal.js';
import { ServiceCallError, ServiceClient } from './service-client.js';
import { UUID_PATTERN, envelope, requireDesktop } from './handler-guards.js';
import type { OwnedRendererWindow } from './application-types.js';

export function registerKnowledgeBaseHandlers(context: {
  chooseDeveloperProposalFile: NativeFilePickers['chooseDeveloperProposalFile'];
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  requireAuthority: () => void;
  service: ServiceClient;
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  requireCurrentBookRoute: (owned: OwnedRendererWindow) => Extract<ResolvedBookWorkbenchRoute, { kind: "book"; }>;
  requireCurrentRouteReadEpoch: (owned: OwnedRendererWindow, routeGeneration: number, routeRequestSequence: number) => void;
  requireCurrentRouteGeneration: (owned: OwnedRendererWindow, routeGeneration: number) => void;
}) {
  const { chooseDeveloperProposalFile, requireSender, requireAuthority, service, serializeEffect, requireCurrentBookRoute, requireCurrentRouteReadEpoch, requireCurrentRouteGeneration } = context;
  // 知识库 › 审阅规范文件 (Issue #427, S79a) names no Book: it reads every Book's Review Runs. 导入新版本 opens the picker and
  // hands the service the path it returned; confirming records the version, serialized with every other effect.
  ipcMain.handle(IPC_CHANNELS.inspectReviewGuidelines, (event, input?: ServiceOperationMap['inspectReviewGuidelines']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('inspectReviewGuidelines', input?.page === undefined ? {} : { page: input.page });
    }),
  );

  // 知识库 › 范例 (Issue #427, S79b) names no Book either: it reads the published Books' delivered documents, a page at a
  // time, starting where the renderer's cursor says; the service checks the cursor.
  ipcMain.handle(IPC_CHANNELS.previewImportedExemplar, (event) => envelope(async () => {
    const owned = requireSender(event);
    return serializeEffect(async () => {
      requireAuthority();
      let path = owned.injectedPickerPath;
      owned.injectedPickerPath = undefined;
      if (!path) {
        const picked = await dialog.showOpenDialog(owned.window, {
          title: '选择以前图书的范例', buttonLabel: '选择文件', properties: ['openFile'],
          filters: [{ name: 'Word 或纯文本', extensions: ['docx', 'txt', 'md'] }],
        });
        if (picked.canceled || picked.filePaths.length !== 1) return null;
        path = picked.filePaths[0];
      }
      requireDesktop(path !== undefined && isAbsolute(path));
      return service.call('previewImportedExemplar', { path });
    });
  }));

  ipcMain.handle(IPC_CHANNELS.importEarlierExemplar, (event, input: ServiceOperationMap['importEarlierExemplar']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('importEarlierExemplar', {
          previewId: input.previewId, bookId: input.bookId, bookTitle: input.bookTitle,
          authors: input.authors, editors: input.editors, typeId: input.typeId, expectedVersion: input.expectedVersion,
        });
      });
    }));

  ipcMain.handle(IPC_CHANNELS.decideImportedExemplar, (event, input: ServiceOperationMap['decideImportedExemplar']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('decideImportedExemplar', {
          revisionId: input.revisionId, revisionDigest: input.revisionDigest,
          expectedDecisions: input.expectedDecisions, choice: input.choice,
        });
      });
    }));

  ipcMain.handle(IPC_CHANNELS.inspectExemplars, (event, input: ServiceOperationMap['inspectExemplars']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('inspectExemplars', { after: input?.after ?? null });
    }),
  );

  // 归入范例 of one 审稿意见 (Issue #429): a write on the Learning Eligibility ledger, serialized like every other effect.
  ipcMain.handle(IPC_CHANNELS.admitReadersReportExemplar, (event, input: ServiceOperationMap['admitReadersReportExemplar']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('admitReadersReportExemplar', {
          bookId: input.bookId,
          template: input.template,
          revisionDigest: input.revisionDigest,
          expectedDecisions: input.expectedDecisions,
        });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.procedureLibrary, (event, input: Parameters<RendererApi['procedureLibrary']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('procedureLibrary', input);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectKnowledgeProcedures, (event) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('inspectKnowledgeProcedures', {});
    }),
  );

  // ---- 可复用工序 and 开发建议 (Issue #65, plan slice S30; ADR 0087) ---------------------------------------------------
  // The house's list names no Book; capturing from a Review Run and resolving a procedure for a run are the route's Book's,
  // which the renderer never names. Nothing here plans, prepares or runs: running one is the ordinary 新建审阅 sheet.
  ipcMain.handle(IPC_CHANNELS.inspectCapturedProcedures, (event) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('inspectCapturedProcedures', {});
    }),
  );

  // ADR 0090 §2: the path comes only from the platform picker; the renderer cannot select an arbitrary path. Picking discloses
  // and keeps nothing; `keep` names the disclosed acquisition the service holds, never a path.
  ipcMain.handle(IPC_CHANNELS.importSkillPackage, (event, input: Parameters<RendererApi['importSkillPackage']>[0]) => envelope(async () => {
    const owned = requireSender(event);
    requireDesktop(input === undefined || (input !== null && typeof input === 'object' && (
      ('kind' in input && (input.kind === 'zip' || input.kind === 'directory')) || ('keep' in input && typeof input.keep === 'string' && UUID_PATTERN.test(input.keep)))));
    return serializeEffect(async () => {
      requireAuthority();
      if (input !== undefined && 'keep' in input) return service.call('importSkillPackage', { path: null, keep: input.keep });
      const kind = input?.kind;
      let path = owned.injectedPickerPath;
      owned.injectedPickerPath = undefined;
      if (path === undefined) {
        const picked = await dialog.showOpenDialog(owned.window, {
          title: '选择要导入的 Skill', buttonLabel: '查看 Skill', properties: kind === 'directory' ? ['openDirectory'] : ['openFile'],
          ...(kind === 'directory' ? {} : { filters: [{ name: 'Skill 压缩包', extensions: ['zip'] }] }),
        });
        if (picked.canceled || picked.filePaths.length !== 1) return null;
        path = picked.filePaths[0];
      }
      requireDesktop(path !== undefined && isAbsolute(path));
      return service.call('importSkillPackage', { path, keep: null });
    });
  }));

  ipcMain.handle(IPC_CHANNELS.inspectImportedSkills, (event, input: Parameters<RendererApi['inspectImportedSkills']>[0]) => envelope(async () => {
    requireSender(event); requireAuthority();
    requireDesktop(input !== null && typeof input === 'object');
    return service.call('inspectImportedSkills', { revisionId: input.revisionId, before: input.before });
  }));

  ipcMain.handle(IPC_CHANNELS.validateImportedSkill, (event, input: Parameters<RendererApi['validateImportedSkill']>[0]) => envelope(async () => {
    requireSender(event); requireDesktop(input !== null && typeof input === 'object');
    return serializeEffect(async () => { requireAuthority(); return service.call('validateImportedSkill', { revisionId: input.revisionId }); });
  }));

  ipcMain.handle(IPC_CHANNELS.installImportedSkill, (event, input: Parameters<RendererApi['installImportedSkill']>[0]) => envelope(async () => {
    requireSender(event); requireDesktop(input !== null && typeof input === 'object');
    return serializeEffect(async () => { requireAuthority(); return service.call('installImportedSkill', { revisionId: input.revisionId, previewDigest: input.previewDigest }); });
  }));

  ipcMain.handle(IPC_CHANNELS.enableImportedSkill, (event, input: Parameters<RendererApi['enableImportedSkill']>[0]) => envelope(async () => {
    requireSender(event); requireDesktop(input !== null && typeof input === 'object');
    return serializeEffect(async () => {
      requireAuthority();
      return service.call('enableImportedSkill', { revisionId: input.revisionId, bookId: input.bookId, previewDigest: input.previewDigest });
    });
  }));

  // ADR 0090 §3: 检查更新（从文件）… takes its package from the same platform picker, for the Skill named, and discloses and keeps
  // nothing; `keep` names the disclosed acquisition the service holds, never a path. The renderer never selects a path.
  ipcMain.handle(IPC_CHANNELS.checkImportedSkillUpdate, (event, input: Parameters<RendererApi['checkImportedSkillUpdate']>[0]) => envelope(async () => {
    const owned = requireSender(event);
    requireDesktop(input !== null && typeof input === 'object' && typeof input.skillId === 'string' && UUID_PATTERN.test(input.skillId) && (
      ('kind' in input && (input.kind === 'zip' || input.kind === 'directory')) || ('keep' in input && typeof input.keep === 'string' && UUID_PATTERN.test(input.keep))));
    return serializeEffect(async () => {
      requireAuthority();
      if ('keep' in input) return service.call('checkImportedSkillUpdate', { skillId: input.skillId, path: null, keep: input.keep });
      let path = owned.injectedPickerPath;
      owned.injectedPickerPath = undefined;
      if (path === undefined) {
        const picked = await dialog.showOpenDialog(owned.window, {
          title: '选择这个 Skill 的新版本', buttonLabel: '查看更新', properties: input.kind === 'directory' ? ['openDirectory'] : ['openFile'],
          ...(input.kind === 'directory' ? {} : { filters: [{ name: 'Skill 压缩包', extensions: ['zip'] }] }),
        });
        if (picked.canceled || picked.filePaths.length !== 1) return null;
        path = picked.filePaths[0];
      }
      requireDesktop(path !== undefined && isAbsolute(path));
      return service.call('checkImportedSkillUpdate', { skillId: input.skillId, path, keep: null });
    });
  }));

  ipcMain.handle(IPC_CHANNELS.inspectImportedSkillUpdate, (event, input: Parameters<RendererApi['inspectImportedSkillUpdate']>[0]) => envelope(async () => {
    requireSender(event); requireAuthority();
    requireDesktop(input !== null && typeof input === 'object');
    return service.call('inspectImportedSkillUpdate', { candidateId: input.candidateId });
  }));

  ipcMain.handle(IPC_CHANNELS.adoptImportedSkillUpdate, (event, input: Parameters<RendererApi['adoptImportedSkillUpdate']>[0]) => envelope(async () => {
    requireSender(event); requireDesktop(input !== null && typeof input === 'object');
    return serializeEffect(async () => {
      requireAuthority();
      return service.call('adoptImportedSkillUpdate', {
        candidateId: input.candidateId, reviewDigest: input.reviewDigest, acceptItems: input.acceptItems, upstreamPaths: input.upstreamPaths,
      });
    });
  }));

  ipcMain.handle(IPC_CHANNELS.dismissImportedSkillUpdate, (event, input: Parameters<RendererApi['dismissImportedSkillUpdate']>[0]) => envelope(async () => {
    requireSender(event); requireDesktop(input !== null && typeof input === 'object');
    return serializeEffect(async () => { requireAuthority(); return service.call('dismissImportedSkillUpdate', { candidateId: input.candidateId }); });
  }));

  ipcMain.handle(IPC_CHANNELS.createImportedSkillUpdateRule, (event, input: Parameters<RendererApi['createImportedSkillUpdateRule']>[0]) => envelope(async () => {
    requireSender(event); requireDesktop(input !== null && typeof input === 'object');
    return serializeEffect(async () => { requireAuthority(); return service.call('createImportedSkillUpdateRule', { skillId: input.skillId, confirmation: input.confirmation }); });
  }));

  ipcMain.handle(IPC_CHANNELS.revokeImportedSkillUpdateRule, (event, input: Parameters<RendererApi['revokeImportedSkillUpdateRule']>[0]) => envelope(async () => {
    requireSender(event); requireDesktop(input !== null && typeof input === 'object');
    return serializeEffect(async () => { requireAuthority(); return service.call('revokeImportedSkillUpdateRule', { skillId: input.skillId }); });
  }));

  ipcMain.handle(IPC_CHANNELS.rollbackImportedSkill, (event, input: Parameters<RendererApi['rollbackImportedSkill']>[0]) => envelope(async () => {
    requireSender(event); requireDesktop(input !== null && typeof input === 'object');
    return serializeEffect(async () => { requireAuthority(); return service.call('rollbackImportedSkill', { skillId: input.skillId, revisionId: input.revisionId }); });
  }));

  ipcMain.handle(IPC_CHANNELS.recommendProcedures, (event, input: Parameters<RendererApi['recommendProcedures']>[0]) => envelope(async () => {
    const owned = requireSender(event); requireAuthority();
    requireDesktop(input !== null && typeof input === 'object');
    const route = requireCurrentBookRoute(owned);
    const generation = owned.routeGeneration;
    const sequence = owned.routeRequestSequence;
    const result = await service.call('recommendProcedures', {
      bookId: route.bookId, goal: input.goal, taskKind: input.taskKind, scope: input.scope, categoryIds: input.categoryIds,
    });
    requireCurrentRouteReadEpoch(owned, generation, sequence);
    return result;
  }));

  ipcMain.handle(IPC_CHANNELS.inspectCapturedProcedure, (event, input: Parameters<RendererApi['inspectCapturedProcedure']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectCapturedProcedure', { procedureId: input.procedureId, before: input.before });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectDeveloperProposal, (event, input: Parameters<RendererApi['inspectDeveloperProposal']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectDeveloperProposal', { proposalId: input.proposalId, before: input.before });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectProcedureCapture, (event, input: Parameters<RendererApi['inspectProcedureCapture']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectProcedureCapture', { bookId: route.bookId, reviewRunId: input.reviewRunId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '工序的来源不属于当前图书工作台。');
      return result;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.saveCapturedProcedure, (event, input: Parameters<RendererApi['saveCapturedProcedure']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        return service.call('saveCapturedProcedure', {
          bookId: route.bookId,
          reviewRunId: input.reviewRunId,
          categoryIds: input.categoryIds,
          scopeSlot: input.scopeSlot,
          title: input.title,
          procedureId: input.procedureId,
        });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.previewCapturedProcedureValidation, (event, input: Parameters<RendererApi['previewCapturedProcedureValidation']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('previewCapturedProcedureValidation', { versionId: input.versionId });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.enableCapturedProcedure, (event, input: Parameters<RendererApi['enableCapturedProcedure']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('enableCapturedProcedure', { versionId: input.versionId, previewDigest: input.previewDigest });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.stopCapturedProcedure, (event, input: Parameters<RendererApi['stopCapturedProcedure']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('stopCapturedProcedure', { procedureId: input.procedureId, versionId: input.versionId, previewDigest: input.previewDigest });
      });
    }),
  );

  // 停用…'s preview (Issue #66, S31): a read over the house's procedure, naming the Review Runs it touches; it stops nothing.
  ipcMain.handle(IPC_CHANNELS.previewCapturedProcedureStop, (event, input: Parameters<RendererApi['previewCapturedProcedureStop']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('previewCapturedProcedureStop', { procedureId: input.procedureId, versionId: input.versionId });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectCapturedProcedureRun, (event, input: Parameters<RendererApi['inspectCapturedProcedureRun']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectCapturedProcedureRun', {
        bookId: route.bookId, procedureId: input.procedureId, versionId: input.versionId ?? null, scope: input.scope === 'selection' ? 'selection' : null,
      });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '工序的运行预览不属于当前图书工作台。');
      return result;
    }),
  );

  // 自定义分析维度 (Issue #922, slice 7f): 知识库's house documents name no Book; ②A's 自定义 tab and 运行 read and prepare on the
  // route's Book, which the renderer never names.
  ipcMain.handle(IPC_CHANNELS.inspectCustomAnalysisDimensions, (event, input: Parameters<RendererApi['inspectCustomAnalysisDimensions']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object' && typeof input.forBook === 'boolean', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      if (!input.forBook) return service.call('inspectCustomAnalysisDimensions', { bookId: null });
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectCustomAnalysisDimensions', { bookId: route.bookId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '自定义分析维度不属于当前图书工作台。');
      return result;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.saveCustomAnalysisDimension, (event, input: Parameters<RendererApi['saveCustomAnalysisDimension']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('saveCustomAnalysisDimension', { dimensionId: input.dimensionId, title: input.title, questionTemplate: input.questionTemplate });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.enableCustomAnalysisDimension, (event, input: Parameters<RendererApi['enableCustomAnalysisDimension']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('enableCustomAnalysisDimension', { versionId: input.versionId });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.stopCustomAnalysisDimension, (event, input: Parameters<RendererApi['stopCustomAnalysisDimension']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('stopCustomAnalysisDimension', { versionId: input.versionId });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.prepareCustomAnalysis, (event, input: Parameters<RendererApi['prepareCustomAnalysis']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const result = await service.call('prepareCustomAnalysis', { bookId: route.bookId, dimensionId: input.dimensionId, update: input.update, from: input.from ?? null });
        if (result.dimensions.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '自定义分析任务不属于当前图书工作台。');
        return result;
      });
    }),
  );

  // 按已保存的工序 (Issue #66, S31b): the house's enabled procedures as each applies to the route's Book, which the renderer never names;
  // with `scope: 'selection'`, as each applies to a 当前选区 of it, for the selection menu (Issue #423, S77 deferred item a).
  ipcMain.handle(IPC_CHANNELS.inspectCapturedProcedureApplicability, (event, input?: Parameters<RendererApi['inspectCapturedProcedureApplicability']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input === undefined || input === null || typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const scope = input !== undefined && input !== null && input.scope === 'selection' ? 'selection' : null;
      const result = await service.call('inspectCapturedProcedureApplicability', { bookId: route.bookId, scope });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '工序的适用情况不属于当前图书工作台。');
      return result;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.saveDeveloperProposal, (event, input: Parameters<RendererApi['saveDeveloperProposal']>[0]) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('saveDeveloperProposal', {
          proposalId: input.proposalId,
          title: input.title,
          missingCapability: input.missingCapability,
          affectedProcedure: input.affectedProcedure,
          direction: input.direction,
          pluginCandidate: input.pluginCandidate,
        });
      });
    }),
  );

  // 导出为文件… (ADR 0087 §6): the Save dialog chooses where; the renderer never sees the path, and a cancelled dialog writes
  // and records nothing. The proposal's own name is offered from the version the service holds, never from the renderer.
  ipcMain.handle(IPC_CHANNELS.saveDeveloperProposalFile, (event, input: Parameters<RendererApi['saveDeveloperProposalFile']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async (): Promise<Awaited<ReturnType<RendererApi['saveDeveloperProposalFile']>>> => {
        requireAuthority();
        // The one version, read alone, names the file — never a listing that a long history could outgrow (Issue #65 review).
        const version = await service.call('inspectDeveloperProposalVersion', { proposalVersionId: input.proposalVersionId });
        const destination = await chooseDeveloperProposalFile(owned, developerProposalFileName(version));
        if (destination === undefined) return { outcome: 'cancelled' };
        const proposal = await service.call('writeDeveloperProposalFile', { proposalVersionId: input.proposalVersionId, destination });
        return { outcome: 'saved', fileName: basename(destination), proposal };
      });
    }),
  );

  // ②A 分析反馈 (Issue #94, S38) is the route's Book's, as ②A is: the renderer names a revision, never the Book.
  ipcMain.handle(IPC_CHANNELS.inspectAnalysisFeedback, (event, input: Parameters<RendererApi['inspectAnalysisFeedback']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      const route = requireCurrentBookRoute(owned);
      const routeGeneration = owned.routeGeneration;
      const routeRequestSequence = owned.routeRequestSequence;
      const result = await service.call('inspectAnalysisFeedback', { bookId: route.bookId, revisionId: input.revisionId });
      requireCurrentRouteReadEpoch(owned, routeGeneration, routeRequestSequence);
      if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '分析反馈不属于当前图书工作台。');
      return result;
    }),
  );

  ipcMain.handle(IPC_CHANNELS.recordAnalysisFeedback, (event, input: Parameters<RendererApi['recordAnalysisFeedback']>[0]) =>
    envelope(async () => {
      const owned = requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        const route = requireCurrentBookRoute(owned);
        const routeGeneration = owned.routeGeneration;
        const result = await service.call('recordAnalysisFeedback', {
          bookId: route.bookId,
          revisionId: input.revisionId,
          itemKey: input.itemKey,
          itemDigest: input.itemDigest,
          expectedLatestSignalId: input.expectedLatestSignalId,
          judgment: input.judgment,
          reason: input.reason,
          correction: input.correction,
        });
        requireCurrentRouteGeneration(owned, routeGeneration);
        if (result.bookId !== route.bookId) throw new ServiceCallError('AI7_SERVICE_ROUTE_INVALID', '分析反馈不属于当前图书工作台。');
        return result;
      });
    }),
  );

}

export function registerReviewGuidelineVersionHandlers(context: {
  chooseGuidelineFile: NativeFilePickers['chooseGuidelineFile'];
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  requireAuthority: () => void;
  service: ServiceClient;
}) {
  const { chooseGuidelineFile, requireSender, serializeEffect, requireAuthority, service } = context;
  ipcMain.handle(
    IPC_CHANNELS.previewReviewGuidelineVersion,
    (event, input: { documentId: string; previewId?: string; clausePage?: number }) =>
      envelope(async () => {
        const owned = requireSender(event);
        requireDesktop(input !== null && typeof input === 'object' && typeof input.documentId === 'string' && input.documentId.length > 0 && input.documentId.length <= 64,
          'AI7_RENDERER_BOUNDARY_INVALID');
        return serializeEffect(async () => {
          requireAuthority();
          if (input.previewId !== undefined) {
            requireDesktop(typeof input.previewId === 'string' && input.previewId.length <= 64, 'AI7_RENDERER_BOUNDARY_INVALID');
            return service.call('previewReviewGuidelineVersion', { documentId: input.documentId, previewId: input.previewId,
              ...(input.clausePage === undefined ? {} : { clausePage: input.clausePage }) });
          }
          const path = await chooseGuidelineFile(owned);
          if (path === undefined) return null;
          return service.call('previewReviewGuidelineVersion', { documentId: input.documentId, path });
        });
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.importReviewGuidelineVersion,
    (event, input: ServiceOperationMap['importReviewGuidelineVersion']['input']) =>
      envelope(async () => {
        requireSender(event);
        return serializeEffect(async () => {
          requireAuthority();
          return service.call('importReviewGuidelineVersion', { previewId: input.previewId });
        });
      }),
  );

}
