---
title: Running AI Browser Tests in Kubernetes Jobs
description: "Run browser tests in Kubernetes by packaging BrowserBash as a headless Job: model keys via Secret, --headless --agent, exit-code result, --record artifacts."
date: 2026-06-27
category: ci
---

To run browser tests in Kubernetes, you package BrowserBash into a headless container image, run it as a `Job` (not a long-lived `Deployment`), pass the model key or Ollama endpoint in through a `Secret` mounted as environment variables, invoke `browserbash run --headless --agent`, and let the container's exit code become the Job's result: 0 means the Job succeeded, anything non-zero means it failed and Kubernetes records that. Recorded `.webm` video and screenshots from `--record` get written to a mounted volume or pushed to object storage so the artifacts outlive the pod. That is the entire shape. The rest of this guide fills in each piece with concrete manifests and is honest about where it gets resource-hungry.

The reason this works cleanly is that a Kubernetes Job is, at heart, a process supervisor that cares about one thing: did the container exit zero or not. BrowserBash was built to answer exactly that question with disciplined exit codes, so the two fit together without glue code. You write an objective in plain English, an AI agent drives a real Chromium browser through it, and the verdict travels back to Kubernetes as a number. No selectors to maintain, no log scraping to decide pass or fail.

## Why a Job and not a Deployment

A `Deployment` is for processes that should run forever and restart whenever they stop. A browser test is the opposite: run once, reach a verdict, exit. Model a test as a Deployment and Kubernetes will dutifully restart it after every successful run, looping a passing test until you notice the bill.

A `Job` is the right primitive. It runs a pod to completion, respects the exit code, and supports `backoffLimit` (retries on failure), `activeDeadlineSeconds` (a hard wall-clock ceiling), and `ttlSecondsAfterFinished` (auto-cleanup of finished pods). For scheduled suites, a `CronJob` wraps a Job template on a cron schedule, which is how you get a nightly smoke run without an external scheduler.

