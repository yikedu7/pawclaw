A push to main just changed one or more files under docs/.

1. Find which docs changed:
   git diff HEAD~1 HEAD --name-only -- 'docs/**'

2. For each changed doc, read it in full.

3. List all open GitHub issues:
   gh issue list --repo $GITHUB_REPOSITORY --state open --limit 100 --json number,title,body,labels

4. For each open issue, check whether its body references any design decisions, field names, env vars, or approach choices that now contradict what the changed docs say.

5. For every stale issue found, update it:
   - Edit the body to reflect the current design (gh issue edit <N> --repo $GITHUB_REPOSITORY --body "...")
   - If the issue was blocked by a dependency that the doc change resolves, remove the "blocked" label (gh issue edit <N> --repo $GITHUB_REPOSITORY --remove-label "blocked")
   - Add a comment explaining what changed and why:
     gh issue comment <N> --repo $GITHUB_REPOSITORY --body "Updated by docs-issue-sync: <doc file> changed on main. <one sentence explaining what was stale and what was corrected>"

6. If no issues are stale, do nothing.

Focus only on concrete contradictions (wrong field names, wrong approach, resolved blockers). Do not rewrite style or add detail that isn't already in the doc.
