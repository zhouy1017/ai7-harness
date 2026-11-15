export interface ReviewSynthesisSummary {
  overallAssessment: string;
  recurringProblems: Array<{ title: string; explanation: string; evidenceRefs: string[]; priority: string }>;
  contextualExplanations: Array<{ explanation: string; evidenceRefs: string[] }>;
  priorities: string[];
}

export interface ReviewSynthesisProjection {
  state: 'pending' | 'running' | 'completed' | 'missing' | 'budget';
  detail: string;
  summary: ReviewSynthesisSummary | null;
  missingCategories: string[];
  omissionLabel: string | null;
  evidence: Array<{ ref: string; findingId: string; chapterLabel: string; quote: string;
    status: 'pending' | 'handled' | 'ignored' | 'absent'; blockId: string | null }>;
}
