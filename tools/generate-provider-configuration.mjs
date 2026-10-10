import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePolicyDocument } from './validate-policies.mjs';

/**
 * The provider configuration generator of ADR 0073 §2 (Issue #435, S55a; Issue #715).
 *
 * A provider whose request shape AI7 already implements is configured by one document under
 * `config/providers/<provider-id>.json`, validated against `provider-configuration.v1.schema.json`
 * and against the semantic rules below. From every document together this tool generates four
 * checked-in files, and nothing else may say what they say:
 *
 *   src/shared/provider-configuration.generated.ts      the closed unions (route ids, credential slots),
 *                                                        the provider labels, the development references
 *   src/service/provider/provider-profiles.generated.ts the route profiles and the model profiles
 *   tools/provider-credential-slots.generated.mjs       the enrollment helper's slot list
 *   docs/development/provider-support.md                the support page
 *
 *   node tools/generate-provider-configuration.mjs                        write the four files
 *   node tools/generate-provider-configuration.mjs --check                exit 1 naming every file that is not current
 *   node tools/generate-provider-configuration.mjs --ledger <cache root>  developer host only: compare the recorded
 *                                                                         evidence with the Provider Test Ledger
 *
 * Generation is deterministic: the same documents give the same bytes, with no clock reading and no
 * hash of the output. A document is a claim about the request shape (ADR 0073 §3): nothing generated
 * here makes a route bindable, enrolls a credential, or transmits anything. Bindability is the
 * Provider Processing policy's, and the policy bytes are not read here.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PROVIDERS_DIRECTORY = 'config/providers';
export const SCHEMA_FILE = 'provider-configuration.v1.schema.json';
/**
 * The evidence a document may cite that no page can supply, recorded row by row (Issue #715): the live test items the
 * ADR 0067 Provider Test Ledger holds, each with the route and model it was sent to and the UTC day it was recorded,
 * and the production route's frozen request baseline with the models whose bytes it pins. The ledger itself lives
 * outside every checkout and CI has none, so this record is its reviewed mirror: a new live item is added here, in the
 * pull request that records it, and `--ledger` compares the two on a developer host. Without it a document alone could
 * make a model readable by naming an item nobody sent, or by borrowing one sent to another row. The record and its
 * schema live in their own subdirectory because everything that reads `config/providers/*.json` (J-12 among them)
 * reads a provider document, and the record is not one.
 *
 * A ledger line is history and is never withdrawn, but a model row can leave the documents. The item then stays in the
 * record, marked `withdrawn` with the Issue that took the row out (Issue #743), so `--ledger` keeps mirroring the
 * ledger for its whole life and the support page discloses the item as a row no longer declared. The marker is
 * explicit rather than inferred from the documents: an undeclared row without it is still refused, because in CI,
 * where no ledger exists, that refusal is what catches a new item recorded under a mistyped route or model.
 */
export const RECORDED_EVIDENCE_DIRECTORY = 'recorded-evidence';
export const RECORDED_EVIDENCE_FILE = 'recorded-evidence.json';
export const RECORDED_EVIDENCE_SCHEMA_FILE = 'recorded-evidence.v1.schema.json';
export const OUTPUT_PATHS = Object.freeze({
  shared: 'src/shared/provider-configuration.generated.ts',
  profiles: 'src/service/provider/provider-profiles.generated.ts',
  slots: 'tools/provider-credential-slots.generated.mjs',
  support: 'docs/development/provider-support.md',
});

/** The adapter's closed capability unions (`src/service/provider/model-profile.ts`), and the value that means absent. */
export const CAPABILITY_VALUES = Object.freeze({
  requestShape: ['openai-chat-completions', 'anthropic-messages', 'openai-responses', 'google-generate-content'],
  reasoningControl: ['none', 'deepseek-thinking'],
  structuredOutput: ['none', 'json-object', 'json-schema', 'tool-call'],
  answerChannel: ['none', 'message-content-string', 'content-text-blocks', 'output-message-text', 'candidate-parts-text'],
  reasoningChannel: ['none', 'message-reasoning-content', 'content-thinking-blocks', 'output-reasoning-items', 'candidate-thought-parts'],
  usageAttribution: ['includes-reasoning', 'separate', 'unknown'],
  toolCalling: ['none', 'function'],
  webSearchTool: ['none', 'provider-tool'],
});
const CAPABILITIES = Object.keys(CAPABILITY_VALUES);
const ABSENT = Object.freeze({
  reasoningControl: 'none',
  structuredOutput: 'none',
  answerChannel: 'none',
  reasoningChannel: 'none',
  usageAttribution: 'unknown',
  toolCalling: 'none',
  webSearchTool: 'none',
});

/**
 * What each request shape can carry, as the adapter implements it today. A document that declares
 * anything else describes a route every assembly or every response would refuse, which is a
 * document error rather than a configuration.
 */
const SHAPE_RULES = Object.freeze({
  'openai-chat-completions': {
    answerChannel: 'message-content-string',
    reasoningChannel: 'message-reasoning-content',
    structuredOutput: ['none', 'json-object'],
    reasoningControl: ['none', 'deepseek-thinking'],
    toolCalling: ['none', 'function'],
    requiresOutputCap: false,
    headerForms: ['authorization-bearer'],
  },
  'anthropic-messages': {
    answerChannel: 'content-text-blocks',
    reasoningChannel: 'content-thinking-blocks',
    structuredOutput: ['none'],
    reasoningControl: ['none'],
    toolCalling: ['none'],
    requiresOutputCap: true,
    headerForms: ['authorization-bearer', 'x-api-key'],
  },
  'openai-responses': {
    answerChannel: 'output-message-text',
    reasoningChannel: 'output-reasoning-items',
    structuredOutput: ['none'],
    reasoningControl: ['none'],
    toolCalling: ['none'],
    requiresOutputCap: false,
    headerForms: ['authorization-bearer'],
  },
  'google-generate-content': {
    answerChannel: 'candidate-parts-text',
    reasoningChannel: 'candidate-thought-parts',
    structuredOutput: ['none'],
    reasoningControl: ['none'],
    toolCalling: ['none'],
    requiresOutputCap: false,
    headerForms: ['x-goog-api-key'],
  },
});

/** Route ids the product owns itself and no document may take. */
const RESERVED_ROUTE_IDS = new Set(['ai7-local-deterministic']);

/**
 * Provider-specific behaviour still spelled by the adapter rather than by configuration, and the providers it may be
 * declared for: DeepSeek's `thinking` / `reasoning_effort` pair and the DSH attribution headers belong to the production
 * route, and the `x-opencode-session` header with its developer-live User-Agent to the OpenCode Go gateway, the one
 * whose page prints the header (ADR 0080 §3; the Zen page names none). Until the header names and parameters are
 * configuration (#452), a document of any other provider may not switch them on.
 */
