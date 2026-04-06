import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Search,
  Settings
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FormEvent,
  type ReactNode
} from "react";

import {
  createProjectInputSchema,
  type CreateProjectInput,
  type McpStatus,
  type ProjectSummary,
  type RuntimeCapabilities
} from "@ai-canvas/ipc-contract";

type ProjectLibraryScreenProps = {
  activeProjectId: string | null;
  brandAttribution?: {
    label: string;
    url: string;
  };
  bootState: "booting" | "ready" | "boot_error";
  errorMessage?: string | null;
  isBusy: boolean;
  mcpStatus: McpStatus | null;
  projects: ProjectSummary[];
  runtimeCapabilities: RuntimeCapabilities | null;
  onCreateProject: (input: CreateProjectInput) => Promise<void> | void;
  onOpenProject: (projectId: string) => void;
  onOpenExternalUrl: (url: string) => void;
};

type SortMode = "updated" | "created";
type ScreenView = "library" | "mcp-guide";
type GuideTarget = "claude" | "codex" | "gemini";
type ProjectSection = {
  label: "Today" | "This week" | "Earlier";
  projects: ProjectSummary[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const REPO_URL = "https://github.com/chadnickbok/ai-canvas";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function GitHubMarkIcon(props: ComponentPropsWithoutRef<"svg">) {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.41 7.86 10.94.57.1.78-.25.78-.55 0-.28-.01-1.18-.02-2.14-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.69.08-.69 1.15.08 1.75 1.18 1.75 1.18 1.02 1.74 2.67 1.24 3.32.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.17 1.18a10.95 10.95 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.77.11 3.06.74.81 1.18 1.84 1.18 3.1 0 4.41-2.69 5.39-5.26 5.68.41.35.77 1.03.77 2.08 0 1.5-.01 2.71-.01 3.08 0 .3.21.66.79.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function getSortDate(project: ProjectSummary, sortMode: SortMode): Date | null {
  return parseDate(sortMode === "created" ? project.createdAt : project.updatedAt);
}

function formatProjectTimestamp(value: string | null): string {
  const date = parseDate(value);

  if (!date) {
    return "Updated never";
  }

  const now = new Date();
  const diffMs = Math.max(now.getTime() - date.getTime(), 0);

  if (isSameLocalDay(now, date)) {
    if (diffMs < HOUR_MS) {
      return `Updated ${Math.max(1, Math.floor(diffMs / MINUTE_MS) || 1)} min ago`;
    }

    return `Updated ${Math.max(1, Math.floor(diffMs / HOUR_MS))} hr ago`;
  }

  if (diffMs < 6 * DAY_MS) {
    return `Updated ${new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit"
    }).format(date)}`;
  }

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date)}`;
}

function bucketProject(date: Date | null, now: Date): ProjectSection["label"] {
  if (!date) {
    return "Earlier";
  }

  if (isSameLocalDay(date, now)) {
    return "Today";
  }

  const diffMs = Math.max(startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime(), 0);
  return diffMs < 7 * DAY_MS ? "This week" : "Earlier";
}

function buildProjectSections(
  projects: ProjectSummary[],
  sortMode: SortMode,
  query: string
): ProjectSection[] {
  const normalizedQuery = query.trim().toLowerCase();
  const now = new Date();

  const filteredProjects = normalizedQuery
    ? projects.filter((project) => project.name.toLowerCase().includes(normalizedQuery))
    : projects;

  const sortedProjects = [...filteredProjects].sort((left, right) => {
    const leftDate = getSortDate(left, sortMode);
    const rightDate = getSortDate(right, sortMode);

    if (!leftDate && !rightDate) {
      return left.name.localeCompare(right.name);
    }

    if (!leftDate) {
      return 1;
    }

    if (!rightDate) {
      return -1;
    }

    return rightDate.getTime() - leftDate.getTime();
  });

  const sections = new Map<ProjectSection["label"], ProjectSummary[]>([
    ["Today", []],
    ["This week", []],
    ["Earlier", []]
  ]);

  for (const project of sortedProjects) {
    sections.get(bucketProject(getSortDate(project, sortMode), now))?.push(project);
  }

  return (["Today", "This week", "Earlier"] as const)
    .map((label) => ({
      label,
      projects: sections.get(label) ?? []
    }))
    .filter((section) => section.projects.length > 0);
}

function formatMcpStatusLine(status: McpStatus | null): string {
  if (!status) {
    return "MCP status loading";
  }

  if (status.state === "error") {
    return `MCP failed on ${status.host}:${status.port}`;
  }

  if (!status.enabled) {
    return `MCP disabled on ${status.host}:${status.port}`;
  }

  return `MCP is running on ${status.endpoint}`;
}

function formatMcpEndpoint(status: McpStatus | null): string {
  if (!status) {
    return "Loading MCP endpoint";
  }

  return status.endpoint;
}

function getPreviewVariant(projectId: string): number {
  let hash = 0;

  for (const character of projectId) {
    hash = (hash * 33 + character.charCodeAt(0)) % 4;
  }

  return hash;
}

function ProjectPreview({ projectId }: { projectId: string }) {
  const variant = getPreviewVariant(projectId);

  return (
    <div className="flex h-[60px] w-[108px] shrink-0 overflow-hidden border border-black/12 bg-[var(--chrome-surface-subtle)]">
      {variant === 0 ? (
        <div className="flex h-full w-full flex-col">
          <div className="h-[12px] w-full bg-[#111111]" />
          <div className="flex flex-1 gap-1.5 px-2 py-2">
            <div className="w-7 bg-black/12" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="h-2.5 w-full bg-black/12" />
              <div className="h-4.5 w-4/5 bg-black/22" />
              <div className="h-2 w-3/5 bg-black/12" />
            </div>
          </div>
        </div>
      ) : null}

      {variant === 1 ? (
        <div className="flex h-full w-full items-end gap-1.5 p-2">
          <div className="h-full w-5 bg-black/12" />
          <div className="h-3/4 flex-1 bg-black/16" />
          <div className="h-2/5 w-[18px] bg-black/24" />
        </div>
      ) : null}

      {variant === 2 ? (
        <div className="flex h-full w-full flex-col">
          <div className="h-[16px] w-full bg-black/8" />
          <div className="flex flex-1 gap-1.5 px-2 py-2">
            <div className="flex-1 bg-black/14" />
            <div className="w-6 bg-black/24" />
          </div>
        </div>
      ) : null}

      {variant === 3 ? (
        <div className="flex h-full w-full flex-col gap-1.5 p-2">
          <div className="h-2 w-3/4 bg-black/14" />
          <div className="h-4 w-full bg-black/22" />
          <div className="h-2 w-4/5 bg-black/14" />
          <div className="h-2 w-1/2 bg-black/20" />
        </div>
      ) : null}
    </div>
  );
}

function EmptyPanel({
  title,
  body,
  tone = "neutral"
}: {
  title: string;
  body: string;
  tone?: "neutral" | "error";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border px-5 py-5",
        tone === "error" ? "border-black/18 bg-black/[0.03]" : "border-black/12 bg-white/70"
      )}
    >
      <strong className="text-[18px] font-semibold tracking-[-0.03em] text-[#111111]">{title}</strong>
      <p className="m-0 max-w-[32rem] text-[15px] leading-7 text-black/66">{body}</p>
    </div>
  );
}

function UtilityButton({
  children,
  className,
  disabled = false,
  title,
  onClick
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={title}
      className={cn(
        "flex h-9 w-9 items-center justify-center border border-black/14 bg-white/92 text-[#111111] transition hover:border-black/60",
        disabled && "cursor-not-allowed opacity-40 hover:border-black/14",
        className
      )}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function InstallButton({
  label,
  onClick
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex h-[42px] items-center justify-between border border-black bg-white px-4 text-left text-[13px] font-medium text-[#111111] transition hover:bg-black hover:text-white"
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={1.6} />
    </button>
  );
}

function TryCard({
  title,
  body
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-2 border border-black/16 bg-white px-4 py-4">
      <span className="ui-mono text-[12px] uppercase tracking-[0.12em] text-black/44">{title}</span>
      <p className="m-0 text-[15px] leading-7 text-[#111111]">{body}</p>
    </div>
  );
}

function GuideSection({
  title,
  body,
  steps,
  placeholderLabel,
  highlight,
  previewVariant,
  sectionRef
}: {
  title: string;
  body: string;
  steps: string[];
  placeholderLabel: string;
  highlight: boolean;
  previewVariant?: "blank" | "codex";
  sectionRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <section
      className={cn(
        "grid gap-8 border-b border-black/12 py-6 xl:grid-cols-[minmax(0,1fr)_320px]",
        highlight && "border-t border-black pt-6"
      )}
      ref={sectionRef}
    >
      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-[26px] font-semibold tracking-[-0.04em] text-[#111111]">{title}</h3>
        <p className="m-0 max-w-[38rem] text-[15px] leading-8 text-[#111111]">{body}</p>
        <div className="flex flex-col gap-2 pt-1 text-[14px] leading-7 text-[#111111]">
          {steps.map((step) => (
            <p key={step} className="m-0">
              {step}
            </p>
          ))}
        </div>
      </div>

      {previewVariant === "codex" ? (
        <div className="flex h-[210px] flex-col overflow-hidden border border-black/16 bg-white">
          <div className="flex h-[34px] items-center justify-between border-b border-black/10 bg-[var(--chrome-surface-muted)] px-3">
            <span className="ui-mono text-[11px] uppercase tracking-[0.16em] text-black/40">
              Codex app
            </span>
            <span className="ui-mono text-[11px] text-black/34">screenshot slot</span>
          </div>
          <div className="flex flex-1 gap-3 p-4">
            <div className="flex w-[92px] flex-col gap-2 border-r border-black/8 pr-3">
              <div className="h-4 w-full bg-black/12" />
              <div className="h-2.5 w-3/4 bg-black/10" />
              <div className="h-2.5 w-4/5 bg-black/10" />
              <div className="h-2.5 w-2/3 bg-black/10" />
            </div>
            <div className="flex flex-1 flex-col justify-center gap-3">
              <div className="h-3.5 w-3/4 bg-black/12" />
              <div className="h-[72px] w-full border border-black/8 bg-black/8" />
              <div className="h-7 w-[96px] bg-[#111111]" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-[210px] items-center justify-center border border-black/16 bg-white">
          <span className="ui-mono px-6 text-center text-[11px] uppercase tracking-[0.18em] text-black/36">
            {placeholderLabel}
          </span>
        </div>
      )}
    </section>
  );
}

function ProjectRow({
  project,
  isActive,
  isBusy,
  onOpen
}: {
  project: ProjectSummary;
  isActive: boolean;
  isBusy: boolean;
  onOpen: (projectId: string) => void;
}) {
  return (
    <li>
      <button
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group flex w-full items-center gap-3 px-3 py-3 text-left transition",
          isActive
            ? "border border-black bg-white/95"
            : "border-b border-black/10 hover:border-black/18 hover:bg-white/65"
        )}
        disabled={isBusy}
        onClick={() => onOpen(project.id)}
        type="button"
      >
        <ProjectPreview projectId={project.id} />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <strong className="truncate text-[18px] font-semibold tracking-[-0.04em] text-[#111111]">
            {project.name}
          </strong>
          <span className="ui-mono text-[11px] uppercase tracking-[0.16em] text-black/44">
            {formatProjectTimestamp(project.updatedAt)}
          </span>
        </div>
      </button>
    </li>
  );
}

export function ProjectLibraryScreen(props: ProjectLibraryScreenProps) {
  const [view, setView] = useState<ScreenView>("library");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredQuery = useDeferredValue(searchQuery);
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [guideTarget, setGuideTarget] = useState<GuideTarget | null>(null);
  const [isCreateProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [createProjectName, setCreateProjectName] = useState("");
  const [createProjectSubmissionError, setCreateProjectSubmissionError] = useState<string | null>(
    null
  );

  const claudeSectionRef = useRef<HTMLDivElement | null>(null);
  const codexSectionRef = useRef<HTMLDivElement | null>(null);
  const geminiSectionRef = useRef<HTMLDivElement | null>(null);
  const createProjectInputRef = useRef<HTMLInputElement | null>(null);

  const isReady = props.bootState === "ready";
  const isBooting = props.bootState === "booting";
  const hasMcpError = props.mcpStatus?.state === "error";
  const suggestedProjectName = `Project ${props.projects.length + 1}`;
  const projectSections = isReady
    ? buildProjectSections(props.projects, sortMode, deferredQuery)
    : [];
  const hasFilteredResults = projectSections.some((section) => section.projects.length > 0);
  const showNoResults =
    isReady && props.projects.length > 0 && deferredQuery.trim().length > 0 && !hasFilteredResults;
  const measurementWarning =
    props.runtimeCapabilities && !props.runtimeCapabilities.measurementSurfaceAvailable
      ? "Measurement surface unavailable. Keep the editor window open for write-capable actions."
      : null;
  const modeWarning =
    props.runtimeCapabilities?.mode === "read_only"
      ? "Runtime is currently read-only."
      : null;
  const createProjectValidation = createProjectInputSchema.safeParse({ name: createProjectName });
  const createProjectValidationMessage = createProjectValidation.success
    ? null
    : createProjectValidation.error.issues[0]?.message ?? "Enter a project name.";
  const createProjectInlineError =
    createProjectValidationMessage ?? createProjectSubmissionError;
  const brandAttribution = props.brandAttribution;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  useEffect(() => {
    if (view !== "mcp-guide" || !guideTarget || typeof window === "undefined") {
      return;
    }

    const nodeMap: Record<GuideTarget, HTMLDivElement | null> = {
      claude: claudeSectionRef.current,
      codex: codexSectionRef.current,
      gemini: geminiSectionRef.current
    };

    const frame = window.requestAnimationFrame(() => {
      nodeMap[guideTarget]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [guideTarget, view]);

  useEffect(() => {
    if (!isCreateProjectDialogOpen || typeof window === "undefined") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      createProjectInputRef.current?.focus();
      createProjectInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isCreateProjectDialogOpen]);

  const handleOpenGuide = (target: GuideTarget) => {
    setGuideTarget(target);
    setView("mcp-guide");
  };

  const handleBackToLibrary = () => {
    setView("library");
    setGuideTarget(null);
  };

  const handleOpenRepository = () => {
    props.onOpenExternalUrl(REPO_URL);
  };

  const handleOpenCreateProjectDialog = () => {
    if (!isReady || props.isBusy) {
      return;
    }

    setCreateProjectName(suggestedProjectName);
    setCreateProjectSubmissionError(null);
    setCreateProjectDialogOpen(true);
  };

  const handleCloseCreateProjectDialog = () => {
    if (props.isBusy) {
      return;
    }

    setCreateProjectDialogOpen(false);
    setCreateProjectName("");
    setCreateProjectSubmissionError(null);
  };

  const handleCreateProjectSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (props.isBusy || !createProjectValidation.success) {
      return;
    }

    setCreateProjectSubmissionError(null);

    try {
      await Promise.resolve(props.onCreateProject(createProjectValidation.data));
      handleCloseCreateProjectDialog();
    } catch (error) {
      setCreateProjectSubmissionError(
        error instanceof Error ? error.message : "Failed to create the project"
      );
    }
  };

  if (view === "mcp-guide") {
    return (
      <main className="page-grid min-h-screen bg-white text-[#111111]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-8 px-8 py-10 xl:px-13 xl:py-11">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/42 transition hover:text-black"
                onClick={handleBackToLibrary}
                type="button"
              >
                Library
              </button>
              <span className="ui-mono text-[12px] text-black/28">/</span>
              <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-[#111111]">
                MCP installation
              </span>
            </div>

            <div className="flex items-center gap-2">
              <UtilityButton
                onClick={handleOpenRepository}
                title="Open GitHub repository"
              >
                <GitHubMarkIcon className="h-[17px] w-[17px]" />
              </UtilityButton>
              <UtilityButton disabled title="Settings coming soon">
                <Settings className="h-[17px] w-[17px]" strokeWidth={1.6} />
              </UtilityButton>
            </div>
          </header>

          <section className="grid gap-8 border-b border-black/12 pb-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex flex-col gap-4">
              <h1 className="m-0 max-w-[760px] text-[clamp(52px,6vw,76px)] font-semibold leading-[0.94] tracking-[-0.08em] text-[#111111]">
                Install AI Canvas MCP
              </h1>
              <p className="m-0 max-w-[760px] text-[20px] leading-[1.55] text-black/72">
                Set up Model Context Protocol in your client, point it at AI Canvas Desktop, and
                connect the same live project session the editor is using.
              </p>
              <p className="m-0 max-w-[760px] text-[16px] leading-8 text-[#111111]">
                MCP is the bridge that lets tools like Claude, Codex, and Gemini inspect project
                state and send deterministic mutations through the same document core as the UI.
                For AI Canvas Desktop, inspection can continue when the window is closed, but
                write-capable actions require the editor window to be open so the measurement
                surface is available.
              </p>
            </div>

            <aside className="flex flex-col gap-3 border border-black/16 bg-white px-5 py-5">
              <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/44">
                Quick notes
              </span>
              <p className="m-0 text-[14px] leading-8 text-[#111111]">
                Keep the AI Canvas Desktop window open for edits that depend on layout measurement.
              </p>
              <p className="m-0 text-[14px] leading-8 text-[#111111]">
                Use the full MCP endpoint shown in the app, including the
                <span className="ui-mono mx-2 text-[13px]">/mcp</span>
                path.
              </p>
              <p className="m-0 text-[14px] leading-8 text-[#111111]">
                If your client supports screenshots in docs, include the app-specific setup screen
                here.
              </p>
            </aside>
          </section>

          <section className="grid gap-8 border-b border-black/12 pb-7 xl:grid-cols-[620px_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/42">
                How MCP installation works
              </span>
              <div className="flex flex-col gap-3 text-[15px] leading-8 text-[#111111]">
                <p className="m-0">
                  <span className="ui-mono mr-4 text-[12px] text-black/34">01</span>
                  Open the MCP or developer settings for your client. Most tools expose a place to
                  register local servers and their startup config.
                </p>
                <p className="m-0">
                  <span className="ui-mono mr-4 text-[12px] text-black/34">02</span>
                  Copy the exact AI Canvas MCP endpoint from the app. For the local bridge this
                  includes the path, for example
                  <span className="ui-mono mx-2 text-[13px]">http://localhost:&lt;port&gt;/mcp</span>.
                </p>
                <p className="m-0">
                  <span className="ui-mono mr-4 text-[12px] text-black/34">03</span>
                  Restart or reload the client if required, then verify that the AI Canvas MCP
                  appears as an available server or tool source.
                </p>
                <p className="m-0">
                  <span className="ui-mono mr-4 text-[12px] text-black/34">04</span>
                  Open a project in AI Canvas Desktop before using write-capable actions so the live
                  document and measurement surface are ready.
                </p>
              </div>
            </div>

            <aside className="flex flex-col gap-3 border border-black/16 bg-white px-5 py-5">
              <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/42">
                AI Canvas specifics
              </span>
              <p className="m-0 text-[15px] leading-8 text-[#111111]">
                Project inspection uses the same document core the editor uses.
              </p>
              <p className="m-0 text-[15px] leading-8 text-[#111111]">
                Write actions are routed through the canonical command system, not a separate
                automation model.
              </p>
              <pre className="ui-mono m-0 whitespace-pre-wrap border border-black/10 bg-[#fafafa] px-4 py-3 text-[13px] leading-7 text-[#111111]">
{`endpoint: http://localhost:PORT/mcp
status: running`}
              </pre>
            </aside>
          </section>

          <section className="flex flex-col gap-4">
            <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/42">
              Client-specific setup
            </span>

            <GuideSection
              body="Open Claude&apos;s MCP or developer settings, add a new local server, and paste the AI Canvas Desktop MCP details from the app. If Claude asks for a restart or reload, complete that before testing the connection."
              highlight={guideTarget === "claude"}
              placeholderLabel="Claude settings screenshot"
              sectionRef={claudeSectionRef}
              steps={[
                "1. Open Claude settings and find the MCP or tools configuration area.",
                "2. Add AI Canvas Desktop using the full endpoint from the app, including the /mcp path.",
                "3. Verify the server appears before prompting against a live project."
              ]}
              title="Claude"
            />

            <GuideSection
              body="Use the Codex app&apos;s MCP or connectors screen to register AI Canvas Desktop. This page is a good place to show an annotated screenshot of the Codex setup flow once you have it."
              highlight={guideTarget === "codex"}
              placeholderLabel="Codex app screenshot"
              previewVariant="codex"
              sectionRef={codexSectionRef}
              steps={[
                "1. Open the Codex app and navigate to MCP, connectors, or integrations.",
                "2. Paste the full MCP endpoint from AI Canvas Desktop, including the /mcp path.",
                "3. Confirm that Codex can see the project server before issuing edit requests."
              ]}
              title="Codex"
            />

            <GuideSection
              body="In Gemini, register AI Canvas Desktop in the MCP, tools, or extensions area if available. The specific UI may differ by product surface, so this section should show the exact path once you capture it."
              highlight={guideTarget === "gemini"}
              placeholderLabel="Gemini setup screenshot"
              sectionRef={geminiSectionRef}
              steps={[
                "1. Open Gemini&apos;s tool or server configuration screen.",
                "2. Add the AI Canvas Desktop MCP using the full endpoint from the app, including /mcp.",
                "3. Test inspection first, then move on to write-capable actions with the editor window open."
              ]}
              title="Gemini"
            />
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page-grid min-h-screen bg-white text-[#111111]">
      <div className="grid min-h-screen w-full xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="flex min-h-screen flex-col border-r border-black/12 bg-white/90 px-7 py-7">
          <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-5">
            <h1 className="m-0 text-[22px] font-semibold tracking-[-0.05em] text-[#111111]">
              My Projects
            </h1>
            <button
              className={cn(
                "h-[42px] shrink-0 border border-[#111111] bg-[#111111] px-4 text-[13px] font-semibold tracking-[0.01em] text-white transition hover:bg-white hover:text-[#111111]",
                (!isReady || props.isBusy) && "cursor-not-allowed opacity-45 hover:bg-[#111111] hover:text-white"
              )}
              disabled={!isReady || props.isBusy}
              onClick={handleOpenCreateProjectDialog}
              type="button"
            >
              New Project
            </button>
          </div>

          <div className="flex flex-col gap-3 border-b border-black/8 py-5">
            <div className="flex items-center gap-2">
              <label className="relative flex min-w-0 flex-1 items-center" htmlFor="project-search">
                <Search
                  className="pointer-events-none absolute left-4 h-4 w-4 text-black/54"
                  strokeWidth={1.6}
                />
                <input
                  className="h-11 w-full border border-black/16 bg-white/78 pl-11 pr-4 text-[14px] text-[#111111] outline-none transition placeholder:text-black/42 focus:border-black"
                  disabled={!isReady || props.projects.length === 0}
                  id="project-search"
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                  }}
                  placeholder="Search projects"
                  value={searchQuery}
                />
              </label>

              <UtilityButton
                className={cn(
                  sortMode === "updated" && "border-black bg-white text-[#111111]"
                )}
                disabled={!isReady || props.projects.length === 0}
                onClick={() => {
                  setSortMode("updated");
                }}
                title="Sort by updated time"
              >
                <Clock3 className="h-[17px] w-[17px]" strokeWidth={1.7} />
              </UtilityButton>

              <UtilityButton
                className={cn(
                  sortMode === "created" && "border-black bg-white text-[#111111]"
                )}
                disabled={!isReady || props.projects.length === 0}
                onClick={() => {
                  setSortMode("created");
                }}
                title="Sort by created time"
              >
                <CalendarDays className="h-[17px] w-[17px]" strokeWidth={1.7} />
              </UtilityButton>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/40">
                {sortMode === "updated" ? "Updated by recent activity" : "Ordered by creation date"}
              </span>

              <span className="ui-mono text-[11px] uppercase tracking-[0.12em] text-black/34">
                {isReady ? `${props.projects.length} projects` : "bootstrap pending"}
              </span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-4 py-5">
            {isBooting ? (
              <EmptyPanel
                body="The renderer is waiting for the preload bridge and initial IPC reads before the library becomes interactive."
                title="Connecting to the desktop session."
              />
            ) : props.bootState === "boot_error" ? (
              <EmptyPanel
                body={
                  props.errorMessage ??
                  "The desktop bridge or initial application state could not be loaded."
                }
                title="Startup did not complete."
                tone="error"
              />
            ) : props.projects.length === 0 ? (
              <EmptyPanel
                body="Create a project to seed the local library and the active project session."
                title="No local projects yet."
              />
            ) : showNoResults ? (
              <EmptyPanel
                body="Try a different project name or clear the current filter."
                title="No projects match your search."
              />
            ) : (
              projectSections.map((section) => (
                <section className="flex flex-col gap-1" key={section.label}>
                  <span className="ui-mono px-1 pt-2 text-[11px] uppercase tracking-[0.18em] text-black/42">
                    {section.label}
                  </span>
                  <ul className="m-0 list-none p-0">
                    {section.projects.map((project) => (
                      <ProjectRow
                        isActive={project.id === props.activeProjectId}
                        isBusy={props.isBusy}
                        key={project.id}
                        onOpen={props.onOpenProject}
                        project={project}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>

          {props.isBusy ? (
            <span className="ui-mono pt-1 text-[11px] uppercase tracking-[0.16em] text-black/38">
              {isBooting ? "Bootstrapping..." : "Working..."}
            </span>
          ) : null}
        </aside>

        <section className="flex min-h-screen flex-col gap-8 px-8 py-10 xl:px-[52px] xl:py-[44px]">
          <div className="flex items-center justify-end gap-2">
            <UtilityButton
              onClick={handleOpenRepository}
              title="Open GitHub repository"
            >
              <GitHubMarkIcon className="h-[17px] w-[17px]" />
            </UtilityButton>
            <UtilityButton disabled title="Settings coming soon">
              <Settings className="h-[17px] w-[17px]" strokeWidth={1.6} />
            </UtilityButton>
          </div>

          <div className="grid flex-1 gap-[58px] xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex max-w-[620px] flex-col gap-6">
              <div className="flex flex-col gap-4 border-b border-black/12 pb-5">
                {brandAttribution ? (
                  <button
                    className="ui-mono w-fit border-0 bg-transparent p-0 text-[11px] uppercase tracking-[0.18em] text-black/42 transition hover:text-[#111111]"
                    onClick={() => {
                      props.onOpenExternalUrl(brandAttribution.url);
                    }}
                    type="button"
                  >
                    {brandAttribution.label}
                  </button>
                ) : null}
                <h2 className="m-0 text-[clamp(52px,5vw,74px)] font-semibold leading-[0.94] tracking-[-0.08em] text-[#111111]">
                  AI Canvas Desktop
                </h2>
                <p className="m-0 text-[20px] leading-[1.55] text-black/72">
                  Local-first, scene-first mockup editing with a shared document core for both
                  humans and AI agents.
                </p>
              </div>

              <div className="flex flex-col gap-5 text-[16px] leading-8 text-[#111111]">
                <p className="m-0">
                  AI Canvas Desktop is a desktop workspace for building structured mockups, scenes,
                  and reusable design-system data on your machine. The editor UI and MCP operate on
                  the same document schema, command system, and rendering model, so edits stay
                  deterministic and inspectable.
                </p>
                <p className="m-0">
                  Connect MCP to get the full experience. Claude, Codex, and Gemini can inspect the
                  same live project session you see here and apply changes through the same mutation
                  path as the UI.
                </p>
              </div>

              <div className="flex max-w-[520px] flex-col gap-3 border border-black/16 bg-white/92 px-5 py-5">
                <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/42">
                  MCP status
                </span>
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 shrink-0 bg-[#111111]" />
                  <span className="ui-mono text-[14px] text-[#111111]">
                    {formatMcpStatusLine(props.mcpStatus)}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/40">
                    Endpoint
                  </span>
                  <span className="ui-mono break-all text-[13px] text-[#111111]">
                    {formatMcpEndpoint(props.mcpStatus)}
                  </span>
                </div>

                <div className="h-px w-full bg-black/10" />

                <div className="flex flex-col gap-3">
                  <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/40">
                    Installation instructions
                  </span>
                  <div className="grid gap-2 md:grid-cols-3">
                    <InstallButton
                      label="Claude"
                      onClick={() => {
                        handleOpenGuide("claude");
                      }}
                    />
                    <InstallButton
                      label="Codex"
                      onClick={() => {
                        handleOpenGuide("codex");
                      }}
                    />
                    <InstallButton
                      label="Gemini"
                      onClick={() => {
                        handleOpenGuide("gemini");
                      }}
                    />
                  </div>
                </div>
              </div>

              {hasMcpError ? (
                <div className="border border-black/18 bg-black/[0.03] px-5 py-4 text-[14px] leading-7 text-[#111111]">
                  MCP startup failed. {props.mcpStatus?.errorMessage} External tools stay
                  unavailable until the conflict is resolved.
                </div>
              ) : null}

              {measurementWarning ? (
                <div className="border border-black/12 bg-white/70 px-5 py-4 text-[14px] leading-7 text-[#111111]">
                  {measurementWarning}
                </div>
              ) : null}

              {modeWarning ? (
                <div className="border border-black/12 bg-white/70 px-5 py-4 text-[14px] leading-7 text-[#111111]">
                  {modeWarning}
                </div>
              ) : null}

              {props.errorMessage && isReady ? (
                <div className="border border-black/18 bg-black/[0.03] px-5 py-4 text-[14px] leading-7 text-[#111111]">
                  {props.errorMessage}
                </div>
              ) : null}
            </div>

            <aside className="flex max-w-[280px] flex-col gap-4 pt-[108px]">
              <div className="flex flex-col gap-2 border-b border-black/12 pb-4">
                <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/42">
                  Things to try
                </span>
                <p className="m-0 text-[15px] leading-7 text-black/62">
                  Once MCP is connected, use your preferred client to try a few concrete tasks.
                </p>
              </div>

              <TryCard
                body="Outline a new landing page as scenes before filling in detailed styling."
                title="Plan"
              />
              <TryCard
                body="Clean up spacing, text styles, and repeated structure across the current project."
                title="Normalize"
              />
              <TryCard
                body="Review variables, styles, and assets before export to catch anything inconsistent."
                title="Audit"
              />
            </aside>
          </div>
        </section>
      </div>

      {isCreateProjectDialogOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/18 px-6 py-10">
          <div
            aria-labelledby="create-project-title"
            aria-modal="true"
            className="flex w-full max-w-[520px] flex-col gap-5 border border-black bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.14)]"
            role="dialog"
          >
            <div className="flex flex-col gap-2">
              <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/42">
                New project
              </span>
              <h2
                className="m-0 text-[30px] font-semibold tracking-[-0.05em] text-[#111111]"
                id="create-project-title"
              >
                Start a local project
              </h2>
              <p className="m-0 text-[15px] leading-7 text-black/66">
                Projects are created on your machine and become the active session for the editor
                and MCP.
              </p>
            </div>

            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                void handleCreateProjectSubmit(event);
              }}
            >
              <label className="flex flex-col gap-2" htmlFor="create-project-name">
                <span className="ui-mono text-[11px] uppercase tracking-[0.18em] text-black/42">
                  Project name
                </span>
                <input
                  className={cn(
                    "h-12 border bg-white px-4 text-[15px] text-[#111111] outline-none transition placeholder:text-black/30 focus:border-black",
                    createProjectInlineError ? "border-black" : "border-black/18"
                  )}
                  disabled={props.isBusy}
                  id="create-project-name"
                  onChange={(event) => {
                    setCreateProjectName(event.target.value);
                    setCreateProjectSubmissionError(null);
                  }}
                  placeholder="Project name"
                  ref={createProjectInputRef}
                  value={createProjectName}
                />
              </label>

              <div className="min-h-[28px] text-[13px] leading-6 text-[#111111]">
                {createProjectInlineError ? (
                  <span>{createProjectInlineError}</span>
                ) : (
                  <span className="text-black/52">
                    Required. Up to 120 characters. The name is used for the document and project
                    summary.
                  </span>
                )}
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  className={cn(
                    "h-[42px] border border-black/18 bg-white px-4 text-[13px] font-semibold tracking-[0.01em] text-[#111111] transition hover:border-black",
                    props.isBusy && "cursor-not-allowed opacity-45 hover:border-black/18"
                  )}
                  disabled={props.isBusy}
                  onClick={handleCloseCreateProjectDialog}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={cn(
                    "h-[42px] border border-[#111111] bg-[#111111] px-4 text-[13px] font-semibold tracking-[0.01em] text-white transition hover:bg-white hover:text-[#111111]",
                    (!createProjectValidation.success || props.isBusy) &&
                      "cursor-not-allowed opacity-45 hover:bg-[#111111] hover:text-white"
                  )}
                  disabled={!createProjectValidation.success || props.isBusy}
                  type="submit"
                >
                  {props.isBusy ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
