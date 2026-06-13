import { Bo } from '@/components/Bo';
import { HeroScene } from '@/components/HeroScene';
import { TryIt } from '@/components/TryIt';
import { CopyButton } from '@/components/CopyButton';
import { Reveal } from '@/components/Reveal';
import { Terminal, type DemoRecording } from '@/components/Terminal';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import './landing.css';

const INSTALL = 'npm install -g browserbash-cli';

async function heroDemo(): Promise<DemoRecording> {
    const raw = await fs.readFile(path.join(process.cwd(), 'public/demos/hn.json'), 'utf8');
    return JSON.parse(raw) as DemoRecording;
}

export default async function Page() {
    const demo = await heroDemo();

    return (
        <>
            <nav className="nav container">
                <a href="#top" className="nav__brand">
                    <Bo size={26} interactive={false} pose="idle" />
                    <span>BrowserBash</span>
                </a>
                <div className="nav__links">
                    <a href="#demo">Demo</a>
                    <a href="#how">How it works</a>
                    <a href="#features">Features</a>
                    <a href="#start">Quick start</a>
                    <a href="/learn">Learn</a>
                    <a href="/blog">Blog</a>
                </div>
                <div className="nav__auth">
                    <a className="pixel-btn ghost nav__login" href="/sign-in">Log in</a>
                    <a className="pixel-btn nav__signup" href="/sign-up">Sign up free</a>
                </div>
            </nav>

            <main>
            <header className="hero container" id="top">
                <div className="hero__copy">
                    <p className="section-tag">free · open source · apache-2.0</p>
                    <h1>
                        Plain English in.<br />
                        <span className="hero__accent">Real browser</span> out.
                    </h1>
                    <p className="hero__sub">
                        BrowserBash is a <strong>free, open-source</strong> natural-language browser automation
                        CLI — an AI agent drives a real browser from a plain-English objective. Runs on{' '}
                        <strong>free local models (Ollama) or free OpenRouter models — zero API keys, no credit card</strong>.
                        Bring an Anthropic or OpenRouter key only if you want to.
                    </p>
                    <div className="hero__install pixel-card">
                        <code>$ {INSTALL}</code>
                        <CopyButton text={INSTALL} />
                    </div>
                    <div className="hero__cta">
                        <a className="pixel-btn hero__cta-go" href="/sign-up">Create your free account →</a>
                        <a className="pixel-btn ghost" href="#start">3-step quick start</a>
                    </div>
                    <p className="hero__cta-note">
                        100% free to use. Install the CLI and automate in seconds — no signup needed to run.
                        Create a free account for the dashboard: run history, video recordings and per-run replay.
                    </p>
                </div>
                <HeroScene />
            </header>

            <section className="section container" id="demo">
                <Reveal>
                    <p className="section-tag">demo</p>
                    <h2>Watch a run, line by line</h2>
                    <p className="section__sub">
                        One objective in, NDJSON events out — the same stream your CI and AI agents consume.
                    </p>
                </Reveal>
                <Reveal delay={120}>
                    <Terminal demo={demo} autoplay />
                </Reveal>
            </section>

            <section className="section container" id="try">
                <Reveal>
                    <p className="section-tag">try it</p>
                    <h2>Pick an objective, watch Bo work</h2>
                    <p className="section__sub">
                        Replays of real CLI output. Copy any command and run it on your machine — that&apos;s the whole product.
                    </p>
                </Reveal>
                <Reveal delay={120}>
                    <TryIt />
                </Reveal>
            </section>

            <section className="section container" id="how">
                <Reveal>
                    <p className="section-tag">how it works</p>
                    <h2>Three layers, all swappable</h2>
                </Reveal>
                <div className="how">
                    <Reveal className="how__col" delay={0}>
                        <div className="pixel-card how__card">
                            <h3>1 · Provider</h3>
                            <p className="how__q">Where does the browser run?</p>
                            <ul>
                                <li><code>local</code> — your Chrome (default)</li>
                                <li><code>cdp</code> — any DevTools endpoint</li>
                                <li><code>browserbase</code> — cloud browsers</li>
                                <li><code>lambdatest</code> — TestMu grid</li>
                                <li><code>browserstack</code> — Automate grid</li>
                            </ul>
                        </div>
                    </Reveal>
                    <Reveal className="how__col" delay={120}>
                        <div className="pixel-card how__card">
                            <h3>2 · Engine</h3>
                            <p className="how__q">Who interprets the English?</p>
                            <ul>
                                <li><code>stagehand</code> — MIT OSS by Browserbase (default)</li>
                                <li><code>builtin</code> — Anthropic tool-use loop, auto-selected for cloud grids</li>
                            </ul>
                        </div>
                    </Reveal>
                    <Reveal className="how__col" delay={240}>
                        <div className="pixel-card how__card">
                            <h3>3 · LLM</h3>
                            <p className="how__q">Who does the thinking?</p>
                            <ul>
                                <li><strong>Ollama first</strong> — local, free, no keys</li>
                                <li>Anthropic / OpenAI / Google via flags</li>
                                <li>Any OpenAI-compatible server (vLLM, LM Studio)</li>
                            </ul>
                        </div>
                    </Reveal>
                </div>
                <Reveal delay={160}>
                    <div className="freestack pixel-card">
                        <Bo size={56} interactive={false} />
                        <div>
                            <strong>The fully-free stack is the default.</strong>
                            <code>ollama pull qwen3 &amp;&amp; browserbash run &quot;…&quot;</code>
                            <span>Stagehand (MIT) + local Chromium + Ollama — zero cloud cost, no API keys.</span>
                        </div>
                    </div>
                </Reveal>
            </section>

            <section className="section container" id="features">
                <Reveal>
                    <p className="section-tag">features</p>
                    <h2>Built for agents and CI, friendly to humans</h2>
                </Reveal>
                <div className="features">
                    {[
                        ['Open source first', 'Apache-2.0 CLI on an MIT engine. The default path costs nothing and phones no one.'],
                        ['--agent NDJSON mode', 'One JSON event per line on stdout. Exit codes 0/1/2/3 are the verdict — no prose parsing.'],
                        ['Markdown tests', 'Committable *_test.md files with @import composition. Result.md written after every run.'],
                        ['5 providers, one flag', 'Same objective runs on local Chrome or a cloud grid with --provider. Adding a vendor is one file.'],
                        ['Secrets stay secret', 'Variables marked secret are masked as ***** in every log line, remark and summary.'],
                        ['CI-ready verdicts', 'GitHub Actions recipe included. The process exit code is the test result.'],
                    ].map(([title, body], i) => (
                        <Reveal key={title} delay={(i % 3) * 100}>
                            <div className="pixel-card feature">
                                <h3>{title}</h3>
                                <p>{body}</p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </section>

            <section className="section container" id="why">
                <Reveal>
                    <p className="section-tag">why browserbash</p>
                    <h2>No account. No meter. No lock-in.</h2>
                    <p className="section__sub">
                        Other AI browser tools want a signup, a credit balance, or their cloud. BrowserBash wants an objective.
                    </p>
                </Reveal>
                <div className="features">
                    {[
                        ['Zero signup to run', 'npm install and automate in sixty seconds — no account needed for the CLI. A free dashboard account is optional, for run history and recordings.'],
                        ['Open source all the way down', 'Apache-2.0 with the full agent loop in the repo. Read it, fork it, fix it — not just the README.'],
                        ['Your models, your machine', 'Local Ollama by default — free, private, unmetered. Or bring an Anthropic or OpenRouter key and swap models with one flag.'],
                        ['Cloud-neutral by design', 'Browserbase, LambdaTest, BrowserStack or your own Chrome. Use the grid your team already pays for.'],
                        ['Private by default', 'Runs never leave your machine unless you add --upload. Nothing phones home on its own.'],
                        ['Built for CI, not demos', 'Natural-language E2E test automation with exit codes your pipeline already understands.'],
                    ].map(([title, body], i) => (
                        <Reveal key={title} delay={(i % 3) * 100}>
                            <div className="pixel-card feature">
                                <h3>{title}</h3>
                                <p>{body}</p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </section>

            <section className="section container" id="start">
                <Reveal>
                    <p className="section-tag">quick start</p>
                    <h2>From zero to your first run in 3 steps</h2>
                    <p className="section__sub">All free. No credit card, no paid API keys.</p>
                </Reveal>
                <div className="steps">
                    <Reveal className="step" delay={0}>
                        <div className="pixel-card step__card">
                            <span className="step__n">1</span>
                            <h3>Install the CLI</h3>
                            <p>One line from npm. Free and open source.</p>
                            <pre>{INSTALL}</pre>
                        </div>
                    </Reveal>
                    <Reveal className="step" delay={120}>
                        <div className="pixel-card step__card">
                            <span className="step__n">2</span>
                            <h3>Run with a free model</h3>
                            <p>Local Ollama or a free OpenRouter model — no keys.</p>
                            <pre>{`ollama pull qwen3
browserbash run "Open example.com and store the heading as 'h1'"`}</pre>
                        </div>
                    </Reveal>
                    <Reveal className="step" delay={240}>
                        <div className="pixel-card step__card">
                            <span className="step__n">3</span>
                            <h3>Create a free account</h3>
                            <p>Connect once, then see every run, recording and replay on your dashboard.</p>
                            <pre>{`browserbash connect --key bb_...
browserbash run "..." --record --upload`}</pre>
                            <a className="pixel-btn step__cta" href="/sign-up">Create free account →</a>
                        </div>
                    </Reveal>
                </div>
            </section>

            </main>

            <footer className="footer">
                <div className="container footer__in">
                    <div className="footer__brand">
                        <Bo size={32} interactive={false} />
                        <span>BrowserBash</span>
                    </div>
                    <div className="footer__links">
                        <a href="/learn">Learn</a>
                        <a href="/blog">Blog</a>
                        <a href="/sign-up">Sign up</a>
                        <a href="/dashboard">Dashboard</a>
                        <a href="https://www.npmjs.com/package/browserbash-cli" target="_blank" rel="noopener noreferrer">npm</a>
                    </div>
                    <p className="footer__credit">Built by The Testing Academy · Apache-2.0</p>
                </div>
            </footer>
        </>
    );
}