const DEEPSEEK_ONLY_PROVIDERS = new Set(['deepseek-open-platform']);
const SESSION_HEADER_PROVIDERS = new Set(['opencode-go']);

/**
 * Host names an endpoint may never use, whatever the schema's pattern admits: local and internal names, and the
 * names RFC 2606 and RFC 6761 reserve so that they never resolve on the public Internet.
 */
const LOCAL_HOST = /(^|\.)(localhost|local|internal|lan|home|arpa|test|example|invalid)$/u;
const IPV4_HOST = /^\d{1,3}(\.\d{1,3}){3}$/u;

/** A calendar day, not only its shape: `2023-13-45` is refused. */
function isCalendarDay(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) return false;
  const day = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === text;
}

export class ProviderConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderConfigurationError';
  }
}

function refuse(condition, message) {
  if (!condition) throw new ProviderConfigurationError(message);
}

/**
 * Every `<id>.json` beside the schema, sorted by file name, parsed; the schema itself is returned apart, and so is the
 * recorded evidence with its own schema, read from the `recorded-evidence/` subdirectory.
 */
export function readProviderDocuments(directory = resolve(ROOT, PROVIDERS_DIRECTORY)) {
  const names = readdirSync(directory).filter((name) => name.endsWith('.json')).sort();
  refuse(names.includes(SCHEMA_FILE), `PROVIDER_CONFIGURATION/schema-absent: ${SCHEMA_FILE}`);
  const read = (name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
  const documents = names
    .filter((name) => name !== SCHEMA_FILE)
    .map((file) => {
      refuse(!file.endsWith('.schema.json'), `PROVIDER_CONFIGURATION/unknown-schema: ${file}`);
      return { file, data: read(file) };
    });
  const recordedEvidence = {};
  for (const [key, name] of [['schema', RECORDED_EVIDENCE_SCHEMA_FILE], ['data', RECORDED_EVIDENCE_FILE]]) {
    const path = resolve(directory, RECORDED_EVIDENCE_DIRECTORY, name);
    refuse(existsSync(path), `PROVIDER_CONFIGURATION/recorded-evidence-absent: ${RECORDED_EVIDENCE_DIRECTORY}/${name}`);
    recordedEvidence[key] = JSON.parse(readFileSync(path, 'utf8'));
  }
  return { schema: read(SCHEMA_FILE), documents, recordedEvidence };
}

/**
 * The recorded evidence as rows: every live test item by id with the one row (route and model) it was sent to and
 * its day, every frozen request baseline by what pins it with the rows it pins. A duplicate id or baseline refuses.
 */
function resolveRecordedEvidence({ schema, data }) {
  try {
    validatePolicyDocument(data, schema);
  } catch (error) {
    throw new ProviderConfigurationError(`PROVIDER_CONFIGURATION/recorded-evidence-schema: ${RECORDED_EVIDENCE_FILE}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const items = new Map();
  for (const item of data.liveTestItems) {
    refuse(!items.has(item.itemId), `PROVIDER_CONFIGURATION/recorded-evidence-duplicate: ${RECORDED_EVIDENCE_FILE} item ${item.itemId}`);
    refuse(isCalendarDay(item.observedOn), `PROVIDER_CONFIGURATION/evidence-day: ${RECORDED_EVIDENCE_FILE} item ${item.itemId} (${item.observedOn} is not a calendar day)`);
    items.set(item.itemId, { route: item.route, model: item.model, observedOn: item.observedOn, issue: item.issue, withdrawn: item.withdrawn ?? null });
  }
  const baselines = new Map();
  for (const baseline of data.frozenRequestBaselines) {
    refuse(!baselines.has(baseline.since), `PROVIDER_CONFIGURATION/recorded-evidence-duplicate: ${RECORDED_EVIDENCE_FILE} baseline ${baseline.since}`);
    baselines.set(baseline.since, { route: baseline.route, models: [...baseline.models], issue: baseline.issue });
  }
  return { items, baselines };
}

const rowText = (row) => `${row.route}/${row.model}`;

function evidenceRecord(record, where) {
  const keys = Object.keys(record).filter((key) => key !== 'note').sort().join(',');
  switch (record.kind) {
    case 'vendor-documentation':
      refuse(keys === 'kind,readOn,source', `PROVIDER_CONFIGURATION/evidence-fields: ${where} (vendor-documentation carries source and readOn)`);
      return { kind: record.kind, source: record.source, readOn: record.readOn };
    case 'live-test-item':
      refuse(keys === 'itemIds,kind,observedOn', `PROVIDER_CONFIGURATION/evidence-fields: ${where} (live-test-item carries itemIds and observedOn)`);
      return { kind: record.kind, itemIds: [...record.itemIds], observedOn: record.observedOn };
    case 'frozen-request-baseline':
      refuse(keys === 'kind,since', `PROVIDER_CONFIGURATION/evidence-fields: ${where} (frozen-request-baseline carries since)`);
      return { kind: record.kind, since: record.since };
    default:
      refuse(keys === 'kind', `PROVIDER_CONFIGURATION/evidence-fields: ${where} (unverified carries nothing)`);
      return { kind: 'unverified' };
  }
}

/**
 * Validate every document and resolve it into the generated model: routes in document order, models
 * in route order, every capability present with its evidence, every evidence key resolved. Throws a
 * `ProviderConfigurationError` naming the first rule a document breaks.
 */
export function resolveProviderConfiguration({ schema, documents, recordedEvidence }) {
  const recorded = resolveRecordedEvidence(recordedEvidence);
  const routeIds = new Set();
  const declaredRows = new Set();
  const slots = new Set();
  const references = new Set();
  const providers = [];
  for (const { file, data } of documents) {
    try {
      validatePolicyDocument(data, schema);
    } catch (error) {
      throw new ProviderConfigurationError(`PROVIDER_CONFIGURATION/schema: ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
    refuse(file === `${data.providerId}.json`, `PROVIDER_CONFIGURATION/file-name: ${file} declares ${data.providerId}`);
    const ownRoutes = new Set(data.routes.map((route) => route.routeId));
    const cited = new Set();
    const evidence = {};
    // The rows (route and model) each ledger-backed record was observed on; a page's record has none.
    const recordedRows = new Map();
    for (const [key, record] of Object.entries(data.evidence)) {
      const where = `${file} evidence ${key}`;
      evidence[key] = evidenceRecord(record, where);
      for (const day of [record.readOn, record.observedOn]) {
        if (day !== undefined) refuse(isCalendarDay(day), `PROVIDER_CONFIGURATION/evidence-day: ${where} (${day} is not a calendar day)`);
      }
      if (record.kind === 'live-test-item') {
        const rows = record.itemIds.map((id) => recorded.items.get(id));
        refuse(rows.every((row) => row !== undefined && ownRoutes.has(row.route)),
          `PROVIDER_CONFIGURATION/live-item-unrecorded: ${where} (an item the Provider Test Ledger does not hold for ${data.providerId})`);
        refuse(rows.every((row) => row.observedOn === record.observedOn),
          `PROVIDER_CONFIGURATION/live-item-day: ${where} (the ledger recorded ${record.itemIds.map((id, index) => `${id} on ${rows[index].observedOn}`).join(', ')}, not ${record.observedOn})`);
        recordedRows.set(key, rows.map((row) => ({ route: row.route, model: row.model })));
      }
      if (record.kind === 'frozen-request-baseline') {
        const baseline = recorded.baselines.get(record.since);
        refuse(baseline !== undefined && ownRoutes.has(baseline.route),
          `PROVIDER_CONFIGURATION/baseline-unrecorded: ${where} (no frozen request baseline of ${data.providerId} is ${record.since})`);
        recordedRows.set(key, baseline.models.map((model) => ({ route: baseline.route, model })));
      }
    }
    /**
     * A ledger-backed record is cited only from the row it was observed on: a route cites it for its route-wide facts
     * only when every item was sent on that route, a model only when every item was sent to that model on that route.
     * A page's record has no row and is cited from anywhere in the document.
     */
    const assertRow = (key, where, scope) => {
      const rows = recordedRows.get(key);
      if (rows === undefined || scope === undefined) return;
      refuse(rows.every((row) => row.route === scope.route && (scope.model === undefined || row.model === scope.model)),
        `PROVIDER_CONFIGURATION/evidence-row: ${file} ${where} cites ${key}, which the Provider Test Ledger recorded for ${[...new Set(rows.map(rowText))].join(', ')} and not for ${scope.model === undefined ? scope.route : rowText(scope)}`);
    };
    /** Cite an evidence key from a place, under `assertRow`'s rule. The credential is the provider's, so it cites from any of its routes. */
    const cite = (key, where, scope) => {
      refuse(Object.hasOwn(evidence, key), `PROVIDER_CONFIGURATION/evidence-unknown: ${file} ${where} cites ${key}`);
      cited.add(key);
      assertRow(key, where, scope);
      return evidence[key];
    };

    const credential = data.credential;
    refuse(!slots.has(credential.slot), `PROVIDER_CONFIGURATION/slot-duplicate: ${file} ${credential.slot}`);
    slots.add(credential.slot);
    if (credential.developmentCredentialReference !== null) {
      refuse(!references.has(credential.developmentCredentialReference), `PROVIDER_CONFIGURATION/reference-duplicate: ${file}`);
      references.add(credential.developmentCredentialReference);
    }
    refuse((credential.headerForm === 'x-api-key') === (typeof credential.anthropicVersion === 'string'),
      `PROVIDER_CONFIGURATION/anthropic-version: ${file} (the x-api-key form and only it carries anthropicVersion)`);
    if (typeof credential.anthropicVersion === 'string') {
      refuse(isCalendarDay(credential.anthropicVersion), `PROVIDER_CONFIGURATION/anthropic-version: ${file} (${credential.anthropicVersion} is not a calendar day)`);
    }
    const headerEvidence = cite(credential.headerEvidence, 'credential.headerEvidence');
    refuse(headerEvidence.kind !== 'unverified', `PROVIDER_CONFIGURATION/header-unverified: ${file} (a header form states where it came from)`);

    const routes = [];
    data.routes.forEach((route, routeIndex) => {
      const where = `${file} route ${route.routeId}`;
      refuse(routeIndex === 0 ? route.routeId === data.providerId : route.routeId.startsWith(`${data.providerId}-`),
        `PROVIDER_CONFIGURATION/route-id: ${where} (the first route is the provider id, the others extend it)`);
      refuse(!RESERVED_ROUTE_IDS.has(route.routeId) && !routeIds.has(route.routeId), `PROVIDER_CONFIGURATION/route-duplicate: ${where}`);
      routeIds.add(route.routeId);
      const shape = SHAPE_RULES[route.requestShape];
      refuse(shape.headerForms.includes(credential.headerForm),
        `PROVIDER_CONFIGURATION/header-form: ${where} (${route.requestShape} is not spoken with ${credential.headerForm})`);
      refuse(!shape.requiresOutputCap || route.maxOutputTokens !== null,
        `PROVIDER_CONFIGURATION/output-cap: ${where} (${route.requestShape} requires a per-turn output cap)`);
      const routeScope = { route: route.routeId };
      const routeShapeEvidence = cite(route.requestShapeEvidence, `${route.routeId}.requestShapeEvidence`, routeScope);
      refuse(routeShapeEvidence.kind !== 'unverified', `PROVIDER_CONFIGURATION/shape-unverified: ${where}`);
      const url = new URL(route.endpoint);
      refuse(!LOCAL_HOST.test(url.hostname) && !IPV4_HOST.test(url.hostname) && url.hostname.includes('.'),
        `PROVIDER_CONFIGURATION/endpoint-host: ${where} (${url.hostname} is a local, internal, reserved or literal address)`);
      // The literal is the URL a request is sent to: a `.` or `..` segment, or anything else the URL parser rewrites, is not.
      refuse(url.href === route.endpoint,
        `PROVIDER_CONFIGURATION/endpoint-path: ${where} (${route.endpoint} is requested as ${url.href}; write the endpoint as it is sent, with no . or .. segment)`);
      const limitEvidence = cite(route.limitPolicyEvidence, `${route.routeId}.limitPolicyEvidence`, routeScope);
      const attributionEvidence = cite(route.dshAttributionEvidence, `${route.routeId}.dshAttributionEvidence`, routeScope);
      const sessionEvidence = cite(route.sessionHeaderEvidence, `${route.routeId}.sessionHeaderEvidence`, routeScope);
      refuse(!route.dshAttribution || (DEEPSEEK_ONLY_PROVIDERS.has(data.providerId) && attributionEvidence.kind !== 'unverified'),
        `PROVIDER_CONFIGURATION/dsh-attribution: ${where} (only the production route sends the DSH attribution headers, on its baseline)`);
      refuse(!route.sessionHeader || (SESSION_HEADER_PROVIDERS.has(data.providerId) && sessionEvidence.kind === 'vendor-documentation'),
        `PROVIDER_CONFIGURATION/session-header: ${where} (the OpenCode session header is sent only on an OpenCode Go route, whose page documents it)`);
      const modelIds = new Set();
      const models = route.models.map((model) => {
        const modelWhere = `${where} model ${model.modelId}`;
        refuse(!modelIds.has(model.modelId), `PROVIDER_CONFIGURATION/model-duplicate: ${modelWhere}`);
        modelIds.add(model.modelId);
        declaredRows.add(rowText({ route: route.routeId, model: model.modelId }));
        const modelScope = { route: route.routeId, model: model.modelId };
        const declared = { ...(route.routeCapabilities ?? {}), ...(model.capabilities ?? {}) };
        const capabilities = {};
        const capabilityEvidence = {};
        for (const capability of CAPABILITIES) {
          const entry = declared[capability];
          if (capability === 'requestShape') {
            refuse(entry === undefined || entry.value === route.requestShape,
              `PROVIDER_CONFIGURATION/request-shape: ${modelWhere} (a model speaks its route's shape)`);
            capabilities.requestShape = route.requestShape;
            // A model that inherits the route's shape evidence inherits it under the row rule: a baseline or an item that
            // never pinned this model does not read as its evidence (the model then cites a page of its own).
            if (entry === undefined) assertRow(route.requestShapeEvidence, `${modelWhere}.requestShape`, modelScope);
            capabilityEvidence.requestShape = entry === undefined ? routeShapeEvidence : cite(entry.evidence, `${modelWhere}.requestShape`, modelScope);
            refuse(capabilityEvidence.requestShape.kind !== 'unverified', `PROVIDER_CONFIGURATION/shape-unverified: ${modelWhere}`);
            continue;
          }
          if (entry === undefined) {
            capabilities[capability] = ABSENT[capability];
            capabilityEvidence[capability] = { kind: 'unverified' };
            continue;
          }
          refuse(CAPABILITY_VALUES[capability].includes(entry.value), `PROVIDER_CONFIGURATION/capability-value: ${modelWhere} ${capability}=${entry.value}`);
          const record = cite(entry.evidence, `${modelWhere}.${capability}`, modelScope);
          // The table's one rule (Issue #310): an unverified capability is declared absent.
          refuse(entry.value === ABSENT[capability] || record.kind !== 'unverified',
            `PROVIDER_CONFIGURATION/capability-unverified: ${modelWhere} ${capability}=${entry.value}`);
          // And its converse: an absent value is absent because nobody established it — except a search
          // tool, whose absence a vendor page can affirm, which is stronger than nobody having looked (ADR 0080 §3).
          refuse(entry.value !== ABSENT[capability] || capability === 'webSearchTool' || record.kind === 'unverified',
            `PROVIDER_CONFIGURATION/absent-with-evidence: ${modelWhere} ${capability}=${entry.value} (an absent capability is unverified; leave it undeclared)`);
          capabilities[capability] = entry.value;
          capabilityEvidence[capability] = record;
        }
        refuse(capabilities.reasoningControl !== 'deepseek-thinking' || DEEPSEEK_ONLY_PROVIDERS.has(data.providerId),
          `PROVIDER_CONFIGURATION/deepseek-thinking: ${modelWhere} (DeepSeek's thinking parameters are sent to DeepSeek official alone)`);
        refuse(capabilities.answerChannel === 'none' || capabilities.answerChannel === shape.answerChannel,
          `PROVIDER_CONFIGURATION/answer-channel: ${modelWhere} (${route.requestShape} answers on ${shape.answerChannel})`);
        refuse(capabilities.reasoningChannel === 'none' || capabilities.reasoningChannel === shape.reasoningChannel,
          `PROVIDER_CONFIGURATION/reasoning-channel: ${modelWhere} (${route.requestShape} reasons on ${shape.reasoningChannel})`);
        for (const capability of ['structuredOutput', 'reasoningControl', 'toolCalling']) {
          refuse(shape[capability].includes(capabilities[capability]),
            `PROVIDER_CONFIGURATION/shape-capability: ${modelWhere} (${route.requestShape} implements no ${capability}=${capabilities[capability]})`);
        }
        const contextEvidence = cite(model.context.evidence, `${modelWhere}.context`, modelScope);
        refuse(model.context.tokens === null || contextEvidence.kind === 'vendor-documentation',
          `PROVIDER_CONFIGURATION/context-evidence: ${modelWhere} (a context size names the vendor page that states it)`);
        return {
          key: `${route.routeId}/${model.modelId}`,
          route: route.routeId,
          model: model.modelId,
          displayName: model.displayName,
          capabilities,
          evidence: capabilityEvidence,
          context: { tokens: model.context.tokens, evidence: contextEvidence },
          note: model.note ?? null,
        };
      });
      routes.push({
        profile: {
          route: route.routeId,
          endpoint: route.endpoint,
          credentialSlot: credential.slot,
          credentialHeader: credential.headerForm,
          anthropicVersion: credential.anthropicVersion,
          limitPolicy: route.limitPolicy,
          dshAttribution: route.dshAttribution,
          sessionHeader: route.sessionHeader,
          maxOutputTokens: route.maxOutputTokens,
          credentialHeaderEvidence: headerEvidence,
          displayName: route.displayName,
        },
        requestShape: route.requestShape,
        routeEvidence: { limitPolicy: limitEvidence, dshAttribution: attributionEvidence, sessionHeader: sessionEvidence },
        note: route.note ?? null,
        models,
      });
    });
    const uncited = Object.keys(evidence).filter((key) => !cited.has(key));
    refuse(uncited.length === 0, `PROVIDER_CONFIGURATION/evidence-uncited: ${file} ${uncited.join(', ')}`);
    providers.push({
      providerId: data.providerId,
      displayName: data.displayName,
      credential: {
        slot: credential.slot,
        developmentCredentialReference: credential.developmentCredentialReference,
        headerForm: credential.headerForm,
        anthropicVersion: credential.anthropicVersion,
        headerEvidence,
      },
      routes,
      readings: Object.entries(data.evidence)
        .filter(([, entry]) => entry.kind !== 'unverified')
        .map(([key, entry]) => ({ key, record: evidence[key], note: entry.note ?? null })),
      openQuestions: [...data.openQuestions],
      notes: [...(data.notes ?? [])],
    });
  }
  refuse(providers.length > 0, 'PROVIDER_CONFIGURATION/no-documents');
  // Every recorded row is a declared row, except a live item marked withdrawn: the record names what the documents
  // declare, never a model nobody configures, and keeps a withdrawn row's items only because the ledger keeps them.
  const recordedRows = [
    ...[...recorded.items.values()].filter((item) => item.withdrawn === null).map((item) => ({ route: item.route, model: item.model })),
    ...[...recorded.baselines.values()].flatMap((baseline) => baseline.models.map((model) => ({ route: baseline.route, model }))),
  ];
  const unknownRows = recordedRows.map(rowText).filter((row) => !declaredRows.has(row));
  refuse(unknownRows.length === 0, `PROVIDER_CONFIGURATION/recorded-evidence-row-unknown: ${RECORDED_EVIDENCE_FILE} names ${[...new Set(unknownRows)].join(', ')}, which no document declares (an item whose row left the documents is marked withdrawn)`);
  // And the converse: the marker says the row left the documents, so a row a document still declares carries none.
  const withdrawnDeclared = [...recorded.items].filter(([, item]) => item.withdrawn !== null && declaredRows.has(rowText(item))).map(([itemId]) => itemId);
  refuse(withdrawnDeclared.length === 0, `PROVIDER_CONFIGURATION/recorded-evidence-withdrawn-declared: ${RECORDED_EVIDENCE_FILE} marks ${withdrawnDeclared.join(', ')} withdrawn, but a document still declares its row`);
  return {
    providers,
    recordedEvidence: {
      liveTestItems: [...recorded.items].map(([itemId, item]) => ({ itemId, ...item })),
      frozenRequestBaselines: [...recorded.baselines].map(([since, baseline]) => ({ since, ...baseline })),
    },
  };
}

/** A developer host, not CI: the ledger is human-attended by construction (ADR 0065, ADR 0067). */
function continuousIntegrationPresent(env) {
  return env.CI !== undefined || env.GITHUB_ACTIONS !== undefined || env.AI7_E2E_JOURNEY !== undefined;
}

/**
 * Compare the recorded live test items with the Provider Test Ledger's lines, on a developer host only: the record
 * names exactly the ledger's transmitted, non-stale model-call lines, each under the model and on the UTC day the
 * ledger recorded. Returns every difference as one sentence; an empty list is agreement. Reads no response, no cache
 * entry and no clock, and refuses to run where CI is present, because CI has no ledger and must never need one.
 */
export function compareRecordedEvidenceWithLedger(recordedEvidence, lines, env = process.env) {
  refuse(!continuousIntegrationPresent(env), 'PROVIDER_CONFIGURATION/ledger-on-ci (the Provider Test Ledger is compared on a developer host only)');
  const recorded = resolveRecordedEvidence(recordedEvidence);
  const transmitted = new Map();
  for (const line of lines) {
    if ((line.kind !== undefined && line.kind !== 'model-call') || line.outcome !== 'transmitted' || line.stale === true) continue;
    const held = transmitted.get(line.itemId) ?? [];
    held.push(line);
    transmitted.set(line.itemId, held);
  }
  const differences = [];
  for (const [itemId, item] of recorded.items) {
    const held = transmitted.get(itemId);
    if (held === undefined) {
      differences.push(`${itemId} is recorded but the ledger holds no transmitted line for it`);
      continue;
    }
    for (const line of held) {
      if (line.model !== item.model) differences.push(`${itemId} is recorded for ${item.model} but the ledger transmitted it to ${line.model}`);
      const recordedAt = new Date(typeof line.recordedAt === 'string' ? line.recordedAt : NaN);
      const day = Number.isNaN(recordedAt.getTime()) ? 'no day' : recordedAt.toISOString().slice(0, 10);
      if (day !== item.observedOn) differences.push(`${itemId} is recorded as observed on ${item.observedOn} but the ledger recorded it on ${day}`);
    }
  }
  for (const itemId of transmitted.keys()) {
    if (!recorded.items.has(itemId)) differences.push(`${itemId} was transmitted but is not recorded`);
  }
  return differences;
}

const HEADER = (source) => [
  `// Generated by tools/generate-provider-configuration.mjs from config/providers/*.json (ADR 0073 §2). Do not edit:`,
  `// edit the provider documents and run \`node tools/generate-provider-configuration.mjs\`; \`check\` fails when`,
  `// this file is not what the documents generate. ${source}`,
];

/** A JavaScript literal in the repository's style: strings single-quoted, everything else as JSON writes it. */
function literal(value) {
  if (typeof value !== 'string') return JSON.stringify(value);
  const body = JSON.stringify(value).slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'");
  return `'${body}'`;
}

/**
 * One value as source text. An object `named` maps (by its JSON) is written as that constant's name,
 * which is how one evidence record cited by many capabilities is written once.
 */
function renderValue(value, indent, named = new Map()) {
  if (value === null || typeof value !== 'object') return literal(value);
  const name = Array.isArray(value) ? undefined : named.get(JSON.stringify(value));
  if (name !== undefined) return name;
  const scalar = (item) => item === null || typeof item !== 'object' || named.has(JSON.stringify(item)) ||
    (Array.isArray(item) && item.every((x) => x === null || typeof x !== 'object'));
  const pad = '  '.repeat(indent + 1);
  const close = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== 'object')) return `[${value.map(literal).join(', ')}]`;
    return `[\n${value.map((item) => `${pad}${renderValue(item, indent + 1, named)},`).join('\n')}\n${close}]`;
  }
  const entries = Object.entries(value);
  const key = (entry) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entry) ? entry : literal(entry));
  const inline = `{ ${entries.map(([entry, item]) => `${key(entry)}: ${renderValue(item, indent + 1, named)}`).join(', ')} }`;
  if (entries.every(([, item]) => scalar(item)) && inline.length + indent * 2 <= 120) return inline;
  return `{\n${entries.map(([entry, item]) => `${pad}${key(entry)}: ${renderValue(item, indent + 1, named)},`).join('\n')}\n${close}}`;
}

