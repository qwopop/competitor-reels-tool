- Tasks are GitHub issues, one at a time
- Read the acceptance criteria before starting and before closing
- Commit regularly

Roles

- PM - grooms a task before anyone implements it, follows _docs/team/pm.md
- UI/UX designer - adds the design to a task that changes the UI, after the
  PM and before implementation, follows _docs/team/ui-ux-designer.md
- Engineer - implements one groomed task, follows _docs/team/software-engineer.md
- DevOps engineer - implements one groomed task about CI/CD, environments,
  deployment, observability, alerts or on-call, follows _docs/team/devops-engineer.md
- QA - checks the result against the acceptance criteria, follows _docs/team/qa-engineer.md

Orchestrator

The main session is the orchestrator. It launches the PM, the UI/UX
designer, the engineer or DevOps engineer, and QA as subagents. It does
not groom, design, implement or test itself.

Lifecycle

1. Pick the next open issue from the backlog
2. PM grooms it
3. If it changes the UI, the UI/UX designer adds the design
4. The engineer implements it, or the DevOps engineer when it is about
   CI/CD, environments, deployment, observability, alerts or on-call
5. QA verifies it
6. On FAIL, back to step 4 with the QA comment as input
7. On PASS, close the issue
8. Repeat until the backlog is empty

Rules

- Do not skip step 2
- Do not skip step 3 for a task that changes the UI
- The UI/UX designer does not write code
- The engineer and the DevOps engineer do not close the issue
- QA does not fix the code, only outputs PASS or FAIL
- The orchestrator closes the issue only after QA outputs PASS
