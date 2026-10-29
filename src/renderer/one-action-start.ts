import type { TaskPlanProjection } from '../shared/protocol.js';

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
  if (plan.kind !== 'review-run' || plan.start.readiness !== 'ready') return { kind: 'preview' };
  return { kind: 'authorize', planDigests: plan.start.categoryDigests };
}