function renderShared({ providers }) {
  const routes = providers.flatMap((provider) => provider.routes.map((route) => ({ id: route.profile.route, label: provider.displayName })));
  const slots = providers.map((provider) => provider.credential);
  const developmentSlots = slots.filter((slot) => slot.developmentCredentialReference !== null);
  return [
    ...HEADER('Shared by the protocol, the service and the renderer: identifiers and labels only.'),
    '',
    '/** Every route a provider document declares, bindable or not: the members of `RemoteProviderId` and `RemoteExecutionRoute`. */',
    `export const CONFIGURED_ROUTE_IDS = [`,
    ...routes.map((route) => `  ${literal(route.id)},`),
    '] as const;',
    'export type ConfiguredRouteId = (typeof CONFIGURED_ROUTE_IDS)[number];',
    '',
    '/** One credential slot per configured provider (ADR 0073 §4): the members of `CredentialSlotId`, and the Credential Broker\'s closed set. */',
    'export const CONFIGURED_CREDENTIAL_SLOTS = [',
    ...slots.map((slot) => `  ${literal(slot.slot)},`),
    '] as const;',
    'export type ConfiguredCredentialSlot = (typeof CONFIGURED_CREDENTIAL_SLOTS)[number];',
    '',
    '/** The provider\'s name beside a model id in a plan, by route. */',
    'export const CONFIGURED_PROVIDER_LABELS: Readonly<Record<ConfiguredRouteId, string>> = {',
    ...routes.map((route) => `  ${literal(route.id)}: ${literal(route.label)},`),
    '};',
    '',
    '/** The slots whose document fixes a development Credential Reference; the production connection\'s slot has none. */',
    'export const CONFIGURED_DEVELOPMENT_SLOTS = [',
    ...developmentSlots.map((slot) => `  ${literal(slot.slot)},`),
    '] as const;',
    'export type ConfiguredDevelopmentSlot = (typeof CONFIGURED_DEVELOPMENT_SLOTS)[number];',
    '',
    '/**',
    ' * The fixed development Credential Reference of each such slot (ADR 0067, ADR 0073 §4): the Protected Secret Store entry the',
    ' * enrollment helper writes under on a developer host. A reference names a store entry and is not a secret, and it is a',
    ' * place for a key, not a permission to enrol one: only `opencode-go` enrolment is authorized (ADR 0067; ADR 0073 §5',
    ' * authorizes no credential).',
    ' */',
    'export const CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES: Readonly<Record<ConfiguredDevelopmentSlot, string>> = {',
    ...developmentSlots.map((slot) => `  ${literal(slot.slot)}: ${literal(slot.developmentCredentialReference)},`),
    '};',
    '',
  ].join('\n');
}

