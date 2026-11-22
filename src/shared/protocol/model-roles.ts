import type { RuntimeExecutionConfig } from '../runtime-execution-config.js';
import type { ModelServiceBindingProjection, ModelServiceConnectionId } from './model-service.js';

/**
 * The four Model Roles of ADR 0107 §1 — 前台 / 底层 × Pro / Flash. Pro and Flash name a capability tier, never a vendor's model.
 * Each role may hold its own choice; absent choices follow the foreground roles (Issue #1650). Legacy tier requests still
 * choose the model both Flash roles use (Issue #1620); independent role requests belong to R5-F1.
 */
export const MODEL_ROLE_IDS = ['foreground-pro', 'foreground-flash', 'underlying-pro', 'underlying-flash'] as const;
export type ModelRoleId = (typeof MODEL_ROLE_IDS)[number];
export type ModelTier = 'pro' | 'flash';

/** The ids a stored row, a ledger record or a settings card of 0.7.3 and earlier names a role by (ADR 0107 §1, aliases). */
export type LegacyModelRoleId = 'fast-interaction' | 'main-editorial' | 'difficult-escalation' | 'frontier';

/** The role names the launch policy, the ledgers and the Credential Broker record; they stay as written (ADR 0107 §1). */
export type ModelRolePolicyName = 'Main Editorial Role' | 'Fast Interaction Role';

const ROLE_ALIASES: Readonly<Record<string, ModelRoleId>> = {
  'main-editorial': 'foreground-pro', 'Main Editorial Role': 'foreground-pro',
  'fast-interaction': 'underlying-flash', 'Fast Interaction Role': 'underlying-flash',
  'difficult-escalation': 'underlying-pro', 'Difficult Escalation Role': 'underlying-pro',
  frontier: 'underlying-pro', 'Frontier Model Role': 'underlying-pro',
};

/** A role as any reader receives it — a current id, a legacy id or a recorded policy name; `null` for anything else. */
export function modelRoleIdOf(value: unknown): ModelRoleId | null {
  if (typeof value !== 'string') return null;
  return (MODEL_ROLE_IDS as readonly string[]).includes(value) ? value as ModelRoleId : Object.hasOwn(ROLE_ALIASES, value) ? ROLE_ALIASES[value]! : null;
}

export function modelTierOf(role: ModelRoleId): ModelTier {
  return role.endsWith('-pro') ? 'pro' : 'flash';
}

/**
 * The role each task kind belongs to (ADR 0107 §1–§2). Two kinds the ADR does not name run behind the scenes on the Pro tier,
 * so they are 底层 Pro until R5-F1 decides: `material-index` and `review-reduction`. A kind not listed here is a 前台 Pro kind
 * (`editorial-review/*`, `custom-analysis/*`, `writing`, …). No product code reads this map yet: every launch still names
 * `Main Editorial Role` or `Fast Interaction Role`, and R5-F1 rewires each call site to its role.
 */
export const MODEL_ROLE_OF_TASK_KIND: Readonly<Record<string, ModelRoleId>> = {
  'editorial-dialogue': 'foreground-flash',
  'global-agent-dialogue': 'foreground-flash',
  'global-agent-scoped-dialogue': 'foreground-flash',
  'editorial-polish': 'foreground-flash',
  'scoped-edit': 'foreground-flash',
  'conflict-regenerate': 'foreground-flash',
  'material-translation': 'underlying-flash',
  'model-connection-test': 'underlying-flash',
  'standards-table-formatting': 'underlying-flash',
  'learning-sample-tidying': 'underlying-flash',
  'retrieval-query-expansion': 'underlying-flash',
  'retrieval-rerank': 'underlying-flash',
  'guideline-clause-formatting': 'underlying-flash',
  'learning-curation': 'underlying-pro',
  'learning-synthesis': 'underlying-pro',
  'material-index': 'underlying-pro',
  'review-reduction': 'underlying-pro',
};

/** The kinds ADR 0107 §1–§2 names that no launch-policy rule runs yet (R5-F1 and later slices add them). */
export const MODEL_ROLE_KINDS_NOT_YET_LAUNCHED: ReadonlySet<string> = new Set(['standards-table-formatting', 'learning-sample-tidying',
  'retrieval-query-expansion', 'retrieval-rerank', 'guideline-clause-formatting', 'learning-synthesis']);

export function modelRoleOfTaskKind(kind: string): ModelRoleId {
  return Object.hasOwn(MODEL_ROLE_OF_TASK_KIND, kind) ? MODEL_ROLE_OF_TASK_KIND[kind]! : 'foreground-pro';
}

/** What 设置 › 模型服务 names each role and what it is for (ADR 0107 §1). */
export const MODEL_ROLE_LABELS: Readonly<Record<ModelRoleId, { readonly roleLabel: string; readonly purposeLabel: string }>> = {
  'foreground-pro': { roleLabel: '前台 Pro', purposeLabel: '主审校与深度创作' },
  'foreground-flash': { roleLabel: '前台 Flash', purposeLabel: '即时对话与局部微调' },
  'underlying-pro': { roleLabel: '底层 Pro', purposeLabel: '自主学习与深度归纳' },
  'underlying-flash': { roleLabel: '底层 Flash', purposeLabel: '底层转换与检索整理' },
};

