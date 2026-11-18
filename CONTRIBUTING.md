# Contributing to Training Agent

Thank you for your interest in the project. This guide tells you how to set up the project, run the checks and open a pull request.

## Before you start

- For a bug, [open a bug report](https://github.com/lucasprac/training-agent/issues/new?template=bug_report.yml).
- For a new feature, [open a feature request](https://github.com/lucasprac/training-agent/issues/new?template=feature_request.yml) first. Agree on the idea before you write a large change.
- For a security problem, read [SECURITY.md](SECURITY.md). Do not open a public issue.

## Set up the project

Follow the [Quickstart](README.md#quickstart). The tests do not need API keys, because they mock Sage and OpenRouter.

## Make a change

1. Fork the repository and create a branch from `main`.
2. Keep the change focused on one topic.
3. Add or update tests for changed behaviour. The backend tests are in `backend/tests/`.
4. Run the checks:

   ```bash
   cd backend && uv run pytest
   ```

   ```bash
   cd frontend && npm run lint && npm run build
   ```

5. If the change affects the behaviour or the setup, update both `README.md` and `README.pt-BR.md`.
6. If the change adds interface text, add it to `frontend/src/i18n.ts` in English and in Portuguese (BR).

## Project rules

- The simulation model never sees scores. Sage answers reach the prompt only as labels (see the [Sage ↔ prompt contract](README.md#technical-reference)).
- Declare every fixed Sage question once, in `backend/app/sage/registry.py`.
- A `null` answer from Sage is never a low score. It marks the row for review.

## Open a pull request

- Fill in the pull request template.
- Describe what changed and why.
- Add screenshots for interface changes.
- The CI runs the backend tests, the frontend lint and the frontend build. All of them must pass.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