function renderProfiles({ providers }) {
  const routes = providers.flatMap((provider) => provider.routes);
  const models = routes.flatMap((route) => route.models.map(({ note, ...model }) => model));
  // Every distinct evidence record once, in first-cited order, so the profiles cite it by name.
  const named = new Map();
  const cite = (record) => {
    const text = JSON.stringify(record);
    if (!named.has(text)) named.set(text, `EVIDENCE_${named.size + 1}`);
  };
  for (const route of routes) cite(route.profile.credentialHeaderEvidence);
  for (const model of models) {
    for (const record of Object.values(model.evidence)) cite(record);
    cite(model.context.evidence);
  }
  return [
    ...HEADER('The route and model profiles the adapter reads.'),
    '',
    "import type { ConfiguredRouteId } from '../../shared/provider-configuration.generated.js';",
    "import type { ProviderRouteProfile } from './deepseek-adapter.js';",
    "import type { CapabilityEvidence, ProviderModelProfile } from './model-profile.js';",
    '',
    '/* Every evidence record the documents cite, written once. */',
    ...[...named].map(([text, name]) => `const ${name}: CapabilityEvidence = ${renderValue(JSON.parse(text), 0)};`),
    '',
    '/** How each configured route is reached: endpoint, credential slot and header form, limit reading, output cap. */',
    'export const GENERATED_ROUTE_PROFILES: Readonly<Record<ConfiguredRouteId, ProviderRouteProfile>> = {',
    ...routes.map((route) => `  ${literal(route.profile.route)}: ${renderValue(route.profile, 1, named)},`),
    '};',
    '',
    '/** How each configured model is spoken to: every capability with the evidence that established it, and its context size. */',
    'export const GENERATED_MODEL_PROFILES: ReadonlyArray<ProviderModelProfile> = [',
    ...models.map((model) => `  ${renderValue(model, 1, named)},`),
    '];',
    '',
  ].join('\n');
}