/**
 * Where a role's effective model comes from: the editor's Pro or Flash choice; following 前台 Pro because no Flash model is
 * chosen; or following 前台 Pro, its choice kept, because the chosen Flash model's key is not usable now or its channel cannot
 * send that model (#1582).
 */
export type ModelRoleSource = 'pro-tier' | 'flash-tier' | 'follows-foreground-pro' | 'flash-unavailable-follows-foreground-pro'
  | 'flash-not-served-follows-foreground-pro';

export const MODEL_ROLE_SOURCE_LABELS: Readonly<Record<ModelRoleSource, string>> = {
  'pro-tier': '使用所选 Pro 模型',
  'flash-tier': '使用所选 Flash 模型',
  'follows-foreground-pro': '跟随前台 Pro',
  'flash-unavailable-follows-foreground-pro': '已选的 Flash 模型暂时不可用，现在跟随前台 Pro',
  'flash-not-served-follows-foreground-pro': '这个渠道暂时还不能使用已选的 Flash 模型，现在跟随前台 Pro',
};

export type ModelRoleStatus = 'available' | 'setup-required' | 'needs-attention' | 'unavailable';

export type ModelRoleStatusLabel = '可用' | '需设置' | '需处理' | '不可用';

/** One of the four roles as 设置 › 模型服务 shows it (Issue #1620): its effective model, 思考强度 and where they come from. */
export interface ModelRoleResolutionProjection {
  roleId: ModelRoleId;
  roleLabel: string;
  purposeLabel: string;
  tier: ModelTier;
  source: ModelRoleSource;
  sourceLabel: string;
  /** The effective channel, model and 思考强度; `null` while no Pro model can be used. */
  binding: ModelServiceBindingProjection | null;
  status: ModelRoleStatus;
  statusLabel: ModelRoleStatusLabel;
  /** Why the role needs attention although its key is ready — the stored model cannot be sent (#1582); `null` otherwise. */
  statusDetail: string | null;
}

/** Choose the Pro or the Flash model (Issue #1620), with its own 思考强度. */
export interface ModelTierSelectionInput extends Pick<RuntimeExecutionConfig, 'reasoningEffort'> {
  route: import('./model-service.js').ModelServiceRouteId;
  modelId: string;
}

export type ModelCredentialOperationState = 'ready' | 'missing' | 'needs-attention';

export interface ModelServiceConnectionProjection {
  connectionId: ModelServiceConnectionId;
  /** The stored row's role id, which every connection row has always carried; read as `foreground-pro`. */
  roleId: 'main-editorial';
  connectionName: string;
  binding: ModelServiceBindingProjection;
  fastBinding?: ModelServiceBindingProjection;
  credentialReference: string;
  credentialOperationState: ModelCredentialOperationState;
  createdAt: string;
  updatedAt: string;
  credentialUpdatedAt: string;
  /** Whether the editor chose this route for the Tasks they start from now on (Issue #811). */
  selected: boolean;
  /** Independent Fast choice; Main's legacy selected column keeps its meaning. */
  fastSelected?: boolean;
  connectionTest?: ModelConnectionTestStatus | null;
  /**
   * The newest test result of each model tested on this connection since the service started — the main model, the lighter
   * model, a model tested before it was chosen — newest first; `connectionTest` is the first of them. The lighter model's
   * result is held in memory only, so after a restart it is gone until tested again.
   */
  connectionTests?: ModelConnectionTestStatus[];
}

/** Exact-binding public text-probe result; only its bounded reply and provenance are retained. */
export interface ModelConnectionTestStatus {
  responseText?: string;
  modelId: string;
  credentialUpdatedAt: string;
  testedAt: string;
  outcome: 'passed' | 'failed' | 'outcome-unknown' | 'cancelled';
  code: string | null;
  verified: 'buffered-text-only';
  provenance?: ModelTextAttemptProvenance;
}

export interface ModelTextAttemptProvenance {
  readonly role: 'Fast Interaction Role';
  readonly route: string;
  readonly model: string;
  readonly endpoint: string;
  readonly credentialSlot: string;
  readonly credentialReference: string;
  readonly policyVersion: string;
  readonly bindingDigest: string;
  readonly credentialUpdatedAt?: string;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens?: number; readonly reasoningTokens?: number } | null;
  readonly failureCode: string | null;
}

/** The 0.7.3 selection input (`selectMainRoleModel` / `selectFastRoleModel`); kept until the settings page moves (#1547). */
export type FastModelSelectionInput = ModelTierSelectionInput;

/** Atomic two-role selection carries independent defaults. */
export interface BothRoleModelSelectionInput extends FastModelSelectionInput {
  fastReasoningEffort?: RuntimeExecutionConfig['reasoningEffort'];
}

/** The 0.7.3 settings card of a role, by its legacy id; kept beside `modelRoles` until the settings page moves (#1547). */
export interface ModelRoleCardProjection {
  roleId: LegacyModelRoleId;
  roleLabel: '快速交互角色' | '主编辑角色' | '疑难升级角色' | '前沿模型角色';
  purposeLabel: string;
  status: ModelRoleStatus;
  statusLabel: ModelRoleStatusLabel;
  statusDetail: string;
  binding: ModelServiceBindingProjection | null;
  connection: ModelServiceConnectionProjection | null;
}
