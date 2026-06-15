# TTACart login — The Testing Academy

Plain-English twin of `login.spec.ts` from the open-source
[AdvancePlaywrightFramework1x](https://github.com/PramodDutta/AdvancePlaywrightFramework1x)
Playwright suite. Same flow, no selectors, no page objects — just the intent.

Prose like this is ignored by the parser; only the list items below are steps.
`standard_user` / `tta_secret` are the public demo credentials shipped in the
framework's `.env.example`. For real secrets use `{{variables}}` (masked in logs).

Run it:

    browserbash testmd run examples/ttacart_login_test.md --record

- Open https://app.thetestingacademy.com/playwright/ttacart/index.html
- Log in as standard_user with the password tta_secret
- Verify the login button is no longer visible
- Store the page heading text as 'heading'
