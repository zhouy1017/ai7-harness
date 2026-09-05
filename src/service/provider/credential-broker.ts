import { CREDENTIAL_REFERENCE_PATTERN } from '../../shared/protected-secret-identity.js';
import { DIGEST_PATTERN } from '../analysis/canonical.js';
import type { TransmitTicket } from './egress-gate.js';

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
  readonly modelRole: 'Main Editorial Role';
  readonly slot: 'deepseek-api-key';
  readonly credentialReference: string;
}

export type CredentialReadiness = 'present' | 'missing';

export class CredentialBrokerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'CredentialBrokerError';
  }
}

function requireBinding(binding: CredentialSlotBinding): void {
  if (!DIGEST_PATTERN.test(binding.bindingDigest) || binding.modelRole !== 'Main Editorial Role' ||
      binding.slot !== 'deepseek-api-key' || !CREDENTIAL_REFERENCE_PATTERN.test(binding.credentialReference)) {
    throw new CredentialBrokerError('CREDENTIAL_BINDING_INVALID', '凭据槽位绑定无效。');
  }
}

export class CredentialBroker {
  readonly #resolver: SecretResolver;
  #releases = 0;

  constructor(resolver: SecretResolver) {
    this.#resolver = resolver;
  }

  /** How many times a value has been released to a transmit step; zero for every v1 Run. */
  get releaseCount(): number {
    return this.#releases;
  }

  /** Readiness only: the value is resolved and discarded inside this call and never returned. */
  async checkReadiness(binding: CredentialSlotBinding): Promise<CredentialReadiness> {
    requireBinding(binding);
    const value = await this.#resolver.resolve(binding.credentialReference);
    return typeof value === 'string' && value.length > 0 ? 'present' : 'missing';
  }

  /**
   * Release the value to exactly one consumer inside the final adapter's transmit step. The ticket
   * must be the gate's `transmit-remote` decision for this exact binding; anything else refuses
   * before the store is touched.
   */
  async releaseTo<T>(binding: CredentialSlotBinding, ticket: TransmitTicket | null, consume: (value: string) => Promise<T>): Promise<T> {
    requireBinding(binding);
    if (ticket === null || ticket.decision !== 'transmit-remote' || ticket.bindingDigest !== binding.bindingDigest) {
      throw new CredentialBrokerError('CREDENTIAL_RELEASE_REFUSED', '没有本次绑定的 transmit-remote 决定；凭据未释放。');
    }
    const value = await this.#resolver.resolve(binding.credentialReference);
    if (typeof value !== 'string' || value.length === 0) {
      throw new CredentialBrokerError('CREDENTIAL_MISSING', '安全凭据库中没有该凭据引用的值。');
    }
    this.#releases += 1;
    return consume(value);
  }
}
