import { describe, expect, it } from 'vitest';
import defaults from '../../config/runtime-execution-defaults.json' with { type: 'json' };
import { modelServiceChannels } from '../../src/service/launch-policy.js';
import { CONFIGURED_ALTERNATE_ROUTE_MODELS, CONFIGURED_RECOMMENDED_MODELS, CONFIGURED_RUNTIME_MODEL_TABLE } from '../../src/shared/provider-configuration.generated.js';
import { GENERATED_MODEL_PROFILES, GENERATED_ROUTE_DISPOSITIONS } from '../../src/service/provider/provider-profiles.generated.js';
import {
  MODEL_ROLE_IDS, MODEL_ROLE_KINDS_NOT_YET_LAUNCHED, MODEL_ROLE_OF_TASK_KIND, MODEL_ROUTE_NOT_SERVED_REASON, MODEL_SERVICE_CHANNELS, modelRoleIdOf, modelRoleOfTaskKind, modelServiceChannelOf,
  modelServiceRouteRefusal, modelServiceRuntimeBinding, modelTierOf, type ModelServiceRouteId,
} from '../../src/shared/protocol.js';

// Issue #1620: the four roles of ADR 0107 §1, the recommended models as provider records, and #1582's routing.

describe('the role of each task kind (ADR 0107 §1–§2)', () => {
  it('gives every kind of every launch-policy rule a role of the tier its recorded role names', () => {
    const rules = [...defaults.ordinary, ...defaults.developer];
    expect(rules.length).toBeGreaterThan(20);
    for (const rule of rules) {
      const tier = rule.modelRole === 'Main Editorial Role' ? 'pro' : 'flash';
      for (const kind of rule.taskKinds) expect(modelTierOf(modelRoleOfTaskKind(kind)), `${rule.ruleId} ${kind}`).toBe(tier);
    }
    expect(['editorial-dialogue', 'scoped-edit', 'conflict-regenerate'].map(modelRoleOfTaskKind)).toEqual(['foreground-flash', 'foreground-flash', 'foreground-flash']);
    expect(['material-translation', 'model-connection-test', 'learning-curation', 'writing'].map(modelRoleOfTaskKind))
      .toEqual(['underlying-flash', 'underlying-flash', 'underlying-pro', 'foreground-pro']);
  });

  it('holds exactly the rows of ADR 0107 §1–§2 and the two kinds it does not name, kind by kind', () => {
    expect(MODEL_ROLE_OF_TASK_KIND).toEqual({
      // §1 前台 Flash
      'editorial-dialogue': 'foreground-flash', 'global-agent-dialogue': 'foreground-flash', 'global-agent-scoped-dialogue': 'foreground-flash',
      'editorial-polish': 'foreground-flash', 'scoped-edit': 'foreground-flash', 'conflict-regenerate': 'foreground-flash',
      // §2 底层 Flash
      'material-translation': 'underlying-flash', 'model-connection-test': 'underlying-flash', 'standards-table-formatting': 'underlying-flash',
      'learning-sample-tidying': 'underlying-flash', 'retrieval-query-expansion': 'underlying-flash', 'retrieval-rerank': 'underlying-flash',
      'guideline-clause-formatting': 'underlying-flash',
      // §1 底层 Pro, and the two background Pro kinds the ADR does not name (R5-F1 confirms or moves them)
      'learning-curation': 'underlying-pro', 'learning-synthesis': 'underlying-pro', 'material-index': 'underlying-pro', 'review-reduction': 'underlying-pro',
    });
    // §1 前台 Pro: every other kind, prototype names included.
    expect(['writing', 'factual-review', 'factual-recheck', 'baseline-manuscript-analysis', 'evaluation', 'editorial-review/run-synthesis', 'constructor', 'toString']
      .map(modelRoleOfTaskKind)).toEqual(Array(8).fill('foreground-pro'));
    // The §2 kinds no rule runs yet are exactly the ones the launch policy does not name; scoped edit launches without a rule of its own.
    const ruled = new Set([...defaults.ordinary, ...defaults.developer].flatMap((rule) => rule.taskKinds).concat('scoped-edit'));
    expect(Object.keys(MODEL_ROLE_OF_TASK_KIND).filter((kind) => !ruled.has(kind)).sort()).toEqual([...MODEL_ROLE_KINDS_NOT_YET_LAUNCHED].sort());
  });

  it('reads current ids, every legacy id and recorded policy name, and nothing else', () => {
    expect(MODEL_ROLE_IDS.map(modelRoleIdOf)).toEqual([...MODEL_ROLE_IDS]);
    expect(Object.fromEntries(['main-editorial', 'Main Editorial Role', 'fast-interaction', 'Fast Interaction Role', 'difficult-escalation',
      'Difficult Escalation Role', 'frontier', 'Frontier Model Role', 'other', 'constructor'].map((value) => [value, modelRoleIdOf(value)]))).toEqual({
      'main-editorial': 'foreground-pro', 'Main Editorial Role': 'foreground-pro', 'fast-interaction': 'underlying-flash', 'Fast Interaction Role': 'underlying-flash',
      'difficult-escalation': 'underlying-pro', 'Difficult Escalation Role': 'underlying-pro', frontier: 'underlying-pro', 'Frontier Model Role': 'underlying-pro',
      other: null, constructor: null,
    });
    expect(modelRoleIdOf(3)).toBeNull();
  });
});

