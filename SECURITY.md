# Security policy

## Current status

Training Agent is a prototype for demos and pilots.

- **There is no login and no access control.** The browser stores the chosen profile, and anyone who can open the interface can switch to any profile, including the manager.
- The backend has no authentication. Do not expose ports 8000 or 5173 to the internet.
- Do not use real employee data or real customer data in scenarios or simulations.
- Keep your `.env` file out of version control. The repository ignores it by default.

Login and access control are on the [roadmap](README.md#roadmap).

## Report a vulnerability

Do not open a public issue for a security problem.

Use GitHub's private reporting: open the **Security** tab of this repository and click **Report a vulnerability**. Include the steps to reproduce the problem and the commit that you tested.

You can expect a first answer within 7 days.