function renderSlots({ providers }) {
  return [
    ...HEADER('The enrollment helper is plain ESM run before any build, so it reads this list rather than the TypeScript module.'),
    '',
    '/**',
    ' * [slot, development Credential Reference], one per configured provider whose document fixes one (ADR 0073 §4). A slot',
    ' * here is a place for a key, not a permission to enrol one: only `opencode-go` enrolment is authorized (ADR 0067), and',
    ' * every other slot waits for a record that names it (ADR 0073 §5 authorizes no credential; ADR 0080 §5 「先支持后添加key」).',
    ' */',
    'export const DEVELOPMENT_CREDENTIAL_SLOTS = Object.freeze([',
    ...providers
      .filter((provider) => provider.credential.developmentCredentialReference !== null)
      .map((provider) => `  Object.freeze([${literal(provider.credential.slot)}, ${literal(provider.credential.developmentCredentialReference)}]),`),
    ']);',
    '',
  ].join('\n');
}

function describeEvidence(record) {
  switch (record.kind) {
    case 'vendor-documentation': return `\`vendor-documentation\`, ${record.source}, read ${record.readOn}`;
    case 'live-test-item': return `\`live-test-item\` ${record.itemIds.map((id) => `\`${id}\``).join(', ')}, observed ${record.observedOn}`;
    case 'frozen-request-baseline': return `\`frozen-request-baseline\`, since ${record.since}`;
    default: return '`unverified`';
  }
}

