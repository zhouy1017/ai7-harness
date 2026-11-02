import type { NativeFilePickers } from './file-pickers.js';
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, type RendererApi, type WireServiceOperationMap as ServiceOperationMap } from '../shared/protocol.js';
import { ServiceClient } from './service-client.js';
import type { PreferenceStore } from './preferences.js';
import { UUID_PATTERN, envelope, requireDesktop } from './handler-guards.js';
import type { OwnedRendererWindow } from './application-types.js';

export function registerLibraryLearningHandlers(context: {
  chooseLibraryMaterialFile: NativeFilePickers['chooseLibraryMaterialFile'];
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  requireAuthority: () => void;
  service: ServiceClient;
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  preferences: PreferenceStore;
}) {
  const { chooseLibraryMaterialFile, requireSender, requireAuthority, service, serializeEffect, preferences } = context;

  // 知识库 › 资料库 (Issue #427, S79c): the renderer names no path — main's picker chooses the file — and names an item and a
  // decision only in the closed shapes the service checks again.
  ipcMain.handle(IPC_CHANNELS.inspectLibraryMaterials, (event, input: ServiceOperationMap['inspectLibraryMaterials']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      return service.call('inspectLibraryMaterials', { after: input?.after ?? null });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectLibraryMaterial, (event, input: ServiceOperationMap['inspectLibraryMaterial']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectLibraryMaterial', { materialId: input.materialId });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectResearchEvidence, (event, input: { bookId: string; after?: number | null; staleAfterDays?: number | null; taskIntentId?: string; reviewFindingId?: string }) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectResearchEvidence', { bookId: input.bookId, after: input.after ?? null, staleAfterDays: input.staleAfterDays ?? null,
        ...(input.taskIntentId === undefined ? {} : { taskIntentId: input.taskIntentId }),
        ...(input.reviewFindingId === undefined ? {} : { reviewFindingId: input.reviewFindingId }) });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.saveEvidenceAsMaterial,
    (event, input: { bookId: string; evidenceId: string; title?: string | null }) =>
      envelope(async () => {
        requireSender(event);
        requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
        return serializeEffect(async () => {
          requireAuthority();
          return service.call('saveEvidenceAsMaterial', { bookId: input.bookId, evidenceId: input.evidenceId, title: input.title ?? null });
        });
      }),
  );

  // Factual verification (Issue #901): reads go straight to the service; the decision and the save are serialized effects.
  ipcMain.handle(IPC_CHANNELS.inspectFactualVerification, (event, input: ServiceOperationMap['inspectFactualVerification']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectFactualVerification', {
        bookId: input.bookId, reviewRunId: input.reviewRunId ?? null, after: input.after ?? null, chapterBlockId: input.chapterBlockId ?? null,
        outcome: input.outcome ?? null, severity: input.severity ?? null, sourceCondition: input.sourceCondition ?? null, actionNeed: input.actionNeed ?? null,
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectEvidenceWorkspace, (event, input: ServiceOperationMap['inspectEvidenceWorkspace']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectEvidenceWorkspace', { bookId: input.bookId, resultId: input.resultId, sourcesAfter: input.sourcesAfter ?? null });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.recordVerificationReviewDecision, (event, input: ServiceOperationMap['recordVerificationReviewDecision']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('recordVerificationReviewDecision', {
          bookId: input.bookId, resultId: input.resultId, resultVersion: input.resultVersion, disposition: input.disposition,
          ownWords: input.ownWords ?? null, reason: input.reason ?? null,
        });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.prepareCorrectionProposal, (event, input: ServiceOperationMap['prepareCorrectionProposal']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('prepareCorrectionProposal', { bookId: input.bookId, resultId: input.resultId });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.saveCorrectionProposal, (event, input: ServiceOperationMap['saveCorrectionProposal']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('saveCorrectionProposal', {
          bookId: input.bookId, resultId: input.resultId, resultVersion: input.resultVersion, variantId: input.variantId ?? null,
          text: input.text, rationale: input.rationale, rangeIds: input.rangeIds,
        });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.readLibraryDecisionReason, (event, input: ServiceOperationMap['readLibraryDecisionReason']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('readLibraryDecisionReason', { materialId: input.materialId, ordinal: input.ordinal, offset: input.offset });
    }),
  );

  // 查看分段 (Issue #428, S80a): one page of an item's indexed paragraphs, by the item and the paragraph it starts at.
  ipcMain.handle(IPC_CHANNELS.inspectLibraryMaterialSegments, (event, input: ServiceOperationMap['inspectLibraryMaterialSegments']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectLibraryMaterialSegments', { materialId: input.materialId, from: input.from });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.searchReferableMaterials, (event, input: ServiceOperationMap['searchReferableMaterials']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('searchReferableMaterials', { bookId: input.bookId, query: input.query, k: input.k });
    }),
  );

  // 构建相似索引 (Issue #892): the item's vectors made on this machine, on request.
  ipcMain.handle(IPC_CHANNELS.buildMaterialVectors, (event, input: ServiceOperationMap['buildMaterialVectors']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('buildMaterialVectors', { materialId: input.materialId });
      });
    }),
  );

  // 相似段落检索 (Issue #892): an item's paragraphs nearest the editor's text; read-only.
  ipcMain.handle(IPC_CHANNELS.queryMaterialVectors, (event, input: ServiceOperationMap['queryMaterialVectors']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('queryMaterialVectors', { materialId: input.materialId, text: input.text, k: input.k });
    }),
  );

  // 生成来源译文 (Issue #892): asked for under the selected policy's rule; refused when none names it.
  ipcMain.handle(IPC_CHANNELS.requestMaterialTranslation, (event, input: ServiceOperationMap['requestMaterialTranslation']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('requestMaterialTranslation', { materialId: input.materialId });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.previewLibraryMaterial, (event) =>
    envelope(async () => {
      const owned = requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        const path = await chooseLibraryMaterialFile(owned);
        if (path === undefined) return null;
        return service.call('previewLibraryMaterial', { path });
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.addLibraryMaterial,
    (event, input: ServiceOperationMap['addLibraryMaterial']['input']) =>
      envelope(async () => {
        requireSender(event);
        requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
        return serializeEffect(async () => {
          requireAuthority();
          return service.call('addLibraryMaterial', { previewId: input.previewId, title: input.title, kind: input.kind, bookId: requireSender(event).bookId });
        });
      }),
  );

  // 知识库 › 社级编辑记忆 and 质量与学习 (Issue #911): house-wide, bound to no Book route. 更新本社审阅偏好 appends a version,
  // so it is serialized with every other effect.
  ipcMain.handle(IPC_CHANNELS.inspectEditorialLearning, (event, input: ServiceOperationMap['inspectEditorialLearning']['input']) => envelope(async () => {
    requireSender(event);
    requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
    requireAuthority();
    return service.call('inspectEditorialLearning', input);
  }));

  ipcMain.handle(IPC_CHANNELS.recordLearningReasonAsk, (event, input: Parameters<RendererApi['recordLearningReasonAsk']>[0]) => envelope(async () => {
    requireSender(event);
    requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
    return serializeEffect(async () => {
      requireAuthority();
      return service.call('recordLearningReasonAsk', { ...input, frequency: preferences.read().values['learning.askFrequency'] });
    });
  }));

  ipcMain.handle(IPC_CHANNELS.changeEditorialLearning, (event, input: ServiceOperationMap['changeEditorialLearning']['input']) => envelope(async () => {
    requireSender(event);
    requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
    return serializeEffect(async () => { requireAuthority(); return service.call('changeEditorialLearning', input); });
  }));

  ipcMain.handle(IPC_CHANNELS.createEditorialMemory, (event, input: ServiceOperationMap['createEditorialMemory']['input']) => envelope(async () => {
    requireSender(event);
    requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
    return serializeEffect(async () => { requireAuthority(); return service.call('createEditorialMemory', input); });
  }));

  ipcMain.handle(IPC_CHANNELS.deactivateEditorialMemory, (event, input: ServiceOperationMap['deactivateEditorialMemory']['input']) => envelope(async () => {
    requireSender(event);
    requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
    return serializeEffect(async () => { requireAuthority(); return service.call('deactivateEditorialMemory', input); });
  }));

  ipcMain.handle(IPC_CHANNELS.acceptEditorialMemory, (event, input: ServiceOperationMap['acceptEditorialMemory']['input']) => envelope(async () => {
    requireSender(event);
    requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
    return serializeEffect(async () => { requireAuthority(); return service.call('acceptEditorialMemory', input); });
  }));

  ipcMain.handle(IPC_CHANNELS.inspectGlobalAgentDialogue, (event, input: ServiceOperationMap['inspectGlobalAgentDialogue']['input']) => envelope(async () => {
    requireSender(event); requireAuthority();
    return service.call('inspectGlobalAgentDialogue', input);
  }));

  ipcMain.handle(IPC_CHANNELS.inspectGlobalAgent, (event) => envelope(async () => {
    requireSender(event); requireAuthority();
    return service.call('inspectGlobalAgent', {});
  }));

  for (const operation of ['prepareGlobalAgentTurn', 'recordLearningSupervision', 'askGlobalAgent', 'stopGlobalAgentAnswer', 'continueGlobalAgentAnswer', 'regenerateGlobalAgentAnswer'] as const) {
    ipcMain.handle(IPC_CHANNELS[operation], (event, input: ServiceOperationMap[typeof operation]['input']) => envelope(async () => {
      requireSender(event);
      return serializeEffect(async () => {
        requireAuthority();
        return service.call(operation, input);
      });
    }));
  }

  ipcMain.handle(IPC_CHANNELS.inspectHouseReviewPreference, (event) => envelope(async () => {
    requireSender(event); requireAuthority();
    return service.call('inspectHouseReviewPreference', {});
  }));

  ipcMain.handle(IPC_CHANNELS.rebuildHouseReviewPreference, (event) => envelope(async () => {
    requireSender(event);
    return serializeEffect(async () => {
      requireAuthority();
      return service.call('rebuildHouseReviewPreference', {});
    });
  }));

  ipcMain.handle(IPC_CHANNELS.inspectEditQualitySignals, (event, input: ServiceOperationMap['inspectEditQualitySignals']['input']) => envelope(async () => {
    requireSender(event); requireAuthority();
    requireDesktop(input !== null && typeof input === 'object' && Object.keys(input).every((key) => key === 'bookId' || key === 'preferenceAfter') && (input.bookId === null || (typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId))), 'AI7_RENDERER_BOUNDARY_INVALID');
    return service.call('inspectEditQualitySignals', input);
  }));

  // 质量与学习 › 学习准入 (Issue #61, S26b): a house-wide destination like 知识库, bound to no Book route; each decision names
  // its Book and is serialized with every other effect.
  ipcMain.handle(IPC_CHANNELS.inspectLearningMaterials, (event, input: ServiceOperationMap['inspectLearningMaterials']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectLearningMaterials', { bookId: input.bookId, after: input.after ?? null });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectLearningMaterial, (event, input: ServiceOperationMap['inspectLearningMaterial']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectLearningMaterial', { bookId: input.bookId, materialKey: input.materialKey });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectWordTrackedEditSample, (event, input: ServiceOperationMap['inspectWordTrackedEditSample']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object' && typeof input.bookId === 'string', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectWordTrackedEditSample', input);
    }),
  );

  // 设置 › 评估校准与预测 (Issue #430, S82): house settings, bound to no Book route; each write is serialized with every other
  // effect.
  ipcMain.handle(IPC_CHANNELS.inspectEvaluationCalibration, (event, input: ServiceOperationMap['inspectEvaluationCalibration']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      requireAuthority();
      return service.call('inspectEvaluationCalibration', { after: input.after, focusBookId: input.focusBookId });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.recordPublicationActuals, (event, input: ServiceOperationMap['recordPublicationActuals']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('recordPublicationActuals', {
          bookId: input.bookId, publicationVersionId: input.publicationVersionId, expectedEntries: input.expectedEntries, priceFen: input.priceFen,
          firstPrint: input.firstPrint,
        });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.setEvaluationPreferences, (event, input: ServiceOperationMap['setEvaluationPreferences']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('setEvaluationPreferences', {
          expectedEntries: input.expectedEntries, predictionEnabled: input.predictionEnabled, calibrationEnabled: input.calibrationEnabled,
        });
      });
    }),
  );

}

