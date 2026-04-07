import Image from 'next/image';
import { siGithub } from 'simple-icons';

import strappingLogoDark from '../../src/assets/branding/strappingai-logo-dark.png';
import heroProjectLibraryImage from '../../src/assets/screenshots/hero-project-library.png';
import mcpInstallationImage from '../../src/assets/screenshots/mcp-installation.png';
import workflowSceneImage from '../../src/assets/screenshots/workflow-scene.png';
import { BrandIcon } from './brand-icon';
import { siteConfig } from '../../lib/site-config';
import { LinkButton } from './link-button';
import { MarketingLink } from './marketing-link';
import { SectionHeading } from './section-heading';

const navigationItems = [
  { href: '#why', label: 'Why' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#mcp', label: 'MCP' },
  { href: '#trust', label: 'Trust' },
  { href: '#faq', label: 'FAQ' },
  { href: '#download', label: 'Download' },
] as const;

const proofPoints = [
  'Bootstrap screens fast',
  'Desktop + MCP parity',
  'Scene-first structure',
  'Local projects',
  'Deterministic edits',
] as const;

const valueCards = [
  {
    body: 'Start with a structured first pass instead of a blank page. Rough in scenes, layout blocks, copy, and system primitives quickly, then refine from a visible direction.',
    title: 'Fast First Pass',
  },
  {
    body: 'The editor UI and the local MCP bridge use the same document schema, command system, and semantic logic. Agent edits do not disappear into a second automation layer.',
    title: 'One Runtime',
  },
  {
    body: 'Scenes, variables, styles, bindings, and provenance give the model something better than pixels alone, so bootstrap edits stay inspectable and usable.',
    title: 'Structured Mockups',
  },
] as const;

const workflowSteps = [
  {
    body: 'Create or open a local project in the desktop app and establish the workspace you want to push forward.',
    title: 'Open a local workspace',
  },
  {
    body: 'Connect Claude, Codex, or Gemini through the local MCP endpoint and generate first-pass structure, copy, and layout against the same active project session.',
    title: 'Bootstrap with an agent',
  },
  {
    body: 'Use the canvas, layers, and inspector to tighten what the agent started without exporting, translating, or losing state across tools.',
    title: 'Refine in the canvas',
  },
] as const;

const mcpTools = [
  'list_projects',
  'create_project',
  'open_project',
  'inspect_project',
  'inspect_tree',
  'inspect_node',
  'inspect_scenes',
  'inspect_design_system',
  'apply_commands',
] as const;

const trustPoints = [
  'Projects, metadata, and assets stay local.',
  'No mandatory backend or account setup.',
  'Core editing workflows are offline-capable.',
  'MCP is localhost-only and user-visible.',
  'UI and MCP share one document model.',
  'Write boundaries stay explicit and deterministic.',
] as const;

const excludedScope = [
  'Not a browser-first editor',
  'Not cloud collaboration',
  'Not realtime multi-user',
  'Not multi-document per project in v1',
] as const;

const faqItems = [
  {
    answer:
      'Strapping AI Canvas is built as a standalone Electron app so the editor, local persistence, and MCP runtime can share one local-first document model without a mandatory backend.',
    question: 'Why desktop instead of browser-first?',
  },
  {
    answer:
      'It means getting from a blank canvas to a credible visual direction quickly: scenes, layout blocks, headline copy, and reusable system primitives before detailed polish.',
    question: 'What does bootstrapping visual design mean here?',
  },
  {
    answer:
      'No. Core editing workflows are designed to work locally without a running server or cloud control plane.',
    question: 'Does Strapping AI Canvas require the cloud?',
  },
  {
    answer:
      'Closing the editor window does not quit the app. The app stays resident in the tray, and MCP inspection remains available against the active project session.',
    question: 'What happens when the editor window closes?',
  },
  {
    answer:
      'Yes. Inspection remains available after the window closes until the user explicitly quits the tray app.',
    question: 'Can agents still inspect projects after close?',
  },
  {
    answer:
      'No. In v1, mutations fail fast with measurement_surface_unavailable when the editor window is closed because the browser-backed measurement surface is unavailable.',
    question: 'Can agents mutate while the window is closed?',
  },
  {
    answer:
      'No. In v1, each project contains exactly one document. Project targeting is the primary MCP target surface.',
    question: 'Does a project contain multiple documents?',
  },
] as const;

const commandSnippet = `endpoint: http://localhost:9311/mcp

tool: inspect_project
tool: apply_commands

commands:
  - create_scene id=scene_launch
  - create_node id=rect_shell kind=rectangle
  - create_node id=text_headline kind=text
  - inspect_scenes

mode: read_write`;

const treeRows = [
  'project: launchpad',
  'document: current_document_json',
  'scene: scene_launch',
  'frame: scene_launch',
  'rectangle: rect_shell',
  'text: text_headline',
  'style: hero_surface',
  'variable: color.neutral.950',
] as const;

const designSystemRows = [
  'variables: color.neutral.950, type.display.lg',
  'styles: hero_surface, body_copy',
  'bindings: text_headline -> hero_copy',
  'provenance: command batch / revision 12',
] as const;

export function MarketingHomePage() {
  const githubIcon = (
    <BrandIcon
      aria-hidden="true"
      className="button-icon"
      icon={siGithub}
      title="GitHub"
    />
  );

  return (
    <div className="site-shell">
      <div aria-hidden="true" className="site-background" />

      <header className="site-header">
        <a className="brand-lockup" href="#top">
          <Image
            alt=""
            aria-hidden="true"
            className="brand-mark-image"
            priority
            src={strappingLogoDark}
          />
          <span className="brand-text">
            <strong>strapping.ai</strong>
            <span>AI Canvas</span>
          </span>
        </a>

        <nav aria-label="Section navigation" className="site-nav">
          {navigationItems.map((item) => (
            <a href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <LinkButton
            href={siteConfig.githubUrl}
            kind="ghost"
            label="GitHub"
            leadingVisual={githubIcon}
          />
          <LinkButton
            href={siteConfig.downloadPath}
            kind="primary"
            label="Download Desktop"
          />
        </div>
      </header>

      <main>
        <section className="hero section" id="top">
          <div className="hero-copy">
            <span className="section-eyebrow">
              Bootstrap visual design with desktop + MCP
            </span>
            <h1>Bootstrap visual design fast.</h1>
            <p className="hero-body">
              Strapping AI Canvas is the fastest way to go from a blank surface
              to a structured visual direction. Open the desktop app, point an
              MCP client at the same project, and rough in scenes, layout, and
              copy before polishing by hand.
            </p>

            <div className="hero-actions">
              <LinkButton
                href={siteConfig.downloadPath}
                kind="primary"
                label="Download Desktop"
              />
              <LinkButton
                href={siteConfig.docsPath}
                kind="secondary"
                label="Read the Docs"
              />
            </div>

            <p className="hero-note">
              Fast first pass, local runtime, explicit boundaries, one shared
              document core.
            </p>
          </div>

          <div className="hero-visual">
            <article className="hero-panel hero-panel-canvas">
              <div className="panel-chrome">
                <span>project library</span>
                <span className="ui-mono">active project: launchpad</span>
              </div>
              <div className="panel-media-frame">
                <Image
                  alt="Strapping AI Canvas Desktop project library with MCP status and installation guidance"
                  className="panel-image"
                  placeholder="blur"
                  priority
                  sizes="(min-width: 1180px) 640px, (min-width: 900px) calc(100vw - 32px), 100vw"
                  src={heroProjectLibraryImage}
                />
              </div>
            </article>

            <article className="hero-panel hero-panel-terminal">
              <div className="panel-chrome">
                <span>mcp session</span>
                <span className="ui-mono">127.0.0.1</span>
              </div>
              <pre className="code-panel">{commandSnippet}</pre>
            </article>
          </div>
        </section>

        <section
          aria-label="Product proof points"
          className="proof-strip section"
        >
          {proofPoints.map((point) => (
            <div className="proof-pill" key={point}>
              {point}
            </div>
          ))}
        </section>

        <section className="section" id="why">
          <SectionHeading
            body="Strapping AI Canvas is built for the messy first pass: not final polish, but getting a usable visual direction into view quickly. Speed comes from one local project model shared by the desktop UI and MCP clients."
            eyebrow="Why Strapping"
            title="The quickest path from blank canvas to structured direction."
          />

          <div className="value-grid">
            {valueCards.map((card) => (
              <article className="value-card" key={card.title}>
                <span className="card-index ui-mono">
                  {card.title.slice(0, 2).toUpperCase()}
                </span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section workflow-section" id="workflow">
          <SectionHeading
            body="The loop is short: open a local project, connect MCP, generate a structured first pass, and refine the same live result in the editor."
            eyebrow="Workflow"
            title="Open locally. Strap in an agent. Tighten in the same canvas."
          />

          <div className="workflow-layout">
            <div className="workflow-steps">
              {workflowSteps.map((step, index) => (
                <article className="workflow-step" key={step.title}>
                  <span className="step-number ui-mono">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </article>
              ))}

              <div className="inline-cta">
                <LinkButton
                  href={siteConfig.downloadPath}
                  kind="primary"
                  label="Download Desktop and Bootstrap a Project"
                />
              </div>
            </div>

            <div className="workflow-proof">
              <article className="info-card screenshot-card screenshot-card-workflow">
                <div className="panel-chrome">
                  <span>workflow scene</span>
                  <span className="ui-mono">canvas + layers + inspector</span>
                </div>
                <div className="panel-media-frame panel-media-frame-shot">
                  <Image
                    alt="Strapping AI Canvas document workspace showing a multi-screen flow with the layers panel on the left and the inspector on the right"
                    className="panel-image panel-image-workflow"
                    placeholder="blur"
                    sizes="(min-width: 1180px) 556px, (min-width: 900px) calc(100vw - 32px), 100vw"
                    src={workflowSceneImage}
                  />
                </div>
                <p className="card-footnote">
                  One workspace carries the whole loop: bootstrap the structure
                  fast, inspect the result, and keep tightening in the same
                  scene-first editor.
                </p>
              </article>

              <article className="info-card info-card-contrast">
                <div className="stat-row">
                  <span className="stat-label">speed lever</span>
                  <strong>One active project session</strong>
                </div>
                <div className="stat-row">
                  <span className="stat-label">best fit</span>
                  <strong>First-pass screens and system scaffolds</strong>
                </div>
                <div className="stat-row">
                  <span className="stat-label">shared path</span>
                  <strong>UI, MCP, undo/redo, autosave</strong>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="section mcp-section" id="mcp">
          <SectionHeading
            body="Strapping AI Canvas exposes a local MCP surface over the same command/query/document core the desktop editor uses. That is why the bootstrap pass stays fast, inspectable, and close to the real product state."
            eyebrow="MCP"
            title="The speed story is one runtime, not automation glue."
          />

          <div className="mcp-layout">
            <article className="info-card info-card-wide">
              <div className="panel-chrome">
                <span>available tools</span>
                <span className="ui-mono">first pass</span>
              </div>
              <div className="tool-grid">
                {mcpTools.map((tool) => (
                  <div className="tool-pill ui-mono" key={tool}>
                    {tool}
                  </div>
                ))}
              </div>
            </article>

            <article className="info-card">
              <div className="panel-chrome">
                <span>installation</span>
                <span className="ui-mono">endpoint + client buttons</span>
              </div>
              <div className="panel-media-frame panel-media-frame-shot panel-media-frame-mcp">
                <Image
                  alt="Strapping AI Canvas MCP installation panel showing the localhost endpoint and setup buttons for Claude, Codex, and Gemini"
                  className="panel-image panel-image-mcp"
                  placeholder="blur"
                  sizes="(min-width: 1180px) 420px, (min-width: 900px) calc(50vw - 32px), 100vw"
                  src={mcpInstallationImage}
                />
              </div>
              <p className="card-footnote">
                Use the full localhost endpoint, including the <span>/mcp</span>{' '}
                path, and keep the editor window open for write-capable actions.
              </p>
            </article>

            <article className="info-card">
              <div className="panel-chrome">
                <span>runtime modes</span>
                <span className="ui-mono">capability boundary</span>
              </div>
              <div className="mode-grid">
                <div className="mode-card">
                  <span className="mode-label ui-mono">read_write</span>
                  <p>
                    Available while the editor window is open and the
                    measurement surface exists.
                  </p>
                </div>
                <div className="mode-card">
                  <span className="mode-label ui-mono">read_only</span>
                  <p>
                    Inspection remains available after close. Mutation fails
                    fast with
                    <span className="ui-mono">
                      {' '}
                      measurement_surface_unavailable
                    </span>
                    .
                  </p>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="section trust-section" id="trust">
          <SectionHeading
            body="Fast only works if the product boundary stays obvious. This is a local-first desktop tool with a visible runtime contract, and the marketing story should match that contract."
            eyebrow="Trust"
            title="Speed without ambiguity beats vague AI promises."
          />

          <div className="trust-layout">
            <div className="trust-grid">
              {trustPoints.map((point) => (
                <article className="trust-card" key={point}>
                  <p>{point}</p>
                </article>
              ))}
            </div>

            <article className="scope-card">
              <span className="section-eyebrow">Current exclusions</span>
              <div className="chip-row">
                {excludedScope.map((item) => (
                  <span className="scope-chip" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="section systems-section">
          <SectionHeading
            body="Scenes, variables, styles, bindings, and provenance are first-class project data. That gives both the editor and an agent a stable surface for inspection and mutation."
            eyebrow="Scene-first structure"
            title="Structured design data gives the model something solid to build on."
          />

          <div className="systems-layout">
            <article className="system-card">
              <div className="panel-chrome">
                <span>document tree</span>
                <span className="ui-mono">scene-first</span>
              </div>
              <ul className="tree-list">
                {treeRows.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            </article>

            <article className="system-card">
              <div className="panel-chrome">
                <span>design system</span>
                <span className="ui-mono">variables + styles</span>
              </div>
              <ul className="tree-list tree-list-compact">
                {designSystemRows.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="section status-section">
          <article className="status-card">
            <span className="status-badge ui-mono">Experimental</span>
            <h2>
              Current status: sharp first-pass workflow, active product
              development.
            </h2>
            <p>
              Strapping AI Canvas is still under active development, but the
              direction is clear: get from zero to usable visual design faster
              by keeping desktop editing and agent actions in one local
              workspace.
            </p>
            <div className="status-actions">
              <LinkButton
                href={siteConfig.docsPath}
                kind="secondary"
                label="Read Docs"
              />
              <LinkButton
                href={siteConfig.githubUrl}
                kind="ghost"
                label="View GitHub"
                leadingVisual={githubIcon}
              />
            </div>
          </article>
        </section>

        <section className="section faq-section" id="faq">
          <SectionHeading
            body="Short answers to the runtime and scope questions that matter when evaluating the product."
            eyebrow="FAQ"
            title="What the site should answer directly."
          />

          <div className="faq-grid">
            {faqItems.map((item) => (
              <article className="faq-card" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section download-section" id="download">
          <article className="download-card">
            <div>
              <span className="section-eyebrow">Download</span>
              <h2>
                Bootstrap your next interface direction in one local workspace.
              </h2>
              <p>
                Download the latest desktop build, inspect the docs, or review
                the source. The current release is experimental, but the value
                is immediate: faster first-pass visual design with a local
                editor and MCP in the same loop.
              </p>
            </div>

            <div className="download-actions">
              <LinkButton
                href={siteConfig.downloadPath}
                kind="primary"
                label="Download Desktop"
              />
              <LinkButton
                href={siteConfig.githubUrl}
                kind="secondary"
                label="View GitHub"
                leadingVisual={githubIcon}
              />
              <LinkButton
                href={siteConfig.docsPath}
                kind="ghost"
                label="Read Docs"
              />
            </div>
          </article>
        </section>
      </main>

      <footer className="site-footer">
        <p>
          Bootstrap visual design fast with one local desktop + MCP workspace.
        </p>
        <div className="footer-links">
          <MarketingLink href={siteConfig.githubUrl}>
            <span className="inline-link">
              <BrandIcon
                aria-hidden="true"
                className="inline-link-icon"
                icon={siGithub}
                title="GitHub"
              />
              <span>GitHub</span>
            </span>
          </MarketingLink>
          <MarketingLink href={siteConfig.docsPath} newTab={false}>
            Docs
          </MarketingLink>
          <MarketingLink href={siteConfig.releasesUrl}>Releases</MarketingLink>
          <MarketingLink href={siteConfig.licenseUrl}>License</MarketingLink>
        </div>
      </footer>
    </div>
  );
}
