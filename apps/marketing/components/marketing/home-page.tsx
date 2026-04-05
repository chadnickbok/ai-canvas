import Image from "next/image";

import heroProjectLibraryImage from "../../src/assets/screenshots/hero-project-library.png";
import mcpInstallationImage from "../../src/assets/screenshots/mcp-installation.png";
import workflowSceneImage from "../../src/assets/screenshots/workflow-scene.png";
import { siteConfig } from "../../lib/site-config";
import { LinkButton } from "./link-button";
import { MarketingLink } from "./marketing-link";
import { SectionHeading } from "./section-heading";

const navigationItems = [
  { href: "#why", label: "Why" },
  { href: "#workflow", label: "Workflow" },
  { href: "#mcp", label: "MCP" },
  { href: "#trust", label: "Trust" },
  { href: "#faq", label: "FAQ" },
  { href: "#download", label: "Download" }
] as const;

const proofPoints = [
  "Local-first",
  "Scene-first",
  "Shared UI + MCP document core",
  "Localhost MCP",
  "SQLite + disk-backed assets"
] as const;

const valueCards = [
  {
    body:
      "The editor UI and the local MCP bridge use the same document schema, command system, and semantic logic. Agent edits do not go through a second automation model.",
    title: "One Shared Core"
  },
  {
    body:
      "Projects, metadata, and assets stay on your machine. Core editing is offline-capable, and MCP binds only to localhost on a configurable port.",
    title: "Local By Default"
  },
  {
    body:
      "Scenes are the primary top-level unit, and the document owns variables, styles, bindings, and provenance. That gives agents structure instead of pixels-only guesswork.",
    title: "Built For Structured Mockups"
  }
] as const;

const workflowSteps = [
  {
    body:
      "Create or open a local project. In v1, each project contains one document workspace with scenes as the primary top-level unit.",
    title: "Open a project"
  },
  {
    body:
      "Connect a client such as Claude, Codex, or Gemini through the local MCP endpoint and inspect or mutate the same live project session the editor uses.",
    title: "Inspect or mutate through MCP"
  },
  {
    body:
      "See the resulting scene, text, and layout state in the desktop editor. Command application, normalization, and document updates stay deterministic across both paths.",
    title: "Verify the same result in the UI"
  }
] as const;

const mcpTools = [
  "list_projects",
  "create_project",
  "open_project",
  "inspect_project",
  "inspect_tree",
  "inspect_node",
  "inspect_scenes",
  "inspect_design_system",
  "apply_commands"
] as const;

const trustPoints = [
  "Projects, metadata, and assets stay local.",
  "No mandatory backend or account setup.",
  "Core editing workflows are offline-capable.",
  "MCP is localhost-only and user-visible.",
  "UI and MCP do not diverge into separate semantic models.",
  "Autosave-first desktop workflow with explicit runtime boundaries."
] as const;

const excludedScope = [
  "Not a browser-first editor",
  "Not cloud collaboration",
  "Not realtime multi-user",
  "Not multi-document per project in v1"
] as const;

const faqItems = [
  {
    answer:
      "AI Canvas is built as a standalone Electron app so the editor, local persistence, and MCP runtime can share one local-first document model without a mandatory backend.",
    question: "Why desktop instead of browser-first?"
  },
  {
    answer:
      "No. Core editing workflows are designed to work locally without a running server or cloud control plane.",
    question: "Does AI Canvas require the cloud?"
  },
  {
    answer:
      "Closing the editor window does not quit the app. The app stays resident in the tray, and MCP inspection remains available against the active project session.",
    question: "What happens when the editor window closes?"
  },
  {
    answer:
      "Yes. Inspection remains available after the window closes until the user explicitly quits the tray app.",
    question: "Can agents still inspect projects after close?"
  },
  {
    answer:
      "No. In v1, mutations fail fast with measurement_surface_unavailable when the editor window is closed because the browser-backed measurement surface is unavailable.",
    question: "Can agents mutate while the window is closed?"
  },
  {
    answer:
      "Yes. The current product stance is single-user, single-window, and local-first for v1.",
    question: "Is v1 single-user?"
  },
  {
    answer:
      "No. In v1, each project contains exactly one document. Project targeting is the primary MCP target surface.",
    question: "Does a project contain multiple documents?"
  }
] as const;

