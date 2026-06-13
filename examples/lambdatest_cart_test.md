# SauceDemo cart on LambdaTest

Runs on LambdaTest's cloud grid — the session video, network log, and console
are recorded automatically and appear at https://automation.lambdatest.com/build
marked passed or failed.

Prose like this is ignored by the parser; only list items are steps.

Run it:

    export LT_USERNAME=your_username
    export LT_ACCESS_KEY=your_access_key
    export ANTHROPIC_API_KEY=sk-ant-...   # cloud grids use the builtin (Anthropic) engine
    browserbash testmd run examples/lambdatest_cart_test.md --provider lambdatest

- Open https://www.saucedemo.com
- Log in as standard_user with password secret_sauce
- Add the Sauce Labs Backpack to the cart
- Store the cart badge count as 'cart_count'
