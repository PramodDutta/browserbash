---
title: Test a Multi-Tenant SaaS With Saved Auth Profiles Per Tenant
description: "Learn multi tenant saas testing auth profiles with BrowserBash: save one storageState per tenant and run the same test file across every account."
date: 2026-07-23
category: use-case
---

If you run a multi-tenant SaaS product, you already know the test suite problem nobody talks about at standup: every tenant is a different account, a different login, sometimes a different subdomain, and your end-to-end tests have to log in as all of them before they can check anything. Multi tenant saas testing auth profiles is really a login-management problem wearing a testing costume. Get the login layer wrong and every other test you write inherits the pain: slow runs, flaky sessions, and a suite that only ever gets exercised against one demo tenant because setting up the rest is too annoying. BrowserBash solves this with a simple primitive: save one auth profile per tenant, then run the exact same plain-English test file against each of them by swapping a single flag.

This article walks through the actual workflow: saving a storageState profile for each tenant, writing one tenant-agnostic test file instead of five near-duplicates, and running that file across your whole tenant roster in CI with `run-all` and `--auth`. It also covers where this approach breaks down and what you should do instead when it does.

## Why Multi-Tenant SaaS Breaks Typical Test Auth Strategies

Most end-to-end testing advice assumes one login. Log in once at the top of the suite, reuse the session, done. That story falls apart the moment your product is multi-tenant, because "logged in" isn't one state, it's N states: one per tenant, and often one per role within each tenant (admin, member, viewer).

A few things make this specifically painful for browser automation:

- **Different login paths per tenant.** Some products use subdomain-based tenancy (`acme.yourapp.com`), some use a workspace picker after a shared login screen, some use SSO for enterprise tenants and password auth for everyone else.
- **Different permissions and data per tenant.** A test that passes against your admin sandbox tenant can silently miss a permissions bug that only shows up for a tenant with a restricted role.
- **Re-login tax multiplies.** If your suite has 20 tests and 5 tenants you care about, naive re-login-every-test scales that to 100 logins per run. Even a fast login flow adds seconds; a flow with MFA, SSO redirects, or onboarding modals adds a lot more.
- **Session bleed risk.** Reusing one browser profile across tenants without a clean reset can leak cookies or local storage between tenant contexts, producing false passes or confusing failures that have nothing to do with your product code.

The fix people reach for first is usually one of two bad options: either write a separate test file per tenant (which means every product change now needs N edits), or skip multi-tenant coverage almost entirely and just test the one demo account (which means tenant-specific bugs ship straight to real customers). Neither scales past a handful of tenants.

## The Core Idea: One Auth Profile Per Tenant, One Test File For All

BrowserBash's saved-login feature ([see the full feature rundown](https://browserbash.com/features)), driven by `browserbash auth save`, captures a Playwright storageState: cookies, local storage, session tokens, everything the browser needs to already be logged in when a test starts. That's the mechanism. The multi-tenant pattern is what you build on top of it: instead of saving one profile called `default`, you save one profile per tenant, named after the tenant, and you write your test files to be tenant-agnostic by using `{{variables}}` for anything that differs (subdomain, tenant name shown in the UI, expected plan tier, and so on).

The result is a clean separation of concerns:

- **Auth profiles** carry "who am I logged in as" (tenant plus role).
- **The test file** carries "what am I checking" (the actual behavior).
- **Variables** carry "what's different about this tenant" (URLs, display strings, expected data).

You write the behavior once. You swap the identity per run. This is the same idea as parameterized tests in a unit testing framework, just applied to full browser sessions instead of function calls.

## Setting Up Your First Tenant Auth Profile

Saving a profile is interactive: BrowserBash opens a real browser, you log in by hand (including clicking through any MFA or SSO steps), and pressing Enter captures the session.

```bash
browserbash auth save tenant-acme --url https://acme.yourapp.com/login
```

Do this once per tenant you want covered. A realistic setup for a SaaS with a handful of flagship accounts and a couple of internal QA tenants might look like:

```bash
browserbash auth save tenant-acme    --url https://acme.yourapp.com/login
browserbash auth save tenant-globex  --url https://globex.yourapp.com/login
browserbash auth save tenant-initech --url https://initech.yourapp.com/login
browserbash auth save qa-admin       --url https://qa.yourapp.com/login
browserbash auth save qa-viewer      --url https://qa.yourapp.com/login
```

