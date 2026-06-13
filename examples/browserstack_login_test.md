# Secure area login on BrowserStack

Runs on BrowserStack Automate — every session gets a video replay plus text and
network logs at https://automate.browserstack.com/dashboard, and BrowserBash
marks it passed or failed via the browserstack_executor protocol.

Run it:

    export BROWSERSTACK_USERNAME=your_username
    export BROWSERSTACK_ACCESS_KEY=your_access_key
    export ANTHROPIC_API_KEY=sk-ant-...   # cloud grids use the builtin (Anthropic) engine
    browserbash testmd run examples/browserstack_login_test.md --provider browserstack

- Open https://the-internet.herokuapp.com/login
- Log in as tomsmith with password SuperSecretPassword!
- Verify the page says 'You logged into a secure area'
