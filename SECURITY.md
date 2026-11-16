# Security Policy

BirdPlot runs Python code that comes from AI chatbots, so security reports
are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: **Security → Report a vulnerability** on
this repository (private vulnerability reporting).

Include:

- What you found and where (file, function, or behavior)
- Steps to reproduce, or a small proof of concept
- The impact you expect (for example sandbox escape, data leaving the
  browser, access to the chatbot page or session)
- Your browser and extension version

## What to expect

- Acknowledgment within a few days
- A fix and a coordinated disclosure date once the issue is confirmed
- Credit in the release notes if you want it

## Scope

In scope:

- Escaping the Pyodide / extension sandbox
- Code running outside the extension's isolated context
- Any network request or data leaving the browser that shouldn't
- Access to chat content, cookies, or tokens of the supported sites
- Extension permission or CSP weaknesses

Out of scope:

- Bugs in the chatbot websites themselves
- Issues that need the user to install a modified or fake copy of BirdPlot
  (see TRADEMARK.md for how to identify official builds)

## Design promise

BirdPlot runs code locally in the browser and collects no data. If you find
behavior that breaks that promise, please report it.
