/** Types of the plain-ESM synthetic manuscript generator, for the TypeScript case runner. */
export interface SyntheticParagraph {
  readonly text: string;
  readonly style?: string;
}
export interface SyntheticDefect {
  readonly id: string;
  readonly paragraph: number;
  readonly category: string;
  readonly concern: string;
  readonly from: number;
  readonly to: number;
  readonly spanSha256: string;
  /** The clean words the injection replaced; `null` for an authored defect with no single correction. */
  readonly correction: string | null;
}
export interface SyntheticTrap {
  readonly id: string;
  readonly paragraph: number;
  readonly reason: string;
  readonly from: number;
  readonly to: number;
  readonly spanSha256: string;
}
export interface SyntheticManuscript {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: ReadonlyArray<SyntheticParagraph>;
  readonly defects: ReadonlyArray<SyntheticDefect>;
  readonly traps: ReadonlyArray<SyntheticTrap>;
  readonly textSha256: string;
}
export declare const SYNTHETIC_MANUSCRIPT_IDS: ReadonlyArray<string>;
export declare function graphemeLength(text: string): number;
export declare function generateSyntheticManuscript(id: string): SyntheticManuscript;
