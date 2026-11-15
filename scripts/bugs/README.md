# The intermittent remix bug (patch only)

`remix-intermittent-failure.patch` is a realistic bug for the on-call exercise (#88). It is
never applied to the committed code and lives in no branch: the application on every branch
is correct. It is applied to a scratch copy by `apply-and-test.sh`, and to the CI workspace
by `.github/workflows/deploy-dev-branch.yml` and `bug-chain.yml`.

## What it does

It adds "keep acronyms in their standard spelling" to `write_remix` (`SAAS` becomes `SaaS`).
The regex that finds acronyms matches `CRUD`, `LLM`, `CSS`, `RAG`, `SQL` and `MVP`, but the
lookup table does not contain them, so a title with one of them raises `KeyError`.
`POST /api/videos/{id}/remix` then answers HTTP 500 and `clipremix_remix_failures_total`
increases. Titles without such a word still give 201. The existing tests use titles
without them, so they pass. With `VIDEO_SOURCE=sample`, a fetch makes 15 videos and 3 are hit.

## Use

```bash
scripts/bugs/apply-and-test.sh                 # proof on a scratch copy; changes nothing here
git apply scripts/bugs/remix-intermittent-failure.patch   # only on a throwaway checkout
scripts/remix-all-videos.sh http://localhost:8091         # prints 201 and 500 counts
```

`apply-and-test.sh` shows that the full existing backend suite passes with the patch, that
`test_patched_remix.py` sees the 500s and the failure counter, and that the same test fails on
clean code. `backend/tests/test_bug_patch.py` keeps the committed code free of the bug and
checks that the patch applies and that promotion refuses the `bugtest-` image tag.
