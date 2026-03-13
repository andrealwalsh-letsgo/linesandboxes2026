# Engineering Philosophy

General development methodology. Referenced by project-level `CLAUDE.md` files.

## Development Methodology

### BDD/TDD Workflow

All changes follow a strict red-green cycle:

1. **Functional tests first.** Write a failing end-to-end or integration test that describes the desired behaviour from the user's perspective. Run it. Confirm it fails.
2. **Unit tests next.** Write failing unit tests for the specific logic that needs to change. Run them. Confirm they fail.
3. **Implementation last.** Write the minimum code to make the tests pass.
4. **Refactor.** Clean up with confidence that tests catch regressions.

### Test Judgement

Not every change needs a functional test. Use judgement:

- **Functional test warranted:** User-facing behaviour changes, new commands or endpoints, changes to output format or ordering, interactive flow changes. Anything where the user or caller would notice a difference.
- **Unit test sufficient:** Internal refactors, helper functions, edge cases in parsing, boundary conditions, data structure changes that don't alter external behaviour.
- **Both:** Bug fixes. A functional test reproduces the bug as experienced; a unit test isolates the root cause.

### Test Conventions

- Test names describe the scenario, not the implementation: `test_last_digit_promoted_over_easier_level` not `test_sort_key_returns_one`.
- Failure condition tests are as important as success tests. Cover: empty inputs, null/missing data, invalid state, resource errors, boundary conditions.
- Group tests by feature area, not by class under test.
- When monkey-patching or mocking, always restore original state (try/finally, context managers, or framework teardown).

## Code Style

- Commits are atomic and descriptive. Commit message explains the "why."
- No em-dashes in user-facing text or generated documents.
- Human-readable outputs preferred over technically precise ones (e.g., second-precision timestamps, not microsecond).
- When the user corrects phrasing, adopt their exact wording.

### Readability and Explainability

The code must be understandable by someone coming to it cold. If a reader has to stop and puzzle over what something does, that's a defect -- even if the logic is correct.

**Naming:**
- Variable names must reflect what the value *is*, not abbreviate it. `sentence_tokens` not `sent_tokens`. `accumulated_tokens` not `current_tokens`.
- Parameter names must make sense without reading the docstring. `document_text` not `text`. `document_name` not `source`.
- Function names must describe the action or question from the caller's perspective. `_chunk_is_complete` not `_should_flush`. `_build_chunk` not `_make_chunk`.
- If a name could be misread (e.g. `sent` as past tense of "send"), pick a different name.

**Functions:**
- Every function gets its own unit test.
- If a code block needs a comment to explain it, extract it into a function with a semantic name and tests that show its behaviour. The function name *is* the comment.
- Functions should fit on one screen (~30 lines max).
- `_` prefix for internal/helper functions not part of the module's public API. Only functions used outside the module (excluding tests) are unprefixed.

**Magic numbers and constants:**
- Numeric defaults must be named constants with a rationale. State whether they are hard constraints or tuning parameters likely to change.
- Tests that check bounds must use the same constants as the implementation, not hardcoded copies that can drift.

**Logic flow:**
- Prefer early `continue`/`return` for the common path. Put the exceptional path after.
- Group related state changes together. Don't interleave updates to different variables when they can be done in sequence.
- Complex expressions (regex patterns, list comprehensions with multiple clauses) should be extracted into named functions.

**Regex:**
- Never inline a complex regex. Compile it as a named module-level constant with a descriptive name.
- Extract boundary/matching functions (e.g. `_is_sentence_boundary`) so the regex's intent is testable independently of its syntax.

**Test quality:**
- Test data should be realistic, not minimal placeholders. Use domain-representative text, not single words.
- Vary test inputs: don't test the same parameter value in every case. Cover 0, 1, typical, and negative/edge values.
- Test assertions and error messages should reference the same constants as the implementation.

## General Principles

- Favour the simplest solution that handles the actual use case. Avoid over-engineering for hypothetical future needs.
- User-facing text describes what the user should do or look for, not what the algorithm does internally.
- Batch operations should be undoable. If multiple changes are applied as a group, undo should revert the group.
- File-based state (logs, caches, session data) should be written incrementally where possible to survive unexpected termination.
- Filenames and identifiers intended for human consumption should be readable. Prefer conventions like `_2`, `_3` suffixes over UUIDs or microsecond timestamps for collision avoidance.