const HEADER_FORM_TEXT = Object.freeze({
  'authorization-bearer': '`authorization: Bearer`',
  'x-api-key': '`x-api-key`',
  'x-goog-api-key': '`x-goog-api-key`',
});

/** A count with its thousands grouped by commas, the same on every host: no locale is read. */
function grouped(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function cell(text) {
  return String(text).replaceAll('|', '\\|');
}

function renderSupport({ providers, recordedEvidence }) {
  const lines = [
    '# Provider support',
    '',
    '<!-- Generated by tools/generate-provider-configuration.mjs from config/providers/*.json. Do not edit; edit the documents and regenerate. -->',
    '',
    'Generated from the provider documents under [`config/providers/`](../../config/providers/) (ADR 0073 §2). A provider whose request shape AI7 implements is configured by one document; the generator emits the route and model profiles (`src/service/provider/provider-profiles.generated.ts`), the closed unions, the provider labels and the credential slot sets (`src/shared/provider-configuration.generated.ts`, `tools/provider-credential-slots.generated.mjs`) and this page, and the ladder\'s `check` rung fails when any of them is not what the documents generate.',
    '',
    '## Three senses of "supported"',
    '',
    '- **Declared** — a document declares the route and the model. A declared model whose `answerChannel` is `none` is inert: it can read no response. A declared format is a claim about the request shape and nothing else (ADR 0073 §3).',
    '- **Live-verified** — a capability whose evidence is `live-test-item`, cited by its item ids.',
    '- **Bindable** — a route a Provider Resolution Plan may bind. No document makes a route bindable: that is a Provider Processing policy rule naming the exact binding, the Owner\'s decision per provider, and its first transmission is a named test item under ADR 0067. Today the bindable routes are the production connection\'s `deepseek-open-platform` and Provider Processing v5\'s developer-live `opencode-go` (`ExecutionRoute`, `src/service/provider/egress-gate.ts`).',
    '',
    'A capability a document does not declare is absent with `unverified` evidence. A context size is the one the vendor page states, in tokens (an input limit where the page states one separately; a page\'s "1M" is read as 1,000,000), and `none` where no page read states one.',
    '',
  ];
  for (const provider of providers) {
    lines.push(`## ${provider.displayName}`, '');
    lines.push('| | |', '| --- | --- |');
    lines.push(`| Document | [\`config/providers/${provider.providerId}.json\`](../../config/providers/${provider.providerId}.json) |`);
    lines.push(`| Credential slot | \`${provider.credential.slot}\` |`);
    lines.push(`| Header form | ${HEADER_FORM_TEXT[provider.credential.headerForm]}${provider.credential.anthropicVersion === null ? '' : ` with \`anthropic-version: ${provider.credential.anthropicVersion}\``} — ${describeEvidence(provider.credential.headerEvidence)} |`);
    lines.push('');
    for (const note of provider.notes) lines.push(`- ${note}`);
    if (provider.notes.length > 0) lines.push('');
    for (const route of provider.routes) {
      lines.push(`### \`${route.profile.route}\``, '');
      lines.push('| | |', '| --- | --- |');
      lines.push(`| Endpoint | \`${route.profile.endpoint}\` |`);
      lines.push(`| Request shape | \`${route.requestShape}\` |`);
      lines.push(`| Display name | ${cell(route.profile.displayName)} |`);
      lines.push(`| Limit reading | \`${route.profile.limitPolicy}\` — ${describeEvidence(route.routeEvidence.limitPolicy)} |`);
      lines.push(`| DSH attribution headers | ${route.profile.dshAttribution ? 'sent' : 'not sent'} — ${describeEvidence(route.routeEvidence.dshAttribution)} |`);
      lines.push(`| OpenCode session header | ${route.profile.sessionHeader ? 'sent' : 'not sent'} — ${describeEvidence(route.routeEvidence.sessionHeader)} |`);
      lines.push(`| Per-turn output cap | ${route.profile.maxOutputTokens === null ? 'none' : grouped(route.profile.maxOutputTokens)} |`);
      lines.push('');
      if (route.note !== null) lines.push(route.note, '');
      lines.push('| Model id | Display name | Context | Tool calling | Web search tool |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const model of route.models) {
        const context = model.context.tokens === null ? 'none' : grouped(model.context.tokens);
        lines.push(`| \`${model.model}\` | ${cell(model.displayName)} | ${context} | \`${model.capabilities.toolCalling}\` | \`${model.capabilities.webSearchTool}\` |`);
      }
      lines.push('');
      // Each established fact once: a fact every model on the route shares is written for the route, and
      // a fact some models share names them.
      const facts = new Map();
      const record = (subject, text) => {
        const subjects = facts.get(text) ?? [];
        subjects.push(subject);
        facts.set(text, subjects);
      };
      for (const model of route.models) {
        for (const capability of CAPABILITIES) {
          const evidence = model.evidence[capability];
          if (evidence.kind === 'unverified') continue;
          record(model.model, `\`${capability}: ${model.capabilities[capability]}\` — ${describeEvidence(evidence)}`);
        }
        if (model.context.tokens !== null) record(model.model, `context ${grouped(model.context.tokens)} — ${describeEvidence(model.context.evidence)}`);
      }
      const every = route.models.length;
      const inert = route.models.filter((model) => model.capabilities.answerChannel === 'none').length;
      lines.push(`Inert: ${inert} of ${every} (no declared answer channel). Established:`, '');
      for (const [text, subjects] of facts) {
        const who = subjects.length === every && every > 1 ? 'every model' : subjects.map((subject) => `\`${subject}\``).join(', ');
        lines.push(`- ${who} · ${text}`);
      }
      for (const model of route.models) if (model.note !== null) lines.push(`- \`${model.model}\`: ${model.note}`);
      lines.push('');
    }
    lines.push('Readings:', '');
    for (const reading of provider.readings) {
      lines.push(`- \`${reading.key}\` — ${describeEvidence(reading.record)}${reading.note === null ? '' : `. ${reading.note}`}`);
    }
    lines.push('');
    if (provider.openQuestions.length > 0) {
      lines.push('Open:', '');
      for (const question of provider.openQuestions) lines.push(`- ${question}`);
      lines.push('');
    }
  }
  lines.push('## Not configured', '');
  lines.push('- **字节豆包（方舟）** — in the Owner\'s supported set (ADR 0080 §5), but its document waits on a readable API reference or a named live item: the official API reference did not render for automated reading on 2026-09-10 (ADR 0080 §3), so its endpoint, request shape and header form are a task, not an assumption.');
  lines.push('- A provider whose official API matches none of the four implemented request shapes waits for tier 2 (ADR 0073 §1, plan slot 1c.11).');
  lines.push('');
  lines.push('## Credential slots', '');
  lines.push('| Slot | Serves | Development Credential Reference |', '| --- | --- | --- |');
  for (const provider of providers) {
    const reference = provider.credential.developmentCredentialReference;
    lines.push(`| \`${provider.credential.slot}\` | ${provider.routes.map((route) => `\`${route.profile.route}\``).join(', ')} | ${reference === null ? 'none (the production connection\'s reference is per connection row)' : `\`${reference}\``} |`);
  }
  lines.push('');
  lines.push('**Only `opencode-go` enrolment is authorized** (ADR 0067). Every other slot is a place for a key, not a permission to enrol one: ADR 0073 §5 authorizes no credential and ADR 0080 §5 defers keys (「先支持后添加key」), so a slot is enrolled only once a record names it.');
  lines.push('');
  lines.push('A credential slot is a logical slot of the Main Editorial Role, one per configured provider; the Credential Broker\'s closed set and `tools/enroll-dev-credential.mjs`\'s slot list are generated from the documents, so a slot cannot exist without a reviewed document. Enrolment, where a record authorizes it, is the one way ADR 0067 established for `opencode-go`: from an untracked key file the enrollment helper alone reads, into the Protected Secret Store under the slot\'s development Credential Reference. A Credential Reference names a store entry and is not a secret. See [ADR 0067](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md) for the live-once ledger and the Provider Result Cache.');
  lines.push('');
  lines.push('## Recorded evidence', '');
  lines.push(`The evidence no page can supply — the live test items the ADR 0067 Provider Test Ledger holds and the production route's frozen request baseline — is recorded row by row in [\`config/providers/${RECORDED_EVIDENCE_DIRECTORY}/${RECORDED_EVIDENCE_FILE}\`](../../config/providers/${RECORDED_EVIDENCE_DIRECTORY}/${RECORDED_EVIDENCE_FILE}), validated by [\`${RECORDED_EVIDENCE_SCHEMA_FILE}\`](../../config/providers/${RECORDED_EVIDENCE_DIRECTORY}/${RECORDED_EVIDENCE_SCHEMA_FILE}) (its own subdirectory, because the record is not a provider document and everything that reads \`config/providers/*.json\` reads one). A document cites an item or a baseline only from the row it was observed on: a route for its route-wide facts only when every item was sent on that route, a model only when every item was sent to that model on that route. The ledger itself lives outside every checkout and CI has none, so the record is its reviewed mirror: the pull request that records a new live item adds it here and runs \`node tools/generate-provider-configuration.mjs --ledger <cache root>\` on the developer host, which compares the record with the ledger's transmitted, non-stale model-call lines by item, model and UTC day and prints every difference. CI never runs it. A ledger line is never withdrawn, but a model row can leave the documents: its items then stay in the record marked \`withdrawn\` with the Issue that took the row out, are listed below as a row no longer declared, and keep \`--ledger\` comparing every transmitted line; an undeclared row without the marker is refused.`);
  lines.push('');
  lines.push('| Item | Route | Model | Observed | Stated on |', '| --- | --- | --- | --- | --- |');
  for (const item of recordedEvidence.liveTestItems) {
    const model = item.withdrawn === null ? `\`${item.model}\`` : `\`${item.model}\` (row no longer declared, withdrawn on ${item.withdrawn})`;
    lines.push(`| \`${item.itemId}\` | \`${item.route}\` | ${model} | ${item.observedOn} | ${item.issue} |`);
  }
  lines.push('');
  lines.push('| Baseline | Route | Models | Stated on |', '| --- | --- | --- | --- |');
  for (const baseline of recordedEvidence.frozenRequestBaselines) {
    lines.push(`| ${cell(baseline.since)} | \`${baseline.route}\` | ${baseline.models.map((model) => `\`${model}\``).join(', ')} | ${baseline.issue} |`);
  }
  lines.push('');
  lines.push('## How a provider is added');
  lines.push('');
  lines.push(`Write or edit one document under \`config/providers/\`, run \`node tools/generate-provider-configuration.mjs\`, and commit the document with the four generated files. A model is a row: it is admitted only when the vendor's documentation places it on a path and states its id verbatim, and an unverified capability is declared absent (Issue #310). The generator refuses a capability the request shape does not implement, a header form the shape is not spoken with, an anthropic-messages route without a per-turn output cap, a duplicate route, slot or Credential Reference, an evidence record nothing cites or whose fields or days are malformed, an endpoint on a local, internal, reserved, literal or dotless host or one written otherwise than it is requested (a \`.\` or \`..\` segment), a live test item or frozen request baseline \`${RECORDED_EVIDENCE_FILE}\` does not record, cited from any row but the one it records or under another day, DeepSeek's thinking parameters or the DSH attribution headers outside DeepSeek official, and the OpenCode session header outside an OpenCode Go route, whose page documents it. Nothing a document says authorizes a transmission: a route becomes bindable only through a Provider Processing policy revision (ADR 0073 §3). See Issue #310, Issue #321, Issue #322, Issue #435 and Issue #715.`);
  lines.push('');
  return lines.join('\n');
}

