import { EditorialStore } from '../../src/service/store.js';
import { createServiceTestRoots } from './temp-data-root.js';
import { modelServiceSettingsProjection } from '../../src/main/model-service-settings-projection.js';
import { MODEL_ROLE_IDS, type ModelServiceStoredStateProjection } from '../../src/shared/protocol.js';
import { sha256Hex } from '../../src/service/analysis/canonical.js';
import { vi } from 'vitest';
import { seedModelEfforts } from './model-effort-catalogue.js';

function snapshot(store: EditorialStore) {
  const connections = store.getModelServiceConnections(), modelRoles = store.getModelRoles();
  const state: ModelServiceStoredStateProjection = { proxy: { mode: 'direct' }, connection: null, connections, channels: [], modelRoles,
    launchPolicy: {} as ModelServiceStoredStateProjection['launchPolicy'] };
  const settings = modelServiceSettingsProjection(state, connections, store.getSearchBackendSettings(), true, 'win32');
  const overrides = [{}, ...connections.map(connection => ({ modelConnectionId: connection.connectionId }))];
  return { connections, modelRoles, cards: settings.roles, settingsModelRoles: JSON.stringify(settings.modelRoles),
    bindings: overrides.map(override => MODEL_ROLE_IDS.map(role => {
      const binding = store.getConfiguredModelRoleBinding(role, override);
      return { binding, digest: sha256Hex(JSON.stringify(binding)) };
    })) };
}

/** Run identically at M1 and the new storage head; no provider, key value or manuscript is involved. */
export async function captureModelRoleSequences(): Promise<Record<string, unknown[]>> {
  const answers: Record<string, unknown[]> = {};
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    for (const name of ['route-with-flash', 'credential-cycle', 'selection-cycle', 'effort-and-both']) {
      vi.setSystemTime(new Date('2026-11-21T00:00:00Z'));
      const roots = await createServiceTestRoots('ai7-role-sequences-');
      const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        const claude = store.saveModelServiceConnection('Synthetic Claude', '00000000-0000-4000-8000-000000001650', 'ready', 'anthropic-claude');
        const go = store.saveModelServiceConnection('Synthetic Go', '00000000-0000-4000-8000-000000001651', 'ready', 'opencode-go');
        const discoverClaude = () => seedModelEfforts(store, 'anthropic-claude', {
          'claude-opus-5': ['high'], 'claude-haiku-4-5': ['low'], 'claude-fable-5-1': ['high'], 'claude-sonnet-5': ['low', 'high'],
        });
        const discoverGo = () => seedModelEfforts(store, 'opencode-go', { 'glm-5.3-flash': ['low', 'medium'], 'deepseek-v4.1-flash': ['medium'] });
        discoverClaude(); discoverGo();
        store.selectMainRoleModel('anthropic-claude', 'claude-opus-5', 'high');
        const steps: Record<string, Array<() => void>> = {
          'route-with-flash': [() => store.selectFastRoleModel('opencode-go', 'glm-5.3-flash', 'low'),
            () => store.selectModelServiceRoute('opencode-go'), () => store.selectModelServiceRoute('anthropic-claude')],
          'credential-cycle': [() => store.selectFastRoleModel('opencode-go', 'glm-5.3-flash', 'low'),
            () => { store.saveModelServiceConnection('Synthetic Go resaved', go.credentialReference, 'ready', 'opencode-go'); discoverGo(); },
            () => { store.setModelServiceCredentialState(go.credentialReference, 'needs-attention'); store.setModelServiceCredentialState(go.credentialReference, 'missing'); },
            () => { store.setModelServiceCredentialState(go.credentialReference, 'ready'); discoverGo(); }],
          'selection-cycle': [() => store.selectFastRoleModel('anthropic-claude', 'claude-haiku-4-5', 'low'),
            () => store.selectMainRoleModel('opencode-go', 'deepseek-v4.1-flash', 'medium'), () => store.clearFlashModel(),
            () => store.selectFastRoleModel('anthropic-claude', 'claude-fable-5-1', 'high')],
          'effort-and-both': [() => store.selectBothRoleModels('anthropic-claude', 'claude-sonnet-5', 'high', 'low'),
            () => store.selectMainRoleModel('anthropic-claude', 'claude-opus-5', 'off'),
            () => { store.saveModelServiceConnection('Synthetic Claude resaved', claude.credentialReference, 'ready', 'anthropic-claude'); discoverClaude(); },
            () => store.selectBothRoleModels('opencode-go', 'glm-5.3-flash', 'medium', 'off')],
        };
        answers[name] = [snapshot(store)];
        for (const [index, step] of steps[name]!.entries()) {
          vi.setSystemTime(new Date(Date.parse('2026-11-21T00:00:00Z') + (index + 1) * 1000));
          step(); answers[name]!.push(snapshot(store));
        }
      } finally { store.close(); await roots.dispose(); }
    }
  } finally { vi.useRealTimers(); }
  return answers;
}
