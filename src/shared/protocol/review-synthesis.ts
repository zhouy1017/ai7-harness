export interface ReviewSynthesisSummary {
  overallAssessment: string;
  recurringProblems: Array<{ title: string; explanation: string; evidenceRefs: string[]; priority: string }>;
  contextualExplanations: Array<{ explanation: string; evidenceRefs: string[] }>;
  priorities: string[];
}

export interface ReviewSynthesisProjection {
  state: 'pending' | 'running' | 'completed' | 'missing' | 'budget';
  detail: string;
  /** The model that wrote a summary 生成统合总结 asked for (Issue #1506), which may differ from the Run's. */
  modelLabel?: string;
  /** 生成统合总结 may be asked for now (Issue #1506), first offering the Run's own model and 思考强度 when it names one. */
  canGenerate?: true;
  runChoice?: { modelConnectionId: string; modelId: string; reasoningEffort: string };
  summary: ReviewSynthesisSummary | null;
  missingCategories: string[];
  omissionLabel: string | null;
  evidence: Array<{ ref: string; findingId: string; chapterLabel: string; quote: string;
    status: 'pending' | 'handled' | 'ignored' | 'absent'; blockId: string | null }>;
}