The mental model: one Job equals one test objective (or one `*_test.md` file). For fifty tests, run fifty Jobs, or one indexed Job with `completions: 50` and `parallelism` tuned to your cluster. There is a dedicated walkthrough of [running 100 browser tests in parallel](https://browserbash.com/blog/run-100-browser-tests-in-parallel) if that is your end goal.

## What BrowserBash brings to a Job

BrowserBash is a free, open-source (Apache-2.0) natural-language browser automation and testing CLI from The Testing Academy. You install it with `npm install -g browserbash-cli`, hand the `browserbash` command an objective in English, and an AI agent drives a real Chromium browser step by step, then returns a verdict plus structured results. The full capability list lives on the [features page](https://browserbash.com/features).

Three things make it Job-friendly:

- `--headless` runs Chromium without a display, which is what you want inside a pod where there is no screen.
- `--agent` emits NDJSON (one JSON event per line) on stdout instead of human prose, so anything tailing the pod logs can parse progress and the final verdict deterministically.
- Exit codes are well defined and stable: `0` pass, `1` fail, `2` error, `3` timeout. Kubernetes reads exactly this.

The agent finds elements through the accessibility tree (roles, accessible names, states) plus the DOM, not CSS classes, and it handles iframes and Shadow DOM. It keeps no cached selector script between runs. The default `stagehand` engine (MIT, by Browserbase) observes the live DOM each step and decides the next action from what is rendered right then; the alternative `builtin` engine (an Anthropic tool-use loop) captures native Playwright traces and re-derives the selector on every action from a fresh snapshot. Either way, when a button label shifts from "Buy now" to "Purchase," the objective still holds and the Job still passes. That resilience is the reason to put an AI agent in front of your UI tests rather than a brittle locator suite.

## Building the container image

You need three things in the image: Node.js, a headless Chromium, and `ffmpeg` on the PATH if you want `--record` to produce `.webm` video. The Playwright base images already bundle Chromium and its system libraries, which saves a lot of dependency archaeology.

```dockerfile
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

# ffmpeg is what turns a session into a .webm video for --record
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g browserbash-cli

# Run as the non-root user the Playwright image already provides
USER pwuser
WORKDIR /work

ENTRYPOINT ["browserbash"]
```

Build and push it to whatever registry your cluster pulls from:

```bash
docker build -t registry.example.com/browserbash-runner:1.3.1 .
docker push registry.example.com/browserbash-runner:1.3.1
```

Pin a tag (here `1.3.1`), not `latest`. A Job that pulls `latest` is a Job whose behavior can change under you between runs, and reproducibility is the entire point of containerizing tests. If you want the broader rationale for sealing the browser inside an image, the [dockerized AI browser tests](https://browserbash.com/blog/dockerized-ai-browser-tests) guide goes deeper on pinning and CDP.

## Passing the model key or Ollama endpoint via Secret

BrowserBash needs a model to think with. By default the model resolves to `auto`, which checks for a local Ollama first, then `ANTHROPIC_API_KEY`, then `OPENROUTER_API_KEY` (free hosted models exist on OpenRouter). In a Kubernetes pod there is usually no Ollama sidecar, so you are typically feeding it a hosted key, an in-cluster Ollama service URL, or both.

Never bake a key into the image or paste it into the Job manifest as plaintext. Put it in a `Secret`:

```bash
kubectl create secret generic browserbash-model \
  --from-literal=ANTHROPIC_API_KEY="sk-ant-..." \
  --namespace=ci
```

Then surface it into the container as environment variables with `secretKeyRef`. If instead you run an Ollama Deployment inside the cluster, you do not need a Secret for it at all: you point the runner at the in-cluster service DNS name, for example `http://ollama.ci.svc.cluster.local:11434`, via the env var BrowserBash reads for the Ollama host. Local inference means nothing leaves the cluster, which is the privacy win some teams require.

Note one important separation: the model key is a different secret from any application credentials the test itself needs (a login password, an API token the site expects). Those belong in your `*_test.md` as `{{variables}}`, and BrowserBash masks them in logs. Keep them in their own Secret and inject them as their own env vars so the masking and the model auth stay independent.

## A complete Job manifest

Here is a single Job that runs one objective headless, in CI agent mode, with the model key pulled from a Secret. This is a sketch you adapt, not a copy-paste-to-prod artifact.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: checkout-smoke
  namespace: ci
spec:
  backoffLimit: 1            # one retry, then accept failure
  activeDeadlineSeconds: 600 # hard 10-min wall clock ceiling
  ttlSecondsAfterFinished: 3600
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: browserbash
          image: registry.example.com/browserbash-runner:1.3.1
          args:
            - run
            - "Go to the staging shop, add a laptop to the cart, check out as guest, confirm the order succeeded"
            - "--headless"
            - "--agent"
            - "--record"
          env:
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: browserbash-model
                  key: ANTHROPIC_API_KEY
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
            limits:
              cpu: "2"
              memory: "4Gi"
          volumeMounts:
            - name: artifacts
              mountPath: /work
      volumes:
        - name: artifacts
          emptyDir: {}
```

A few deliberate choices in that manifest:

- `restartPolicy: Never` with `backoffLimit: 1`: if the container exits non-zero, retry at most once, then mark the Job failed. An AI agent test has a small probabilistic flake rate, so one retry is reasonable; a `backoffLimit` of ten would mask real failures behind brute-force retries.
- `activeDeadlineSeconds: 600` is your safety net against a hung run. BrowserBash already enforces a 15-second auto-wait ceiling on late-appearing elements through Playwright's built-in auto-wait (no manual sleeps anywhere), but the Job-level deadline guards against a whole run wedging for reasons outside the agent's control, like a staging environment that never finishes loading.
- The `resources` block is not decorative: a real Chromium plus an agent loop wants real memory. The numbers above are illustrative starting points, not measured guarantees; tune them against your own runs.

Apply and watch it:

```bash
kubectl apply -f checkout-smoke.yaml
kubectl wait --for=condition=complete job/checkout-smoke -n ci --timeout=11m
kubectl logs job/checkout-smoke -n ci
```

## Reading the exit code as the Job result

This is the part that makes the whole approach feel native to Kubernetes. You do not parse English to decide pass or fail. The container exits with a code, Kubernetes records it, and the Job's status reflects it.

When `restartPolicy: Never`, a container that exits `0` makes the Job succeed; a non-zero exit (after `backoffLimit` is exhausted) makes the Job fail with reason `BackoffLimitExceeded` or `DeadlineExceeded`. The BrowserBash code-to-meaning map is:

| Exit code | Meaning | Job outcome |
|---|---|---|
| 0 | Test passed | Job succeeds |
| 1 | Test failed (assertion or objective not met) | Job fails |
| 2 | Error (bad config, crash, unreachable model) | Job fails |
| 3 | Timeout | Job fails |

To turn that into a scriptable verdict from outside the cluster, query the Job's status:

```bash
SUCCEEDED=$(kubectl get job checkout-smoke -n ci -o jsonpath='{.status.succeeded}')
if [ "$SUCCEEDED" = "1" ]; then
  echo "Smoke test passed"
else
  echo "Smoke test failed"; exit 1
fi
```

If you want the granular code (to distinguish a real `1` failure from a `2` config error or a `3` timeout), read it from the terminated container state:

```bash
kubectl get pod -n ci -l job-name=checkout-smoke \
  -o jsonpath='{.items[0].status.containerStatuses[0].state.terminated.exitCode}'
```

A `2` usually means the pod could not reach the model or the manifest is misconfigured, which is an infra problem to fix, not a flaky test to retry. A `3` means the agent ran out of time, which often points at an environment that is too slow rather than a broken feature. Separating these in your alerting saves you from chasing product bugs that are actually cluster bugs. The same exit-code discipline underpins any CI integration; the [headless CLI browser tests in CI](https://browserbash.com/blog/headless-cli-browser-tests-in-ci) guide covers the generic wiring if you are mixing Kubernetes with another runner.

## Running a *_test.md file instead of an inline objective

For anything beyond a one-liner, put the test in a Markdown file. BrowserBash `*_test.md` files are intent, not selectors: a `#` title, `-` or `1.` numbered steps, `@import` for composition (so a shared `login_test.md` is reused across suites), and `{{variables}}` with secret masking in logs.

```markdown
# Checkout smoke

@import ./login_test.md

1. From the dashboard, open the shop
2. Add a laptop to the cart
3. Proceed to checkout as a guest
4. Enter shipping details and place the order
5. Confirm an order number is shown
```

Ship the file into the image, or mount it from a `ConfigMap` so you can change the test without rebuilding the container. Mounting from a ConfigMap is the nicer pattern for test content that changes more often than the runner:

```bash
kubectl create configmap checkout-test \
  --from-file=checkout_test.md \
  --from-file=login_test.md \
  -n ci
```

Then in the Job, mount the ConfigMap and run the file:

```yaml
          args: ["testmd", "run", "/tests/checkout_test.md",
                 "--headless", "--agent", "--record"]
          volumeMounts:
            - name: tests
              mountPath: /tests
            - name: artifacts
              mountPath: /work
      volumes:
        - name: tests
          configMap:
            name: checkout-test
        - name: artifacts
          emptyDir: {}
```

Pass any login credentials the test references as `{{variables}}` through env vars sourced from a separate Secret, and they stay masked in the NDJSON and the logs.

## Collecting --record artifacts

`emptyDir` works for a quick look while the pod is alive, but it is deleted the instant the pod is gone, which for a Job that finishes and gets TTL-reaped is almost immediately. If you want the `.webm` video, the screenshots, and the per-run `Result.md` to survive, write them somewhere durable.

Two patterns, depending on what your cluster offers.

**A PersistentVolumeClaim.** Mount a PVC at the working directory so `--record` artifacts land on durable storage you can browse later. Good when you already run a shared filesystem in-cluster.

```yaml
      volumes:
        - name: artifacts
          persistentVolumeClaim:
            claimName: browserbash-artifacts
```

**Object storage via a sidecar or post-run upload.** The more portable pattern: write to an `emptyDir`, then upload to S3, GCS, or any bucket before the pod exits. A small command-wrapper does it without a sidecar:

```yaml
          command: ["/bin/sh", "-c"]
          args:
            - |
              browserbash testmd run /tests/checkout_test.md \
                --headless --agent --record ; CODE=$?
              aws s3 cp /work s3://my-ci-artifacts/checkout/$(date +%s)/ \
                --recursive --exclude "*" --include "*.webm" \
                --include "*.png" --include "Result.md"
              exit $CODE
```

Capturing `$?` immediately after the run and re-exiting with it at the end is the load-bearing detail: the upload step must not swallow the test's exit code, or Kubernetes will think a failed test passed because the `aws s3 cp` succeeded. Preserve the verdict, then upload, then exit with the verdict.

There is also an opt-in cloud option. BrowserBash supports `--upload` to push results to a hosted dashboard (free runs are kept 15 days), and `browserbash dashboard` serves a local dashboard. In a Job, `--upload` is the lowest-effort way to get artifacts off the pod without provisioning storage yourself, as long as you are comfortable with the opt-in upload.

## Choosing a provider and a model honestly

BrowserBash supports `--provider local|cdp|browserbase|lambdatest|browserstack`. Inside a Job the natural default is the bundled local Chromium (the image you built). If you would rather not run a browser in the pod, point `--provider cdp` at a Chromium container elsewhere, or use `browserbase`, `lambdatest`, or `browserstack` to offload the browser to a grid and keep the pod thin.

The model choice is where honesty matters most. Small local models (roughly 8B parameters and under) are flaky on long multi-step flows: a six-step checkout is exactly the kind of objective a tiny model loses the plot on halfway through. For anything hard, use a 70B-class local model (Qwen3, Llama 3.3) or a capable hosted model. Running a 70B model in-cluster means a GPU node and real memory, a meaningful resource commitment. If your cluster has no GPUs, the pragmatic path is a hosted key via `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` and a thin CPU-only pod. Pick the trade deliberately. The [learn hub](https://browserbash.com/learn) collects the deeper model and reliability material.

## Honest limits

Putting AI browser tests in Kubernetes Jobs is a good fit, but it is not free of sharp edges, and pretending otherwise helps no one.

**Resource hunger is real.** A headless Chromium plus an agent loop is heavier than a typical unit-test pod. Add a 70B local model and you are firmly in GPU-node territory with multi-gigabyte memory requests. If your cluster is sized for stateless microservices, capable test runs may evict other workloads or get OOM-killed. Budget the nodes before you scale the suite.

**The agent has a probabilistic flake rate.** Because it re-derives actions from live state each run rather than replaying a fixed script, the same objective can occasionally take a different path or misread an ambiguous screen. That is usually a feature (it is why a renamed button does not break the test), but it means a single Job failure is not always a real regression. Design for it: one retry via `backoffLimit`, and treat a clean re-run as a flake, not a pass-by-luck. Do not crank `backoffLimit` high to hide a genuinely failing test.

**Exit code 2 versus 1 needs operator attention.** Kubernetes flattens both into "Job failed." If you do not read the granular container exit code, you will conflate a misconfigured Secret (a `2`) with a real product bug (a `1`) and waste an afternoon. The signal is there; you have to wire the alerting to look at it.

**BrowserBash emits the signal; it does not post to your tools.** The NDJSON, the exit codes, the `Result.md`, and the `--record` artifacts are produced by the run. Forwarding a failure to Slack, opening a Jira ticket, or annotating a GitHub check is integration you build alongside the Job (a follow-on step that reads the verdict and calls the API). BrowserBash does not natively post to Slack, Jira, or any external service, and you should plan for that wiring rather than expect it for free.

**Networking and timeouts.** If your model is hosted, the pod needs egress to that endpoint, which a locked-down `NetworkPolicy` can silently block (surfacing as exit `2`). And while BrowserBash auto-waits up to 15 seconds for late elements, a staging environment that is genuinely slow under cluster load can push individual steps past that ceiling. The [headless and timeouts tutorial](https://browserbash.com/blog/browserbash-headless-and-timeouts-tutorial) digs into the timeout behavior if your Jobs are tripping the deadline.

## FAQ

### How does a Kubernetes Job know if my browser test passed?

Through the container exit code. BrowserBash exits `0` on pass, `1` on a failed objective, `2` on error, and `3` on timeout. With `restartPolicy: Never`, an exit of `0` marks the Job succeeded and any non-zero exit (after `backoffLimit` retries) marks it failed. You read `kubectl get job <name> -o jsonpath='{.status.succeeded}'` for the binary verdict, or the terminated container's `exitCode` field for the granular code. No log parsing is needed to decide pass or fail.

### How do I pass my model API key to the Job securely?

Create a `Secret` (`kubectl create secret generic browserbash-model --from-literal=ANTHROPIC_API_KEY=...`) and reference it in the container's `env` with `secretKeyRef`. Never put the key in the image or as plaintext in the manifest. If you run Ollama inside the cluster instead, skip the key entirely and point the runner at the in-cluster service URL such as `http://ollama.ci.svc.cluster.local:11434`, so inference stays local and nothing leaves the cluster. Keep application login credentials in a separate Secret and pass them as `{{variables}}`, which BrowserBash masks in logs.

### Where do the recorded video and screenshots go after the pod exits?

By default `--record` writes the `.webm` video, screenshots, and a per-run `Result.md` to the working directory, which is gone once the pod is reaped if it is an `emptyDir`. To keep them, mount a PersistentVolumeClaim at the working directory, or run a post-test upload step that copies the files to S3, GCS, or another bucket before the container exits. Capture the test's exit code before uploading and re-exit with it, so the upload step does not mask a failed test. The opt-in `--upload` flag is the no-storage shortcut, keeping free runs for 15 days on the hosted dashboard.

### Should I use a Job, a CronJob, or a Deployment?

A `Job` for a one-off or on-demand test run, because it runs to completion and respects the exit code. A `CronJob` for scheduled suites (a nightly smoke run), since it wraps a Job template on a cron schedule with no external scheduler. Never a `Deployment`: it is built to keep a process alive and will restart your test after every successful run, looping a passing test indefinitely. For large fan-out, an indexed Job with `completions` and `parallelism` runs many tests under one object.

## Wrapping up

The Kubernetes-and-BrowserBash fit comes down to one alignment: a Job exists to run a process to completion and care about its exit code, and BrowserBash exists to run a browser test and return a disciplined exit code. Package the runner in a pinned image, feed the model key through a Secret (or point at in-cluster Ollama), run `--headless --agent`, read the exit code as the verdict, and route `--record` artifacts to durable storage. Be honest about the resource bill for capable models and about the probabilistic flake you trade for selector resilience, wire the failure-to-Slack-or-Jira step yourself, and you have AI browser tests running as first-class Kubernetes workloads.
