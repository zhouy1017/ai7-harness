# Unreferenced recovery-object dispositions

Status: **freeze-audit inventory; excluded recovery residue; not selected design authority**

At the exact pre-marker aggregate head `779db44cb557156f71af17e5b240b03681264ad5`, the Commander ran:

```text
git fsck --no-reflogs --unreachable
```

It reported the 52 unreferenced documentation commits below. None was the tip of a local branch, remote branch, pull request, tag, stash, `refs/codex/snapshots/*`, or selected aggregate line at audit time. Their subjects and tree relationships identify them as parallel Worker attempts, pre-rebase/reconcile commits, amendments, retries, failed-probe records, or superseded checkpoints.

The disposition for **every commit in this exact inventory** is: **excluded from mechanical integration as unselected recovery residue**. Later selected source heads and the aggregate reconciliations control. This grouped disposition prevents stale parents and rejected wording from overwriting later work. These objects are intentionally not pinned and may eventually be pruned by Git; the hashes identify the audited residue but do not create a retention or authority promise.

Notable reconciliations include:

- response-presentation recovery `43398d7` and later alternate rewrites `aae97d4`/`4c1b212`, all superseded by selected source `56cb1d5`;
- guidance alternates `e05773e`/`f1924f6`, superseded by selected source `e0d0d1b`;
- CI alternate `d2a305b`, tree-equivalent to selected source `08912db`;
- aggregate-review alternate `87c45a0`, superseded by selected source `66c556f`;
- earlier V1, A1, A2, probe, rescore, dispatch, and checkpoint attempts whose selected conclusions are already represented by the integrated Issues #1–#7 and Issue #4 candidate history.

## Exact audited inventory

