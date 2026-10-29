import { CREDENTIAL_REFERENCE_PATTERN, DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../shared/protected-secret-identity.js';
import { CONFIGURED_CREDENTIAL_SLOTS, CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../shared/provider-configuration.generated.js';
import { DIGEST_PATTERN } from '../analysis/canonical.js';
import { consumeSearchCandidateProbeRelease, consumeSearchCredentialRelease, type CredentialSlot, type TransmitTicket, type SearchCandidateProbeTicket, type SearchServiceTicket } from './egress-gate.js';

/**
 * The Credential Broker maps (Execution Binding, Model Role, logical slot) to the opaque Credential
 * Reference recorded in the Provider Resolution Plan and releases the secret value only inside the
 * final adapter's transmit step, against a `transmit-remote` ticket the gate issued for the same
 * binding. Values never enter DSH Session content, the Task Ledger, protocol frames, logs, or
 * diagnostics: the broker hands the value to one consumer callback and retains nothing.
 */
export interface SecretResolver {
  /** Resolve the value behind one Credential Reference, or `null` when the store holds none. */
  resolve(credentialReference: string): Promise<string | null>;
}

export interface CredentialSlotBinding {
  readonly bindingDigest: string;
  readonly modelRole: 'Main Editorial Role' | 'Fast Interaction Role';
  readonly slot: CredentialSlot;
  readonly credentialReference: string;
  /** Revalidate the frozen production selection and credential generation across the asynchronous secret read. */
  readonly isCurrent?: () => boolean;
}

export type CredentialReadiness = 'present' | 'missing';

export class CredentialBrokerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'CredentialBrokerError';
  }
}

/**
 * The closed slot set: one slot per configured provider, generated from the provider documents (ADR 0073 §4), so a slot
 * cannot exist without a reviewed document. A slot is a place a value may be released to, never a permission to release:
 * release still needs the gate's `transmit-remote` ticket for the exact binding.
 */
const CREDENTIAL_SLOTS: ReadonlySet<CredentialSlot> = new Set<CredentialSlot>(CONFIGURED_CREDENTIAL_SLOTS);

/** Whether a broker may read a development reference: yes under the development scopes, never under ordinary production. */
export type DevelopmentReferenceAdmission = 'admitted' | 'refused';

function requireBinding(binding: CredentialSlotBinding): void {
  if (!DIGEST_PATTERN.test(binding.bindingDigest) || (binding.modelRole !== 'Main Editorial Role' && binding.modelRole !== 'Fast Interaction Role') ||
      !CREDENTIAL_SLOTS.has(binding.slot) || !CREDENTIAL_REFERENCE_PATTERN.test(binding.credentialReference)) {
    throw new CredentialBrokerError('CREDENTIAL_BINDING_INVALID', '凭据槽位绑定无效。');
  }
}

function requireCurrentBinding(binding: CredentialSlotBinding): void {
  if (binding.isCurrent?.() === false) {
    throw new CredentialBrokerError('CREDENTIAL_BINDING_STALE', '模型选择或凭据已变化；本次凭据未释放，请重新确认。');
  }
}

export class CredentialBroker {
  readonly #resolver: SecretResolver;
  readonly #developmentReferences: DevelopmentReferenceAdmission;
  #releases = 0;

  constructor(resolver: SecretResolver, options: { developmentReferences?: DevelopmentReferenceAdmission } = {}) {
    this.#resolver = resolver;
    this.#developmentReferences = options.developmentReferences ?? 'admitted';
  }

