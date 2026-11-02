import type { RendererApi, TaskPlanKind, TaskPlanProjection } from '../shared/protocol.js';

/**
 * Starting a procedure from its sheet is the one explicit action (ADR 0096 §3, extending ADR 0094 §6): when its bar would
 * offer 开始任务 as it stands, the sheet's 开始审阅 records the Run Authorization for exactly the digests the plan shows, and
 * the plan stays one disclosure away in the Task Drawer. The editable plan that keeps its preview is a baseline analysis
 * Task's (S73); a Review Run's Plan Adaptations, Run Budget Ceiling and Evidence Assurance Level are defaults the editor
 * changes through 先看计划. A plan whose boundary moved (`changed`), whose route needs a model connection, reaches no
 * executable route or waits for the network opens first, where the drawer says why and asks for the decision before dispatch.
 */
export type OneActionStart =
  | { readonly kind: 'authorize'; readonly planDigests: TaskPlanProjection['start']['categoryDigests'] }
  | { readonly kind: 'preview' };

export function oneActionStart(plan: Pick<TaskPlanProjection, 'kind' | 'start'>): OneActionStart {
  if (!['ready', 'record-only', 'no-route'].includes(plan.start.readiness)) return { kind: 'preview' };
  return { kind: 'authorize', planDigests: plan.start.categoryDigests };
}

/** The user's Start click prepares and authorizes one exact plan; plan inspection stays optional. */
export async function startPreparedTask(api: Partial<RendererApi>, kind: TaskPlanKind, ref: string): Promise<void> {
  if (api.inspectTaskPlan === undefined) throw new Error('无法读取任务计划。');
  const plan = await api.inspectTaskPlan({ kind, ref });
  if (kind === 'review-run') {
    if (api.authorizeReviewRun === undefined) throw new Error('无法开始审阅。');
    await api.authorizeReviewRun({ reviewRunId: ref, planDigests: plan.start.categoryDigests });
    return;
  }
  const planEnvelopeDigest = plan.start.planEnvelopeDigest;
  if (planEnvelopeDigest === null) throw new Error('任务计划尚未准备完成。');
  const authorize = kind === 'baseline-analysis' ? api.authorizeBaselineAnalysis
    : kind === 'writing' ? api.authorizeWritingTask
    : kind === 'initial-evaluation' ? api.authorizeInitialEvaluation
    : kind === 'readers-report' ? api.authorizeReadersReport
    : kind === 'evaluation-rewrite' ? api.authorizeEvaluationRewrite : api.authorizeTaskAuthorization;
  if (authorize === undefined) throw new Error('无法开始任务。');
  await authorize({ taskIntentId: ref, planEnvelopeDigest });
}