/** The four generated files' bytes, by repository-relative path. */
export function renderProviderConfiguration(resolved) {
  return {
    [OUTPUT_PATHS.shared]: renderShared(resolved),
    [OUTPUT_PATHS.profiles]: renderProfiles(resolved),
    [OUTPUT_PATHS.slots]: renderSlots(resolved),
    [OUTPUT_PATHS.support]: renderSupport(resolved),
  };
}

/** Generate, or with `check` compare: returns the paths whose bytes differ from what the documents generate. */
export function generateProviderConfiguration({ root = ROOT, check = false } = {}) {
  const outputs = renderProviderConfiguration(resolveProviderConfiguration(readProviderDocuments(resolve(root, PROVIDERS_DIRECTORY))));
  const stale = [];
  for (const [path, text] of Object.entries(outputs)) {
    let current = null;
    try {
      current = readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n');
    } catch {
      current = null;
    }
    if (current === text) continue;
    stale.push(path);
    if (!check) writeFileSync(resolve(root, path), text, 'utf8');
  }
  return stale;
}

/**
 * The cache root `--ledger` reads, as the platform roots it: an absolute path, and on Windows one that names its drive
 * (Issue #743). `isAbsolute('/cache')` holds on Windows, where the path then resolves against whatever drive is
 * current; a drive-relative root is refused rather than read from wherever that happens to be.
 */
