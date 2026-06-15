# TTACart end-to-end checkout — The Testing Academy

Plain-English twin of `e2e-checkout.spec.ts` from the open-source
[AdvancePlaywrightFramework1x](https://github.com/PramodDutta/AdvancePlaywrightFramework1x)
Playwright suite — login → browse → cart → checkout → confirmation, all in one
session. The TypeScript version is ~80 lines across six page objects; this is the
whole journey in plain English.

Prose like this is ignored by the parser; only the list items below are steps.
The session (the logged-in user) is held across every step to the end.

Run it:

    browserbash testmd run examples/ttacart_checkout_test.md --record --upload

- Open https://app.thetestingacademy.com/playwright/ttacart/index.html
- Log in as standard_user with the password tta_secret
- Go to the products inventory page
- Add the "Test.allTheThings() T-Shirt (Red)" to the cart
- Open the cart and verify it contains exactly 1 item
- Click Checkout
- Fill the checkout details: first name Pramod, last name Dutta, postal code 560001
- Continue to the order overview, then click Finish
- Verify the page shows the text "Thank you for your order!"
- Store the confirmation header text as 'confirmation'
