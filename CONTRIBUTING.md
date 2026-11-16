# Contributing to BirdPlot

Thanks for helping. BirdPlot is built for students and teachers, and the
most valuable help is keeping it working on every chatbot site.

## Easiest first contributions

- **Fix a site that broke.** Chatbot websites change their layout often.
  Each site has its own small detection module, so a fix is usually a few
  lines. Look for issues labeled **good first issue**.
- **Add a new chatbot site.** Copy an existing site module and adjust the
  selectors for the code block and the "response finished" signal.
- **Report AI code that fails.** Open an issue with the code snippet and the
  error. Common failures help us improve auto-fixes.
- **Improve docs or the supported sites table.**

## How to contribute

1. Fork the repo and create a branch.
2. Make your change and test it on the real site in your browser.
3. Open a pull request that says which site and browser you tested.

## Rules

- **Privacy first:** no analytics, tracking, or network requests that send
  user data anywhere. Code runs locally.
- **No remote code:** everything must be bundled in the extension.
- **Keep permissions minimal:** only the chatbot domains we support.
- **Security issues:** report privately, not in a public issue. See
  [SECURITY.md](SECURITY.md).

## Licensing and the name

By contributing, you agree your contribution is licensed under the Apache
License 2.0, the same as the project. The BirdPlot name and logo are covered
by [TRADEMARK.md](TRADEMARK.md): forks must use a different name and may say
"Based on BirdPlot by x0root".