Notice `qa-admin` and `qa-viewer` point at the same tenant but capture two different roles. That's the second axis worth saving profiles for: tenant identity and role are independent, and a permissions bug usually only shows up when you actually run as the restricted role rather than assuming it behaves like admin.

One detail that matters in a multi-tenant setup specifically: BrowserBash checks that a saved profile's origins actually cover the URL you're about to test against. If you try to run a test starting at `initech.yourapp.com` using the `tenant-acme` profile, you get a warning instead of a silent, confusingly broken run. That guardrail exists precisely because it's easy to mix up profile names when you've got a dozen of them, and a silent mismatch is the worst failure mode: the test either fails somewhere downstream for the wrong reason, or worse, appears to pass against the wrong tenant's data.

## Writing a Tenant-Agnostic Test File

With profiles saved, the test file itself should not care which tenant it's running against. That's the whole point: one file, many identities. Use `{{variables}}` for anything tenant-specific, and let the `--auth` flag handle getting into the right account.

```markdown
---
version: 2
---
# Verify billing page loads correct plan and tenant name

1. GET {{apiBaseUrl}}/api/v1/account with body {}
   Expect status 200, store $.plan as 'expectedPlan'
2. Go to {{appUrl}}/settings/billing
3. Verify 'Billing' heading visible
4. Verify text 'expectedPlan' visible
5. Verify text '{{tenantDisplayName}}' visible
6. Verify 'Upgrade plan' button visible
```

The behavior under test (does the billing page load, does it show the right plan, does it show the right tenant name) never changes. What changes per run is which auth profile is active and which values `appUrl`, `tenantDisplayName`, and `apiBaseUrl` resolve to. Keep tenant-specific values in per-tenant variable files under `.browserbash/variables/`, one JSON file per tenant, and BrowserBash's standard variable resolution and secret-masking apply exactly as they do for a single-tenant suite. This is the same testmd v2 structure BrowserBash uses everywhere: a deterministic API step to seed or check state directly, followed by deterministic `Verify` steps that compile to real Playwright checks instead of relying on model judgment for pass or fail.

If you don't need the API-seeding step, a plain v1 test file works identically, with no `version: 2` frontmatter needed:

```markdown
# Verify team members page shows the right tenant

- Go to {{appUrl}}/team
- Verify 'Team Members' heading visible
- Verify text '{{tenantDisplayName}}' visible
- Verify at least 1 row in the members table
```

Either format benefits from the same pattern: identity lives in the auth profile, everything else lives in variables, and the test steps stay stable no matter how many tenants you add later.

## Running the Same Suite Across Every Tenant

This is where the pattern pays off. A single test (or a whole folder of them) runs against a given tenant by passing `--auth` with that tenant's profile name:

```bash
browserbash testmd run .browserbash/tests/billing_test.md --auth tenant-acme
browserbash testmd run .browserbash/tests/billing_test.md --auth tenant-globex
browserbash testmd run .browserbash/tests/billing_test.md --auth tenant-initech
```

For a whole suite folder, `run-all` accepts `--auth` the same way, applying that tenant's identity across every test file in the run:

```bash
browserbash run-all .browserbash/tests --auth tenant-acme --junit out/acme-junit.xml
```

To cover your full tenant roster in CI, loop the same `run-all` invocation once per tenant, swapping only the `--auth` value and the variable file it should pick up:

```bash
for tenant in tenant-acme tenant-globex tenant-initech; do
  BROWSERBASH_TENANT="$tenant" browserbash run-all .browserbash/tests \
    --auth "$tenant" \
    --agent \
    --junit "out/${tenant}-junit.xml"
done
```

That's the entire mechanism: one test folder, one loop, N tenants covered, no duplicated test logic. If a tenant-specific bug ships (say, the Globex tenant's billing page is missing the "Upgrade plan" button because of a feature flag misconfiguration), it fails specifically in the `tenant-globex` run, with its own JUnit output and its own Result.md, while `tenant-acme` and `tenant-initech` stay green. You get tenant-level attribution for free, which is exactly what you want when triaging a report from one specific customer.

## Structuring Your Repo for Many Tenants

As your tenant count grows past a handful, a bit of repo structure keeps things sane:

```
.browserbash/
├── tests/
│   ├── billing_test.md
│   ├── team_members_test.md
│   └── invite_flow_test.md
└── variables/
    ├── tenant-acme.json
    ├── tenant-globex.json
    └── tenant-initech.json
```

