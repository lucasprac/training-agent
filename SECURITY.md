# Security policy

## Current status

Training Agent is a prototype. Use it for prototypes and demos only.

- **There is no login and no access control.** The browser stores the chosen profile, and anyone who can open the interface can switch to any profile, including the manager.
- The backend has no authentication. Do not expose ports 8000 or 5173 to the internet.
- Do not use real employee data or real customer data in scenarios or simulations.
- Keep your `.env` file out of version control. The repository ignores it by default.

Login and access control are on the [roadmap](README.md#roadmap).

## Report a vulnerability

Do not open a public issue for a security problem.

1. Open the **Security** tab of this repository.
2. If the tab shows **Report a vulnerability**, use it to send a private report. Include the steps to reproduce the problem and the commit that you tested.
3. If the tab does not show this button, open an issue that asks for a private contact. Do not put the details of the problem in the issue.
