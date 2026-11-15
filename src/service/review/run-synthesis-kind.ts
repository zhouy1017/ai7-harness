import type { DatabaseSync } from 'node:sqlite';
import { REVIEW_SYNTHESIS_PLAN_LINE } from '../../shared/review-synthesis-wording.js';
import { withProcedureDefinition } from '../procedures/execution.js';
import { resolveProcedureForKind } from '../procedures/composite.js';
import { canonicalJson, isRecord, sha256Hex } from '../analysis/canonical.js';
import type { AnalysisKindDefinition } from '../analysis/kind-definition.js';
import { reviewCategoryContractInput, type ReviewCategoryConfigurationEntry } from './category-configuration.js';
import { reviewCategoryKindDefinition } from './review-category-kind.js';
import { RUN_SYNTHESIS_PROMPT, RUN_SYNTHESIS_PROMPT_DIGEST, RUN_SYNTHESIS_SCHEMA, parseSynthesisSummary, synthesisMessage, type SynthesisInput } from './run-synthesis-contract.js';

export const RUN_SYNTHESIS_CATEGORY = 'run-synthesis';
export const RUN_SYNTHESIS_ENTRY: ReviewCategoryConfigurationEntry = {
  categoryId: RUN_SYNTHESIS_CATEGORY, label: '全书审阅统合总结', description: '统合各章已经形成的发现，解释共性问题与全书脉络，保留逐条发现供编辑处理。',
  output: 'annotation', riskPointsOnly: false, batchApply: false, searchEngine: false,
  executor: 'review-category-contract', unavailableReason: null, guidelineDocuments: [{ documentId: 'ai7-review-run-synthesis',
    title: '全书审阅统合', issuer: 'AI7', version: '1', clauses: [{ clauseId: 'run-synthesis/1', text: '只统合已经形成的发现与证据，保留逐条发现，由编辑判断。' }] }],
  procedure: { procedureId: 'ai7-procedure/review-run-synthesis', title: '全书审阅统合总结', version: '1' },
};

/** A book-level member of the existing review driver; its only model turn is cross-unit reduction. */
export function runSynthesisKind(db: DatabaseSync, key: string, source?: ReviewCategoryConfigurationEntry['synthesisSource']): AnalysisKindDefinition {
  const { contractIdentity: _identity, ...base } = reviewCategoryKindDefinition(reviewCategoryContractInput(RUN_SYNTHESIS_ENTRY));
  const input = (): SynthesisInput => {
    const row = db.prepare('SELECT input_json, input_digest FROM review_run_synthesis WHERE synthesis_key = ?').get(key);
    if (row === undefined || typeof row.input_json !== 'string' || sha256Hex(row.input_json) !== row.input_digest) throw new Error('REVIEW_SYNTHESIS_INPUT_INVALID');
    return JSON.parse(row.input_json) as SynthesisInput;
  };
  const message = (): string => synthesisMessage(input());
  const digest = sha256Hex(canonicalJson({ prompt: RUN_SYNTHESIS_PROMPT_DIGEST, structuredOnly: true }));
  const definition: AnalysisKindDefinition = { ...base, structuredOnly: true, structuredInputKey: key, systemPrompt: RUN_SYNTHESIS_PROMPT,
    priorBudgetUsage: () => {
      const row = db.prepare('SELECT prior_input_tokens, prior_output_tokens FROM review_run_synthesis WHERE synthesis_key = ?').get(key);
      return { inputTokens: Number(row?.prior_input_tokens ?? 0), outputTokens: Number(row?.prior_output_tokens ?? 0) };
    },
    promptContractDigest: RUN_SYNTHESIS_PROMPT_DIGEST, livePromptContractDigest: () => RUN_SYNTHESIS_PROMPT_DIGEST,
    schemaDigest: digest, reducerDigest: digest,
    executionSteps: [REVIEW_SYNTHESIS_PLAN_LINE],
    updateModes: ['review-again'], updateExecutionSteps: [REVIEW_SYNTHESIS_PLAN_LINE], assurance: null, assuranceAbsentReason: '统合总结保留原发现，由编辑判断。',
    crossUnit: { promptContractDigest: RUN_SYNTHESIS_PROMPT_DIGEST, resultSchema: RUN_SYNTHESIS_SCHEMA,
      step: { label: '全书审阅统合总结', minimumClosedUnits: 0, notEnoughReason: '', requiredForCompletion: true,
        buildMessage: message, requestDigest: () => sha256Hex(message()),
        parse: (text) => {
          const summary = parseSynthesisSummary(text, input());
          return summary === null ? { ok: false, code: 'summary-missing', detail: '未能形成统合总结；逐条发现仍可处理。' } : { ok: true, result: summary };
        } } },
    reduce: (value) => {
      const local = base.reduce(value);
      return { ...local, components: { ...local.components,
        runSynthesis: value.crossUnit.state === 'closed' ? value.crossUnit.result : null } };
    },
    revisionComponents: (body) => ({ ...base.revisionComponents(body), runSynthesis: isRecord(body.runSynthesis) ? body.runSynthesis : null }),
  };
  if (source?.procedure == null) return definition;
  const document = source.document ?? resolveProcedureForKind(db, source.procedure, source.kind).document;
  return withProcedureDefinition(definition, document, source.procedure);
}