The test files never change per tenant. The variable files hold the differences: `appUrl`, `tenantDisplayName`, expected plan tiers, feature flag states, whatever varies. Auth profiles (saved globally under `~/.browserbash/`, not the project folder) hold the login state. That three-way split, tests, variables, and auth, is what makes adding tenant number thirty as cheap as adding tenant number two: one `auth save` command, one variables JSON file, zero new test files.

It's worth being honest about where this gets harder. If different tenants genuinely have different UI (a white-labeled product with per-tenant themes, or feature flags that change entire page layouts, not just text), a single test file starts accumulating conditional logic that undermines the "one file for all tenants" premise. At that point, split by product tier or feature-flag cohort rather than by tenant, and keep the per-tenant axis strictly to auth and data variables. The pattern works best when tenants differ in data and permissions, not in fundamental UI structure.

## Catching Tenant-Specific Regressions With Deterministic Verify Assertions

Multi-tenant bugs are frequently permission bugs: tenant A's admin can see a button that tenant B's admin cannot, or a viewer role can reach an action it shouldn't be able to reach. This is exactly the class of bug that benefits from BrowserBash's deterministic `Verify` steps rather than agent judgment. A `Verify` line that matches the grammar (URL contains, title is or contains, text visible, `'name' button|link|heading` visible, element counts, stored value equals) compiles straight to a real Playwright assertion. There's no model in the loop deciding whether the button "looks" present; either the DOM has it or it doesn't, and the evidence (expected versus actual) lands directly in `run_end.assertions` and the Result.md table.

That matters a lot for multi-tenant work specifically, because a flaky agent-judged assertion is annoying in a single-tenant suite and genuinely misleading in a multi-tenant one: if `tenant-globex`'s run fails, you need to trust that it failed because of a real permissions difference, not because the model had an off moment interpreting a screenshot. Deterministic checks give you that trust. Any `Verify` line outside the supported grammar still runs, just agent-judged, and gets flagged `judged: true` in the output so you always know which kind of check produced a given result.

## Wiring Multi-Tenant Auth Testing Into CI

Once the loop above works locally, dropping it into CI is mechanical. Run in agent mode so the output is machine-parseable NDJSON instead of prose, and check the standard exit codes: `0` passed, `1` failed, `2` error, `3` timeout.

```bash
browserbash run-all .browserbash/tests --auth tenant-acme --agent --junit out/acme-junit.xml
```

If you're already using the official GitHub Action, it handles JUnit and NDJSON artifact upload and posts a self-updating PR comment with the verdict table, so a matrix job per tenant (using `shard:` and separate `--auth` values per job) gives you a per-tenant pass or fail breakdown directly in the PR, not buried in a log. Details for wiring the action are at [the GitHub Action docs](https://github.com/PramodDutta/browserbash/blob/main/docs/github-action.md).

For teams with a larger tenant roster and a real CI budget to protect, combine the per-tenant loop with cost governance: `run-all --budget-usd` stops launching new tests once a run crosses a spend threshold, marks the rest `skipped`, exits `2`, and records the spend in `RunAll-Result.md` and the JUnit `<properties>` block. That's a reasonable safety net when "run the suite once per tenant" could otherwise multiply your model spend by your tenant count on a bad day, a config change that breaks caching for everyone, say.

```bash
browserbash run-all .browserbash/tests --auth tenant-acme --budget-usd 2 --agent
```

Because BrowserBash's replay cache records a green run's actions and replays them with zero model calls on the next identical run, steady-state multi-tenant CI runs get cheap fast: the first run per tenant costs real model tokens, but subsequent runs against an unchanged UI mostly replay. The agent only steps back in when the page actually changed, which is when you want it spending tokens anyway.

There's also a practical secrets question worth answering up front: where does the tenant login credential itself live once you've captured a profile with `auth save`? The answer is that it mostly doesn't need to live anywhere after that point. The saved profile is a storageState snapshot, cookies, tokens, local storage, not the underlying password or SSO credential, so your CI job never needs the raw tenant credential in an environment variable at all. The person who ran `auth save` needed the credential once, interactively, on their own machine. After that, the CI pipeline only needs read access to the saved profile itself, which shrinks your secrets surface considerably compared to storing five sets of tenant passwords as CI secrets and re-deriving a session on every run.

## Monitoring Tenant Login Health Continuously

Saved auth profiles aren't just a CI convenience, they're also a good early-warning system for one specific, very customer-visible failure mode: a tenant's login silently breaking. SSO configuration drift, an expired certificate on an enterprise tenant's identity provider, a subdomain routing change, these show up first as "customer can't log in," and you'd rather catch that from a scheduled check than from a support ticket.

