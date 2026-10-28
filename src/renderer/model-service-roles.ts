import type { ModelConnectionTestStatus, ModelServiceSettingsProjection, RendererApi } from '../shared/protocol.js';

/** What a route's last text connection test came to, as 设置 › 模型服务 says it on the route and on the Main role. */
export function modelConnectionTestLabel(test: ModelConnectionTestStatus | null | undefined): string {
  if (test == null) return '尚未测试；保存凭据不等于连接成功';
  if (test.outcome === 'passed') return `文本连接测试通过 · ${test.modelId}`;
  return `文本连接测试${test.outcome === 'outcome-unknown' ? '结果待确认；不会自动重试' : test.outcome === 'cancelled' ? '已取消' : '未通过'} · ${test.code ?? ''}`;
}

export const MODEL_CONNECTION_TEST_NOTE = '测试只发送固定公开合成消息，不含图书文字；仅核验缓冲文本，不核验工具或流式。';
export const MAIN_ROLE_CONNECTION_TEST_LABEL = '测试主编辑模型连接';

/**
 * The Main Editorial Role's connection test (ADR 0096 §3; Issue #1177): the same explicit text test the Fast role has, over the
 * same main-process path, for the route new Tasks use and the Main role's model on it. Absent until that route's credential is
 * ready; the result is the route's own connection test record, so the route's card reads it too.
 */
export function mainRoleConnectionTest(
  projection: ModelServiceSettingsProjection,
  options: {
    api: Pick<RendererApi, 'testModelServiceConnection'>;
    render(next: ModelServiceSettingsProjection): void;
    setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
    errorMessage(error: unknown, fallback: string): string;
  },
): HTMLElement | null {
  const route = projection.routeChoice.routes.find((option) => option.inUse && option.connection?.credentialOperationState === 'ready');
  const binding = projection.roles.find((role) => role.roleId === 'main-editorial')?.binding ?? null;
  if (route === undefined || binding === null) return null;
  const tested = route.connection?.connectionTest;
  const section = document.createElement('div');
  section.className = 'button-row model-main-role-test';
  const line = document.createElement('p');
  line.className = 'field-note';
  line.textContent = tested?.modelId === binding.modelId ? modelConnectionTestLabel(tested) : modelConnectionTestLabel(null);
  const note = document.createElement('p');
  note.className = 'field-note';
  note.textContent = MODEL_CONNECTION_TEST_NOTE;
  const test = document.createElement('button');
  test.type = 'button';
  test.className = 'secondary';
  test.textContent = MAIN_ROLE_CONNECTION_TEST_LABEL;
  test.dataset['action'] = 'test-main-role-connection';
  test.dataset['modelRoute'] = route.route;
  test.addEventListener('click', () => void (async () => {
    test.disabled = true;
    try { options.render(await options.api.testModelServiceConnection({ route: route.route, modelId: binding.modelId })); }
    catch (error) { test.disabled = false; options.setStatus(options.errorMessage(error, '连接测试没有完成；不会自动重试。'), 'error'); }
  })());
  section.append(line, note, test);
  return section;
}
