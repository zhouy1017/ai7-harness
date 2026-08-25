# Preserve post-designation maintenance as versioned cases

AI7 records each post-designation maintenance matter as a stable Maintenance Case with immutable Maintenance Case Revisions, bound permanently to the exact Publication Version and Editorial Deliverable Revision concerned. Each case has one stable Maintenance Classification:

| Stable value | Preferred Simplified Chinese | Exact consequence |
| --- | --- | --- |
| `correction` | 更正 | A Correction Proposal may produce a new Editorial Deliverable Revision; the target stays unchanged and no new Publication Version is automatic. |
| `errata` | 勘误 | A versioned Editorial Artifact discloses identified errors and stated corrections without mutating the target. |
| `supersession` | 替代 | A separately and manually designated newer Publication Version replaces the target for future AI7 use only. |
| `withdrawal` | 撤回 | The target becomes ineligible for future AI7 publication use while remaining readable and historically intact; archival and separately governed local recovery export remain available, with no external withdrawal, takedown, recall, or notice claim. |
| `reissue` | 再版 | A new issue or edition always receives a distinct manually designated Publication Version for its scope. It may reuse the same exact Editorial Deliverable Revision or designate a separately created newer one; only content change uses the applicable proposal/mutation path to create that newer revision. |
| `archive` | 归档 | The target closes and leaves ordinary active-maintenance visibility and queues while its existing publication-use eligibility, authority state, readability, and exact history remain unchanged; nothing is deleted or externally archived by implication. |

The case target and classification never change. Prior Editorial Deliverable Revisions, Publication Versions, permissions, packages, exports, and receipts remain immutable.

Withdrawal, Supersession, and Archive are internal AI7 states with different consequences: Supersession changes the future AI7 publication reference through a separately designated newer Publication Version; Withdrawal changes future AI7 publication-use eligibility but retains readability, history, archival, and separately governed local recovery export; Archive changes ordinary active-maintenance visibility and queue membership without changing the target's existing eligibility or authority history. None claims that an exported file was recalled, an external publication was withdrawn or taken down, or a recipient was notified. Content correction and content-changing reissue create new exact revisions through the applicable proposal and mutation path; every reissue still requires its own distinct manually designated Publication Version even when it reuses the same Editorial Deliverable Revision. Local exports remain separate Effects, and no Maintenance Case creates External Export Policy authority, Effect Approval, external delivery, publication, recall, or takedown authority.

## Considered options

Workflow-phase notes alone would make maintenance hard to address, version, and trace. Mutating or replacing the prior Publication Version would erase the exact history required for correction and accountability. A single free-form maintenance label would collapse materially different consequences. Versioned, classified cases retain history while allowing current internal status to change explicitly.