```text
3c20e004dd9e823c56882614bfdb3a46d6429478  docs(a2): prepare exact tool surface source audit
6382d711583c79a6496e66192c7fe512656f21ed  docs(a2): prepare exact tool path discovery
d2a305b5a528440dc1e01871de0f03cccb9fc515  docs(ci): define functional test boundaries
d5c3dd3df37171192b5e4b40f0cbe2379e84564c  docs(v2): record corrected static artifact retry
1a24f7de554a016689a02472a17f43510a20ae99  docs(agents): establish design-freeze workflow
80c4a6d514e351717bd35f0729c2fe7f91ded16d  docs(a1): complete noncanonical v2 architecture candidate
87c45a02c2121de98202770a8dcbd6d1c6c6ae46  docs(design): reconcile aggregate review findings
c264c716bd4e59b073abeeeb77e294ad2cb341d5  docs(a1): complete noncanonical v2 architecture candidate
f605f247411305af279a8d9ddbe2e79b38c06716  docs(v2): prepare selected codex artifact probe
a067ce63d07c5805fd545e66df4ce7211053bd6f  docs(a1): complete noncanonical v2 architecture candidate
c2a70ffd2d90a2a82451d28dbb4d9f749e33a907  docs(v2): prepare selected codex artifact probe
36c8db0174a33e9b62423ff0064e5b6c9968784c  docs(a2): rescore exact codex artifact evidence
7589e384e49d46a4d59a7d81224bb80aec937b3c  docs(v2): record corrected static artifact retry
7c099125f5562055b7a7638fcfc16728e3afe898  docs(v2): record exact codex artifact candidates
8a49b7293f86d8e16017f9f080004e896a751649  docs(a2): correct capability closure after exact review
aae97d49a6ce093badd545cb6fe73d63c6b2df35  docs(ui-ux): define response presentation
d129d9cb80a2b6b7e4dc3c9389f2e65a8f730564  docs(agents): establish design-freeze workflow
d389c51426479fb62cd2dd29720910ee672ca006  docs(a2): prepare exact tool path discovery
50aad62c619240f009e1299b1fa93f5245abd260  docs(a2): record exact tool surface source evidence
0c8b556f80ed7141b7b22368c855c3dc76bde1b6  docs(v2): prepare selected codex artifact probe
454b8a4541d9c4836f62ff48bf74a771019755ef  docs(v2): record exact codex artifact candidates
2a4c57cbc4568034ca91b23d144bd0435b823bec  docs(v2): record failed static artifact probe
376c1d1cd55e21e6c007bada2f01d59190513c25  docs(a2): prepare exact tool path discovery
7e2e4442e149528d941839021309ad42289ee8a5  docs(a2): prepare exact tool path discovery
0f8f1fc9e0c943bbbabe4b07475b1e1337e0dc92  docs(a2): rescore exact codex artifact evidence
756f2f9b7de3316248834508b067e84b42a4522a  docs(a2): return Closure not proven for Codex-first capability closure
92d1089c0ee278d141ec752d98c0e25c2e5a2df5  docs(a1): complete noncanonical v2 architecture candidate
f1924f66a0550498c6459d18e82ffd4bf3a5a354  docs(agents): integrate incremental guidance
e813ef717611534fb93520320a338b36b1c943e9  docs(v2): record failed static artifact probe
26d4df85dcdb86d9d6033858e08ac1e655eae331  docs(a2): prepare path discovery retry
5275617a3ffd808a99a3063555267ecb9d2d98d6  docs(a2): rescore exact codex artifact evidence
c555151b700b458c367c6aca5af6c25a61055cd0  docs(v2): define bounded static evidence rescore
d035ad96ed6edb72cc0ac2d6f2eacc3ec7404992  docs(a2): record exact tool surface source evidence
e05773e50dfb851480f74d43909b2b6cba501c54  docs(agents): integrate incremental guidance
f877816d9319d546417bfd34cc90676c8b4e7175  docs(ui-ux): freeze V1 reference line
0db8ed5f0d1737bcbd7b558cda3010dd0ba5e4a5  docs(a2): correct capability closure after exact review
4cd825028c72d57e23a56f95685d59c75f027e6a  docs(a2): sync Commander probe evidence without reopening closure
cc582b5adbb90c0bcf37848ecb8023ad4087543d  docs(a2): prepare path discovery retry
43398d769bbc55d7e78e8a4f1892ee8d4e61cb5c  docs(ui-ux): define response presentation
caf93ce4d30bcc4b042dd2f2f4bd4b81618cae11  docs(progress): record v2 evidence review
d5ba95fed2f281c46802db4e5e7907fd587dd5d6  docs(ui-ux): add v2 candidate and automation design
2a5b260c62e96473254e77a45fe962a194c21220  docs(ui-ux): specify AI7 V1 editorial experience
4c1b21208637a5209cb772de706fb418c328b99d  docs(ui-ux): define response presentation
67fc3b261b5ce2982b69e2ec42ac54bbd6d7f5ef  docs(ui-ux): correct V1 freeze candidate
6bdce59c490939d78076c1d9c0b014bfc34a28ee  docs(ui-ux): correct V1 freeze candidate
8e3cdd53edeb47fd7537bb44bc6f76d3f87cd0c7  docs(a2): rescore exact codex artifact evidence
059dd658beb5191cc06abdc9fb8264db4be16b82  docs(a2): correct capability closure after exact review
dcbd4375e8f230e7620065a714b6ab5248d4241b  docs(a2): correct capability closure after exact review
055e9fb274d19cd750b923e8d92d8bf06db5515a  docs(dispatch): record Claude worker handoff
4cffc7a59733d4a000c698a4ec57faa4420c47a5  docs(a2): prepare exact tool path discovery
4e3f9186756a031b62c10e4aabc7beb97b5918c7  docs(a2): sync Commander probe evidence without reopening closure
9c1f817c4246d45f7a311406e253a23a1f384dcc  docs(a2): correct capability closure after exact review
```

## Repository-external evidence

Two local artifacts associated with snapshot `d6aa5b0c00a2c6b57cea763cac20f89a5c37c110` were also present at freeze audit time:

| Artifact | SHA-256 | Disposition |
| --- | --- | --- |
| `ai7-sample1-editorial-flow.html` | `631C18CB78E69667BBC548B25BF5AB690569ACE891A22C1F8BA7A94FE1C82184` | Workflow visualization/evidence only; the Book/import gap it exposed was closed by Issue #8; not copied into the repository |
| `ai7-design-gap-grill-commander-handoff.md` | `B8CBB3D73475744CA0C9F0112CDB0C7CF484F59F9BCA0CD12E800EEC250DD6D5` | Temporary Commander brief consumed by Issue #8; its stale start head and task instructions must not become current authority; not copied into the repository |

Their original machine-local paths are intentionally not made repository inputs. A fresh checkout does not depend on either artifact. The names and hashes establish the audit disposition without creating a personal-path or artifact-retention requirement.

Ignored private sample material, including the main worktree's ignored `SampleBooks/`, was deliberately not inspected. Manuscripts and private samples are outside this documentation freeze and must never be merged into the repository.