export function registerLearningDecisionHandlers(context: {
  requireSender: (event: IpcMainInvokeEvent | IpcMainEvent) => OwnedRendererWindow;
  requireAuthority: () => void;
  service: ServiceClient;
  serializeEffect: <Result>(operation: () => Promise<Result>) => Promise<Result>;
}) {
  const { requireSender, requireAuthority, service, serializeEffect } = context;
  // 书系知识 (Issue #63, S28b): house-wide and serialized; a candidate that cites a manuscript span comes from the window that
  // holds that manuscript's capability, exactly as a mark does.
  ipcMain.handle(IPC_CHANNELS.inspectFeedbackHistory, (event, input: ServiceOperationMap['inspectFeedbackHistory']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return service.call('inspectFeedbackHistory', input);
    }),
  );

  // 质量与学习 › 学习回溯 (Issue #62, S27a): house-wide reads, and 停止今后使用 serialized with every other record.
  ipcMain.handle(IPC_CHANNELS.inspectLearningAudit, (event, input: ServiceOperationMap['inspectLearningAudit']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return service.call('inspectLearningAudit', input);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.inspectLearningLineage, (event, input: ServiceOperationMap['inspectLearningLineage']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return service.call('inspectLearningLineage', { bookId: input.bookId, materialKey: input.materialKey });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.previewLearningRemediation, (event, input: ServiceOperationMap['previewLearningRemediation']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireAuthority();
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return service.call('previewLearningRemediation', { bookId: input.bookId, items: input.items });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.recordLearningRemediation, (event, input: ServiceOperationMap['recordLearningRemediation']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('recordLearningRemediation', { bookId: input.bookId, items: input.items, previewDigest: input.previewDigest });
      });
    }),
  );

  ipcMain.handle(IPC_CHANNELS.decideLearningMaterial, (event, input: ServiceOperationMap['decideLearningMaterial']['input']) =>
    envelope(async () => {
      requireSender(event);
      requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
      return serializeEffect(async () => {
        requireAuthority();
        return service.call('decideLearningMaterial', {
          bookId: input.bookId,
          materialKey: input.materialKey,
          materialDigest: input.materialDigest,
          expectedDecisions: input.expectedDecisions,
          choice: input.choice,
          note: input.note,
        });
      });
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.decideLibraryMaterial,
    (event, input: ServiceOperationMap['decideLibraryMaterial']['input']) =>
      envelope(async () => {
        requireSender(event);
        requireDesktop(input !== null && typeof input === 'object', 'AI7_RENDERER_BOUNDARY_INVALID');
        return serializeEffect(async () => {
          requireAuthority();
          return service.call('decideLibraryMaterial', {
            materialId: input.materialId,
            expectedDecisions: input.expectedDecisions,
            decision: input.decision,
          });
        });
      }),
  );

}