```bash
browserbash monitor .browserbash/tests/login_health_test.md \
  --auth tenant-acme \
  --every 10m \
  --notify https://hooks.slack.com/services/your/webhook/url
```

Run one monitor per flagship tenant against a lightweight login and dashboard-load test. `monitor` mode alerts only on pass-to-fail (and fail-to-pass) transitions, not on every green check, so you're not drowning your Slack channel in "still fine" noise. And because the replay cache applies here too, an always-on monitor per tenant stays close to free on the model-cost side once the initial pass establishes a baseline.

## When to Use This Pattern (and When Not To)

This per-tenant auth profile approach is a strong fit when:

- You have a defined, relatively stable list of tenants you care about (flagship customers, internal QA accounts, a staging tenant per plan tier).
- Your product's core flows are structurally the same across tenants, with data and permissions being the main variable.
- You want tenant-level failure attribution in CI rather than one aggregate "something's broken somewhere" signal.

It's a weaker fit when:

- Tenants are created and torn down dynamically at high volume, think every trial signup gets its own tenant. Maintaining a saved auth profile per tenant doesn't scale to thousands of ephemeral tenants; that scenario calls for API-driven test data provisioning (seed a fresh tenant via API, log in programmatically) rather than a library of hand-saved profiles.
- Tenants have fundamentally different UIs, not just different data. At that point, branch your test files by UI variant, not by tenant.
- You need session state that expires quickly, such as short-lived SSO tokens. A saved storageState is a snapshot; if a tenant's session naturally expires in minutes, you'll be re-saving that profile often enough that the "save once" convenience mostly disappears. In that case, re-login-per-run for that specific tenant may genuinely be simpler than fighting profile staleness.

For the common middle case, a manageable, mostly-stable set of named tenants with shared UI, this pattern removes almost all of the login tax from multi-tenant coverage without asking you to fork your test suite N ways.

## Where to Learn More Before You Build This Out

If you're deciding whether to invest the time to build a full per-tenant profile library, the [tutorials](https://browserbash.com/tutorials) and [learn](https://browserbash.com/learn) pages cover the general testmd and CI-wiring patterns this article builds on. The [case studies](https://browserbash.com/case-study) page has examples of teams running BrowserBash in CI at real scale, which is roughly what a many-tenant setup turns into once you're past the first handful of profiles. And if cost governance matters to your team once you're multiplying suite runs by tenant count, the [pricing page](https://browserbash.com/pricing) lays out what stays free (everything that runs on your own machine, including the CLI, both engines, the local dashboard, and the replay cache) versus what's part of the hosted tier.

## FAQ

### How many tenant auth profiles can I save with BrowserBash?

There's no built-in limit on the number of named profiles you can save with `browserbash auth save`. In practice, the pattern works best for a manageable, mostly-stable roster of tenants (flagship accounts, QA tenants, plan-tier representatives) rather than thousands of dynamically created ones, since each profile is saved by hand through an interactive login.

### Does BrowserBash support role-based testing within one tenant?

Yes. Since profiles are just named storageState captures, you can save more than one profile against the same tenant for different roles, for example `qa-admin` and `qa-viewer` pointed at the same login URL but logged in as different users. Run the same test file with each profile via `--auth` to check that permissions actually differ where they should.

### What happens if I run a test with the wrong tenant's auth profile?

BrowserBash checks whether the saved profile's origins cover the URL the test is about to hit. If they don't, it prints a warning instead of silently running against a mismatched session, which matters a lot in a multi-tenant setup where it's easy to typo a profile name.

### Can I run multi-tenant tests in CI without exposing tenant credentials?

Saved auth profiles capture session state, cookies and storage, not raw credentials, and BrowserBash's variable system masks secret-typed values in logs regardless. For CI, the practical pattern is to save profiles once from a trusted machine or a controlled login step, then persist that storageState securely for reuse rather than re-entering passwords on every CI run.

If you're maintaining more than one tenant login by hand, spinning up `browserbash auth save` per tenant and swapping `--auth` in `run-all` is a small change that removes a disproportionate amount of pain from multi-tenant coverage. Install it with `npm install -g browserbash-cli` (the package is [on npm](https://www.npmjs.com/package/browserbash-cli), and the source is [on GitHub](https://github.com/PramodDutta/browserbash) if you want to see how any of this works under the hood) and start with your first two tenants; the [sign-up page](https://browserbash.com/sign-up) is there if you want the optional cloud dashboard later, but nothing about this workflow requires an account.