export function isLedgerRoot(cacheRoot, platform = process.platform) {
  if (typeof cacheRoot !== 'string' || cacheRoot.length === 0) return false;
  if (platform !== 'win32') return posix.isAbsolute(cacheRoot);
  return win32.isAbsolute(cacheRoot) && /^[A-Za-z]:[\\/]$/u.test(win32.parse(cacheRoot).root);
}

/**
 * `--ledger <cache root>`: read the Provider Test Ledger through the ADR 0067 fixture tooling's own reader and compare
 * it with the record. A developer-host step for the pull request that records a live item; never a `check` rung.
 */
async function compareWithLedgerAt(cacheRoot) {
  refuse(isLedgerRoot(cacheRoot), 'PROVIDER_CONFIGURATION/ledger-root (--ledger names the cache root as an absolute path, drive letter included on Windows)');
  const { readLedgerLines } = await import('./generate-model-fixture.mjs');
  const { recordedEvidence } = readProviderDocuments();
  const differences = compareRecordedEvidenceWithLedger(recordedEvidence, await readLedgerLines(cacheRoot));
  return { differences, items: recordedEvidence.data.liveTestItems.length };
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const ledger = args.indexOf('--ledger');
  try {
    if (ledger >= 0) {
      const { differences, items } = await compareWithLedgerAt(args[ledger + 1]);
      for (const difference of differences) console.error(`PROVIDER_CONFIGURATION/ledger-differs: ${difference}`);
      if (differences.length > 0) process.exitCode = 1;
      else console.log(`PROVIDER_CONFIGURATION/ledger-agrees: ${items} items`);
    } else {
      const stale = generateProviderConfiguration({ check });
      if (check && stale.length > 0) {
        for (const path of stale) console.error(`PROVIDER_CONFIGURATION/stale: ${path}`);
        console.error('Run `node tools/generate-provider-configuration.mjs` and commit the result.');
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