  /** Refuse a development reference before the store is touched, when this broker serves ordinary production. */
  #requireAdmittedReference(credentialReference: string): void {
    if (this.#developmentReferences === 'refused' && DEVELOPMENT_CREDENTIAL_REFERENCES.has(credentialReference.toLowerCase())) {
      throw new CredentialBrokerError('CREDENTIAL_DEVELOPMENT_REFERENCE_REFUSED', '正式使用不读取开发凭据引用；未读取任何凭据。');
    }
  }

  /** How many times a value has been released to a transmit step; zero for every v1 Run. */
  get releaseCount(): number {
    return this.#releases;
  }

  /** Readiness only: the value is resolved and discarded inside this call and never returned. */
  async checkReadiness(binding: CredentialSlotBinding): Promise<CredentialReadiness> {
    requireBinding(binding);
    this.#requireAdmittedReference(binding.credentialReference);
    requireCurrentBinding(binding);
    const value = await this.#resolver.resolve(binding.credentialReference);
    requireCurrentBinding(binding);
    return typeof value === 'string' && value.length > 0 ? 'present' : 'missing';
  }

  /**
   * The same readiness before any Execution Binding exists (Issue #420, S74a A3): whether the value behind
   * the slot and Credential Reference a frozen plan names is present, for the authorization bar that offers
   * 开始任务. The value is resolved and discarded inside this call and never returned; nothing is released.
   */
  async checkPlanReadiness(slot: CredentialSlot, credentialReference: string): Promise<CredentialReadiness> {
    if (!CREDENTIAL_SLOTS.has(slot) || !CREDENTIAL_REFERENCE_PATTERN.test(credentialReference)) {
      throw new CredentialBrokerError('CREDENTIAL_BINDING_INVALID', '凭据槽位绑定无效。');
    }
    this.#requireAdmittedReference(credentialReference);
    const value = await this.#resolver.resolve(credentialReference);
    return typeof value === 'string' && value.length > 0 ? 'present' : 'missing';
  }

  /**
   * Release the value to exactly one consumer inside the final adapter's transmit step. The ticket
   * must be the gate's `transmit-remote` decision for this exact binding; anything else refuses
   * before the store is touched.
   */
  async releaseTo<T>(binding: CredentialSlotBinding, ticket: TransmitTicket | SearchServiceTicket | SearchCandidateProbeTicket | null, consume: (value: string) => Promise<T>): Promise<T> {
    requireBinding(binding);
    this.#requireAdmittedReference(binding.credentialReference);
    // A candidate connection test (Issue #1055) releases only its own frozen production slot and reference, once, and never a
    // development reference: the policy inherits no development credential, model binding or other slot.
    if (ticket?.decision === 'call-search-candidate-probe') {
      if (ticket.bindingDigest !== binding.bindingDigest || ticket.credentialSlot !== binding.slot || ticket.credentialReference !== binding.credentialReference ||
          DEVELOPMENT_CREDENTIAL_REFERENCES.has(binding.credentialReference.toLowerCase()) || !consumeSearchCandidateProbeRelease(ticket)) {
        throw new CredentialBrokerError('CREDENTIAL_RELEASE_REFUSED', '没有本次连接测试的单次决定；凭据未释放。');
      }
      return this.#release(binding, consume);
    }
    // A search ticket releases only its frozen backend's own slot: a development reference must be that slot's own, so no
    // search host is ever handed the model's key or another backend's.
    const developmentReference = DEVELOPMENT_CREDENTIAL_REFERENCES.has(binding.credentialReference.toLowerCase());
    const searchRelease = ticket?.decision === 'call-search-service' && ticket.backend !== undefined && binding.slot.startsWith('search-') &&
      ticket.backend.credentialSlot === binding.slot && ticket.backend.credentialReference === binding.credentialReference &&
      (!developmentReference || CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES[binding.slot as keyof typeof CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES]?.toLowerCase() === binding.credentialReference.toLowerCase()) &&
      ticket.backend.host === ticket.host && ticket.bindingDigest === binding.bindingDigest && consumeSearchCredentialRelease(ticket);
    if (ticket === null || ticket.bindingDigest !== binding.bindingDigest || (ticket.decision !== 'transmit-remote' && !searchRelease) ||
        (ticket.decision === 'transmit-remote' && binding.slot.startsWith('search-'))) {
      throw new CredentialBrokerError('CREDENTIAL_RELEASE_REFUSED', '没有本次绑定的 transmit-remote 决定；凭据未释放。');
    }
    return this.#release(binding, consume);
  }

  async #release<T>(binding: CredentialSlotBinding, consume: (value: string) => Promise<T>): Promise<T> {
    requireCurrentBinding(binding);
    const value = await this.#resolver.resolve(binding.credentialReference);
    requireCurrentBinding(binding);
    if (typeof value !== 'string' || value.length === 0) {
      throw new CredentialBrokerError('CREDENTIAL_MISSING', '安全凭据库中没有该凭据引用的值。');
    }
    this.#releases += 1;
    return consume(value);
  }
}