const commandSnippet = `endpoint: http://localhost:9311/mcp

tool: inspect_project
tool: apply_commands

commands:
  - create_scene id=scene_home
  - create_node id=rect_hero kind=rectangle
  - create_node id=text_title kind=text
  - inspect_scenes

mode: read_write`;

const treeRows = [
  "project: homeflow",
  "document: current_document_json",
  "scene: scene_home",
  "frame: scene_home",
  "rectangle: rect_hero",
  "text: text_title",
  "style: hero_surface",
  "variable: color.brand.accent"
] as const;

const designSystemRows = [
  "variables: color.brand.accent, type.display.lg",
  "styles: hero_surface, body_copy",
  "bindings: text_title -> body_copy",
  "provenance: command batch / revision 12"
] as const;

export function MarketingHomePage() {
  return (
    <div className="site-shell">
      <div aria-hidden="true" className="site-background" />

      <header className="site-header">
        <a className="brand-lockup" href="#top">
          <span aria-hidden="true" className="brand-mark" />
          <span className="brand-text">
            <strong>AI Canvas</strong>
            <span>Desktop + MCP</span>
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
          <LinkButton href={siteConfig.githubUrl} kind="ghost" label="GitHub" />
          <LinkButton href={siteConfig.downloadPath} kind="primary" label="Download Desktop" />
        </div>
      </header>

      <main>
        <section className="hero section" id="top">
          <div className="hero-copy">
            <span className="section-eyebrow">Local-first visual authoring for AI agents</span>
            <h1>A local-first canvas for AI-assisted interface design.</h1>
            <p className="hero-body">
              AI Canvas Desktop is a scene-first mockup editor where humans and AI agents work
              against the same structured project model. The editor UI and MCP bridge share one
              document core, so design changes stay inspectable, deterministic, and local.
            </p>

            <div className="hero-actions">
              <LinkButton href={siteConfig.downloadPath} kind="primary" label="Download Desktop" />
              <LinkButton href={siteConfig.docsPath} kind="secondary" label="Read the Docs" />
            </div>

            <p className="hero-note">
              Experimental desktop app. Local projects, localhost MCP, and explicit runtime
              boundaries.
            </p>
          </div>

          <div className="hero-visual">
            <article className="hero-panel hero-panel-canvas">
              <div className="panel-chrome">
                <span>project library</span>
                <span className="ui-mono">active project: homeflow</span>
              </div>
              <div className="panel-media-frame">
                <Image
                  alt="AI Canvas Desktop project library with MCP status and installation guidance"
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

        <section aria-label="Product proof points" className="proof-strip section">
          {proofPoints.map((point) => (
            <div className="proof-pill" key={point}>
              {point}
            </div>
          ))}
        </section>

        <section className="section" id="why">
          <SectionHeading
            body="Most design tooling treats automation as an add-on. AI Canvas takes the opposite approach: one project model, one command path, and one local runtime that serves both direct editing and agent workflows."
            eyebrow="Why AI Canvas"
            title="A design surface that does not fork human and agent behavior."
          />

          <div className="value-grid">
            {valueCards.map((card) => (
              <article className="value-card" key={card.title}>
                <span className="card-index ui-mono">{card.title.slice(0, 2).toUpperCase()}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section workflow-section" id="workflow">
          <SectionHeading
            body="The intended loop is direct: open a local project, connect MCP, make structured changes, and inspect the same live result in the editor."
            eyebrow="Workflow"
            title="Open locally. Mutate through MCP. Verify in the same workspace."
          />

          <div className="workflow-layout">
            <div className="workflow-steps">
              {workflowSteps.map((step, index) => (
                <article className="workflow-step" key={step.title}>
                  <span className="step-number ui-mono">{String(index + 1).padStart(2, "0")}</span>
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
                  label="Download Desktop and Try MCP"
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
                    alt="AI Canvas document workspace showing a multi-screen flow with the layers panel on the left and the inspector on the right"
                    className="panel-image panel-image-workflow"
                    placeholder="blur"
                    sizes="(min-width: 1180px) 556px, (min-width: 900px) calc(100vw - 32px), 100vw"
                    src={workflowSceneImage}
                  />
                </div>
                <p className="card-footnote">
                  One screenshot now carries the full product shape: scene-first canvas, visible
                  structure, and inspector-backed editing in the same workspace.
                </p>
              </article>

              <article className="info-card info-card-accent">
                <div className="stat-row">
                  <span className="stat-label">project target</span>
                  <strong>Active project session</strong>
                </div>
                <div className="stat-row">
                  <span className="stat-label">document count in v1</span>
                  <strong>1 document per project</strong>
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
            body="AI Canvas exposes a first-pass local MCP surface over the same command/query/document core the desktop editor uses. The goal is not generic automation glue. The goal is parity."
            eyebrow="MCP"
            title="The local MCP bridge is part of the product, not a separate adapter."
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
                  alt="AI Canvas MCP installation panel showing the localhost endpoint and setup buttons for Claude, Codex, and Gemini"
                  className="panel-image panel-image-mcp"
                  placeholder="blur"
                  sizes="(min-width: 1180px) 420px, (min-width: 900px) calc(50vw - 32px), 100vw"
                  src={mcpInstallationImage}
                />
              </div>
              <p className="card-footnote">
                Works with clients such as Claude, Codex, and Gemini through their MCP or tools
                configuration screens. Use the full endpoint, including the <span>/mcp</span> path,
                and keep the editor window open for write-capable actions.
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
                  <p>Available while the editor window is open and the measurement surface exists.</p>
                </div>
                <div className="mode-card">
                  <span className="mode-label ui-mono">read_only</span>
                  <p>
                    Inspection remains available after close. Mutation fails fast with
                    <span className="ui-mono"> measurement_surface_unavailable</span>.
                  </p>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="section trust-section" id="trust">
          <SectionHeading
            body="The product boundary matters. The site should make the trust model and the v1 limits visible so the marketing story matches the runtime contract."
            eyebrow="Trust"
            title="Local-first means explicit boundaries, not vague privacy claims."
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
            title="Structured design data gives agents something better than pixels."
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
            <h2>Current status: active development, concrete desktop direction.</h2>
            <p>
              AI Canvas Desktop, the local MCP bridge, and the shared command/query/document core
              define the current product direction. For exact behavior, the docs remain the source
              of truth.
            </p>
            <div className="status-actions">
              <LinkButton href={siteConfig.docsPath} kind="secondary" label="Read Docs" />
              <LinkButton href={siteConfig.githubUrl} kind="ghost" label="View GitHub" />
            </div>
          </article>
        </section>

        <section className="section faq-section" id="faq">
          <SectionHeading
            body="Short answers to the current v1 questions that matter most for technical evaluation."
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
              <h2>Local-first, scene-first mockup editing for humans and AI agents.</h2>
              <p>
                Download the latest desktop build, inspect the docs, or review the source. The
                current release is experimental, but the product story is already clear.
              </p>
            </div>

            <div className="download-actions">
              <LinkButton href={siteConfig.downloadPath} kind="primary" label="Download Desktop" />
              <LinkButton href={siteConfig.githubUrl} kind="secondary" label="View GitHub" />
              <LinkButton href={siteConfig.docsPath} kind="ghost" label="Read Docs" />
            </div>
          </article>
        </section>
      </main>

      <footer className="site-footer">
        <p>Local-first, scene-first mockup editing for humans and AI agents.</p>
        <div className="footer-links">
          <MarketingLink href={siteConfig.githubUrl}>GitHub</MarketingLink>
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