/** The resolution of 0.7.3, kept here as the base the change is measured against (#1582). */
function baseRuntimeBinding(route: ModelServiceRouteId, modelId: string, role: 'main' | 'fast') {
  const rows = CONFIGURED_RUNTIME_MODEL_TABLE.policyBaseline[role];
  const channel = rows.find((row) => row.model === modelId && modelServiceChannelOf(row.route) === route) ?? rows.find((row) => row.route === route);
  return channel === undefined ? undefined : { ...channel, model: modelId };
}

const familyOf = (route: string) => GENERATED_ROUTE_DISPOSITIONS[route as keyof typeof GENERATED_ROUTE_DISPOSITIONS].family;

describe('a model declared on another route of its channel (#1582)', () => {
  it('keeps every model that resolved to a row of its own family on the same row, endpoint and encoder; changes exactly the others', () => {
    const changed: string[] = [];
    for (const channel of MODEL_SERVICE_CHANNELS) {
      const declared = GENERATED_MODEL_PROFILES.filter((model) => modelServiceChannelOf(model.route) === channel);
      const cases = [...declared.map((model) => ({ id: model.model, route: model.route })), { id: 'account-custom-model', route: channel }];
      for (const { id, route } of cases) for (const role of ['main', 'fast'] as const) {
        const base = baseRuntimeBinding(channel, id, role), head = modelServiceRuntimeBinding(channel, id, role);
        const declaredOnFirst = declared.some((model) => model.model === id && model.route === channel);
        const baseWorked = base !== undefined && (declaredOnFirst || route === channel || familyOf(base.route) === familyOf(route));
        if (baseWorked) { expect(head, `${channel}/${id}/${role}`).toEqual(base); continue; }
        expect(CONFIGURED_ALTERNATE_ROUTE_MODELS[route], `${channel}/${id}`).toContain(id);
        expect(head === undefined || head.route === route, `${channel}/${id}/${role}`).toBe(true);
        if (role === 'main') changed.push(`${route}/${id} → ${head === undefined ? 'refused' : head.endpoint}`);
      }
    }
    // Exactly the alternate-route models with no row of their own: Zen's go to their own route, Go's are refused.
    const expected = Object.entries(CONFIGURED_ALTERNATE_ROUTE_MODELS).flatMap(([route, models]) => models
      .filter((model) => !CONFIGURED_RUNTIME_MODEL_TABLE.policyBaseline.main.some((row) => row.route === route && row.model === model))
      .map((model) => `${route}/${model}`));
    expect(changed.map((entry) => entry.slice(0, entry.indexOf(' → '))).sort()).toEqual([...new Set(expected)].sort());
    expect(changed.filter((entry) => entry.startsWith('opencode-go-')).every((entry) => entry.endsWith('refused'))).toBe(true);
    expect(changed.filter((entry) => entry.startsWith('opencode-zen-')).every((entry) => !entry.endsWith('refused'))).toBe(true);
  });

  it('says one plain sentence for a model no route serves, and nothing for one it serves or a custom id', () => {
    expect(modelServiceRouteRefusal('opencode-go', 'gpt-5.6-luna')).toBe(MODEL_ROUTE_NOT_SERVED_REASON);
    expect(modelServiceRouteRefusal('opencode-go', 'minimax-m3', 'fast')).toBe(MODEL_ROUTE_NOT_SERVED_REASON);
    expect([modelServiceRouteRefusal('opencode-zen', 'gpt-6-sol'), modelServiceRouteRefusal('opencode-go', 'go-custom-model'),
      modelServiceRouteRefusal('opencode-go', 'kimi-k3')]).toEqual([null, null, null]);
    const go = modelServiceChannels().find((channel) => channel.channelId === 'opencode-go')!;
    expect(go.models.filter((model) => model.main === 'route-not-served').map((model) => model.modelId).sort())
      .toEqual([...CONFIGURED_ALTERNATE_ROUTE_MODELS['opencode-go-messages']!, ...CONFIGURED_ALTERNATE_ROUTE_MODELS['opencode-go-responses']!].sort());
  });
});

describe('recommended models (Issue #1620)', () => {
  it('projects each channel document\'s recommendation, each a model it lists that a runtime row serves', () => {
    const channels = modelServiceChannels();
    for (const channel of channels) {
      expect(channel.recommended, channel.channelId).toEqual(CONFIGURED_RECOMMENDED_MODELS[channel.channelId]);
      for (const modelId of [...channel.recommended?.pro ?? [], ...channel.recommended?.flash ?? []]) {
        expect(channel.models.some((model) => model.modelId === modelId), `${channel.channelId}/${modelId}`).toBe(true);
        expect(modelServiceRuntimeBinding(channel.channelId, modelId, 'main'), `${channel.channelId}/${modelId}`).toBeDefined();
        expect(modelServiceRouteRefusal(channel.channelId, modelId)).toBeNull();
      }
    }
    expect(Object.keys(CONFIGURED_RECOMMENDED_MODELS).sort()).toEqual([...MODEL_SERVICE_CHANNELS].sort());
  });
});
