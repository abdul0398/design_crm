"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import {
  Layers3,
  Search,
  Plus,
  FolderOpen,
  FileCode2,
  ExternalLink,
  Pencil,
  Eye,
  LogOut,
  X,
  Upload,
  Menu,
  Trash2,
  RotateCcw,
} from "lucide-react";
import {
  projects as seedProjects,
  type Project,
  type Design,
  type Entry,
} from "@/lib/catalog";
import { wpChooseFiles } from "@/lib/upload-inspect";

type ProjectNav = (typeof seedProjects)[number] & { count: number };
type UploadSelection = {
  kind: string;
  name: string;
  entries: Entry[];
  entryPoint: string;
  sourceFiles: File[];
};
const statuses = ["Unused", "Active", "Suspended"] as const;
const formats = ["Landing page", "Brochure", "Social post", "Website", "Other"];
const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-SG", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not updated yet";
const size = (n: number) =>
  n < 1024
    ? n + " B"
    : n < 1048576
      ? (n / 1024).toFixed(1) + " KB"
      : (n / 1048576).toFixed(1) + " MB";
async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  if (r.status === 401) {
    window.location.assign("/login");
    throw Error("Please sign in");
  }
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "Unable to complete request");
  return result;
}
const json = (method: string, value: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});
function Modal({
  title,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"desk-dialog " + (wide ? "wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          aria-label="Close"
          className="icon-button"
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function ProjectEditor({
  project,
  onClose,
  onSaved,
}: {
  project: Project | null;
  onClose: () => void;
  onSaved: (project: Project) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: project?.name || "",
    site: project?.site || "",
    developer: project?.developer || "",
    window: project?.window || "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await api(
        project ? "/api/projects/" + project.id : "/api/projects",
        json(project ? "PUT" : "POST", { ...project, ...draft }),
      );
      await onSaved(saved);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={project ? "Edit project" : "Add project"}
      onClose={onClose}
      busy={busy}
    >
      <p className="dialog-subtitle">
        {project
          ? "Update the project information shown in your library."
          : "Create a workspace for your designs and website files."}
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            Project name
            <input
              required
              maxLength={150}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. New launch project"
            />
          </label>
          <label>
            Location
            <input
              maxLength={150}
              value={draft.site}
              onChange={(e) => setDraft({ ...draft, site: e.target.value })}
              placeholder="Street or neighbourhood"
            />
          </label>
          <label>
            Developer
            <input
              maxLength={200}
              value={draft.developer}
              onChange={(e) =>
                setDraft({ ...draft, developer: e.target.value })
              }
            />
          </label>
          <label>
            Launch status / date
            <input
              maxLength={100}
              value={draft.window}
              onChange={(e) => setDraft({ ...draft, window: e.target.value })}
              placeholder="e.g. Preview 15 October 2026"
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="primary save" disabled={busy}>
            {busy ? "Saving…" : project ? "Save project" : "Create project"}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
function DesignFiles({
  design,
  onClose,
  onSaved,
}: {
  design: Design;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState("");
  const [replacement, setReplacement] = useState<File | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const files = design.entries.filter((e) =>
    e.path.toLowerCase().includes(search.toLowerCase()),
  );
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!replacement || !target) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("expectedRevision", String(design.revision));
      form.set("path", target);
      form.set("file", replacement);
      await api("/api/library/" + design.id + "/files", {
        method: "POST",
        body: form,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={"Files — " + design.name} onClose={onClose} busy={busy}>
      <p className="dialog-subtitle">
        Replace any file while keeping its original path and the other files.
        {design.published
          ? " Saving updates the live website immediately at the same URL."
          : " This website is offline. Replacing files keeps it offline."}
      </p>
      <input
        ref={input}
        type="file"
        hidden
        aria-label="Choose replacement file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setError("");
            if (file.size > 50 * 1024 * 1024)
              setError("Choose a file up to 50 MB.");
            else setReplacement(file);
          }
          e.target.value = "";
        }}
      />
      <label>
        Find a file
        <input
          placeholder="Search by file name or folder"
          value={search}
          disabled={busy}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <ul className="design-file-list">
        {files.map((file) => (
          <li key={file.path}>
            <div>
              <strong>{file.path}</strong>
              <small>
                {size(file.size)}
                {file.path === design.entryPoint ? " · Starting page" : ""}
              </small>
            </div>
            <button
              className="secondary"
              disabled={busy}
              aria-label={"Replace " + file.path}
              onClick={() => {
                setTarget(file.path);
                setReplacement(null);
                setError("");
                input.current?.click();
              }}
            >
              Replace
            </button>
          </li>
        ))}
      </ul>
      {!files.length && <p>No matching files.</p>}
      {replacement && (
        <form onSubmit={save}>
          <p className="replacement-summary">
            <strong>{replacement.name}</strong> ({size(replacement.size)}) will
            replace <strong>{target}</strong>.
          </p>
          <div className="confirmation-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setReplacement(null);
                setTarget("");
                setError("");
              }}
            >
              Cancel replacement
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Replace file"}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
function UploadEditor({
  design,
  project,
  onClose,
  onSaved,
}: {
  design: Partial<Design>;
  project: Project;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: design.name || "",
    format: design.format || "Landing page",
    url: design.url || "",
    status: design.status || "Unused",
  });
  const [selection, setSelection] = useState<UploadSelection | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const zip = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement>(null),
    html = useRef<HTMLInputElement>(null);
  async function choose(list: FileList | null, kind: string) {
    if (!list?.length) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "html") {
        const file = list[0];
        if (!/\.html?$/i.test(file.name) || file.size > 50 * 1024 * 1024)
          throw Error("Choose an HTML file up to 50 MB.");
        setSelection({
          kind,
          name: file.name,
          entries: [{ path: file.name, size: file.size }],
          entryPoint: file.name,
          sourceFiles: [file],
        });
      } else setSelection(await wpChooseFiles(list, kind));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      Object.entries(draft).forEach(([k, v]) => form.set(k, v));
      form.set("project", project.id);
      form.set("expectedRevision", String(design.revision || 0));
      if (design.id) form.set("id", design.id);
      if (selection) {
        form.set("entryPoint", selection.entryPoint);
        if (selection.kind === "zip") form.set("zip", selection.sourceFiles[0]);
        else {
          selection.sourceFiles.forEach((f) => form.append("files", f));
          form.set(
            "paths",
            JSON.stringify(
              selection.sourceFiles.map((f) => f.webkitRelativePath || f.name),
            ),
          );
        }
      }
      await api("/api/library", { method: "POST", body: form });
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const entries = selection?.entries || design.entries || [];
  return (
    <Modal
      title={design.id ? "Update design" : "Add a design"}
      onClose={onClose}
      busy={busy}
    >
      <p className="dialog-subtitle">
        {project.name} ·{" "}
        {design.revision
          ? design.published
            ? "Replacing files updates the live website immediately at the same URL."
            : "This website is offline. Replacing files keeps it offline."
          : "Uploaded websites go live automatically. You can take them offline from Preview."}
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            Design name
            <input
              required
              maxLength={100}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Project launch — Design 01"
            />
          </label>
          <div className="field-row">
            <label>
              Format
              <select
                value={draft.format}
                onChange={(e) => setDraft({ ...draft, format: e.target.value })}
              >
                {formats.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Use status
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    status: e.target.value as Design["status"],
                  })
                }
              >
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="website-upload">
            <strong>
              {design.id ? "Replace website files" : "Website files"}
            </strong>
            <input
              ref={zip}
              type="file"
              accept=".zip"
              hidden
              aria-label="Choose website ZIP"
              onChange={(e) => {
                choose(e.target.files, "zip");
                e.target.value = "";
              }}
            />
            <input
              ref={folder}
              type="file"
              multiple
              {...{ webkitdirectory: "" }}
              hidden
              aria-label="Choose website folder"
              onChange={(e) => {
                choose(e.target.files, "folder");
                e.target.value = "";
              }}
            />
            <input
              ref={html}
              type="file"
              accept=".html,.htm"
              hidden
              aria-label="Choose HTML"
              onChange={(e) => {
                choose(e.target.files, "html");
                e.target.value = "";
              }}
            />
            <div className="package-upload-actions">
              <button
                className="package-upload-choice"
                type="button"
                onClick={() => zip.current?.click()}
              >
                <Upload size={21} />
                <strong>Upload ZIP</strong>
                <span>A complete website archive</span>
              </button>
              <button
                className="package-upload-choice"
                type="button"
                onClick={() => folder.current?.click()}
              >
                <FolderOpen size={21} />
                <strong>Upload folder</strong>
                <span>Include files and subfolders</span>
              </button>
            </div>
            <p className="field-help">
              Up to 50 MB expanded and 2,000 files. HTML, CSS, JavaScript,
              images, and fonts.
            </p>
            <button
              className="text-button"
              type="button"
              onClick={() => html.current?.click()}
            >
              Or choose a standalone HTML file
            </button>
            {entries.length > 0 && (
              <div className="package-summary">
                <strong>
                  {selection?.name || "Saved website"} · {entries.length} files
                </strong>
                <details>
                  <summary>View website files</summary>
                  <ul className="package-files">
                    {entries.map((f) => (
                      <li key={f.path}>
                        <span>{f.path}</span>
                        <small>{size(f.size)}</small>
                      </li>
                    ))}
                  </ul>
                </details>
                {selection && (
                  <label>
                    Starting page
                    <select
                      value={selection.entryPoint}
                      onChange={(e) =>
                        setSelection({
                          ...selection,
                          entryPoint: e.target.value,
                        })
                      }
                    >
                      {entries
                        .filter((f) => /\.html?$/i.test(f.path))
                        .map((f) => (
                          <option key={f.path}>{f.path}</option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
          <label>
            Design source link{" "}
            <span className="optional">Optional with website files</span>
            <input
              type="url"
              maxLength={2048}
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              placeholder="https://www.canva.com/design/..."
            />
          </label>

          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="primary save" disabled={busy}>
            {busy
              ? "Saving…"
              : selection
                ? "Replace website files"
                : "Save design"}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
export default function Desk({ loginName }: { loginName: string }) {
  const [nav, setNav] = useState<ProjectNav[]>([]),
    [selected, setSelected] = useState(""),
    [project, setProject] = useState<Project | null>(null),
    [designs, setDesigns] = useState<Design[]>([]),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [editor, setEditor] = useState<Partial<Design> | null>(null),
    [fileEditor, setFileEditor] = useState<Design | null>(null),
    [preview, setPreview] = useState<{ design: Design; url: string } | null>(
      null,
    ),
    [menu, setMenu] = useState(false),
    [projectEditor, setProjectEditor] = useState<{
      project: Project | null;
    } | null>(null),
    [trash, setTrash] = useState<ProjectNav[] | null>(null),
    [designTrash, setDesignTrash] = useState<{
      project: Project;
      designs: Design[];
    } | null>(null),
    [confirmation, setConfirmation] = useState<{
      title: string;
      message: string;
      label: string;
      run: () => Promise<void>;
    } | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const refresh = useCallback(async () => {
    const id = selected;
    const items = await api("/api/projects");
    if (selectedRef.current !== id) return false;
    setNav(items.projects);
    if (!items.projects.some((p: ProjectNav) => p.id === id)) {
      setSelected(items.projects[0]?.id || "");
      setProject(null);
      setDesigns([]);
      return false;
    }
    const library = await api("/api/library?project=" + id);
    if (selectedRef.current === id) setDesigns(library.designs);
    return true;
  }, [selected]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const id = selected;
    try {
      if (!(await refresh()) || !id || selectedRef.current !== id) return;
      const p = await api("/api/projects/" + id);
      if (selectedRef.current === id) {
        setProject(p);
      }
    } catch (e) {
      if (selectedRef.current === id) setError((e as Error).message);
    } finally {
      if (selectedRef.current === id) setLoading(false);
    }
  }, [selected, refresh]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh().catch(() => {});
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function selectProject(id: string) {
    setSelected(id);
    setProject(null);
    setDesigns([]);
    setFilter("All");
    setNotice("");
    setMenu(false);
  }
  function switchProject(id: string) {
    if (id === selected) return;
    selectProject(id);
  }
  async function projectSaved(p: Project) {
    const items = await api("/api/projects");
    setNav(items.projects);
    setSearch("");
    setMenu(false);
    if (p.id === selected) {
      setProject(p);
    } else selectProject(p.id);
    setNotice("Project saved.");
  }
  function deleteProject() {
    if (!project) return;
    const target = project;
    setConfirmation({
      title: "Delete project?",
      message: `Move “${target.name}” and its designs to Trash? Published websites will go offline. Files are kept so you can restore the project.`,
      label: "Move to Trash",
      run: async () => {
        await api(
          "/api/projects/" + target.id,
          json("DELETE", { name: target.name }),
        );
        const items = await api("/api/projects");
        setNav(items.projects);
        setSearch("");
        selectProject(items.projects[0]?.id || "");
        setNotice("Project moved to Trash. Its websites are offline.");
      },
    });
  }
  function deleteDesign(design: Design) {
    setConfirmation({
      title: "Delete design?",
      message: `Move “${design.name}” to Design Trash? Its website and preview links will go offline. Uploaded files are kept so you can restore it.`,
      label: "Move to Design Trash",
      run: async () => {
        await api(
          "/api/library",
          json("DELETE", {
            id: design.id,
            name: design.name,
            expectedRevision: design.revision,
          }),
        );
        await refresh();
        setNotice("Design moved to Trash. Its website is offline.");
      },
    });
  }
  const visible = designs.filter(
    (d) => filter === "All" || d.status === filter,
  );
  return (
    <div className="desk-shell">
      <aside className={"desk-sidebar " + (menu ? "is-open" : "")}>
        <div className="brand">
          <span className="brandmark">
            <Layers3 size={20} />
          </span>
          <div>
            Launch<span className="brand-secondary">Design desk</span>
          </div>
        </div>
        <div className="nav-content">
          <div className="nav-label">
            PROJECT LIBRARY <span>{nav.length}</span>
          </div>
          <div className="project-library-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                setProjectEditor({ project: null });
                setMenu(false);
              }}
            >
              <Plus size={16} />
              Add project
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const items = await api("/api/projects?trash=1");
                  setTrash(items.projects);
                  setMenu(false);
                })
              }
            >
              <Trash2 size={15} />
              Trash
            </button>
          </div>
          <div className="project-search">
            <Search size={15} />
            <input
              aria-label="Find a project"
              placeholder="Find a project"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <nav aria-label="Projects">
            {nav
              .filter((p) =>
                p.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((p) => (
                <button
                  key={p.id}
                  disabled={busy}
                  className={
                    "project-button " + (p.id === selected ? "active" : "")
                  }
                  onClick={() => switchProject(p.id)}
                >
                  <span className="project-name">
                    {p.name}
                    <small>{p.window}</small>
                  </span>
                  <span className="count">{p.count}</span>
                </button>
              ))}
          </nav>
        </div>
        <div className="nav-footer">
          <span className="workspace-avatar">LD</span>
          <div>
            Design workspace<small title={loginName}>{loginName}</small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={() => {
              const logout = async () => {
                await api("/api/auth/logout", { method: "POST" });
                window.location.assign("/login");
              };
              void action(logout);
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Toggle projects"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={18} />
            </button>
            <span>Project library</span>
            <span className="slash">/</span>
            <strong>{project?.name || "Design desk"}</strong>
          </div>
          <span className="workspace-label">
            <span className="status-dot" />
            Design workspace
          </span>
        </header>
        <div className="page-content workflow-page">
          {error && (
            <div className="message error" role="alert">
              {error}
              <button type="button" onClick={() => void load()}>
                Reload workspace
              </button>
            </div>
          )}
          {notice && (
            <div className="message" role="status">
              {notice}
            </div>
          )}
          {!loading && !project && !error && nav.length === 0 ? (
            <section className="empty-state">
              <h1>Your project library is empty</h1>
              <p>
                Add a project to start organising designs, or restore one from
                Trash.
              </p>
              <button
                className="primary"
                onClick={() => setProjectEditor({ project: null })}
              >
                <Plus size={16} />
                Add project
              </button>
            </section>
          ) : loading || !project ? (
            <section className="loading-project">
              <h2>
                {error
                  ? "Workspace could not be loaded"
                  : "Loading project workspace…"}
              </h2>
            </section>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">PROJECT WORKSPACE</div>
                  <h1>{project.name}</h1>
                  <p>
                    {project.site}
                    <span className="separator">·</span>
                    {project.developer}
                  </p>
                </div>
                <div className="project-heading-meta">
                  <div className="project-heading-actions">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => setProjectEditor({ project })}
                    >
                      <Pencil size={14} />
                      Edit project
                    </button>
                    <button
                      className="secondary danger"
                      disabled={busy}
                      onClick={deleteProject}
                    >
                      <Trash2 size={14} />
                      Delete project
                    </button>
                  </div>
                  <span
                    className={
                      "launch-pill " +
                      (/^launched\b/i.test(project.window) ? "launched" : "")
                    }
                  >
                    {project.window}
                  </span>
                  <div className="last-project-updated">
                    Last project updated<strong>{date(project.updated)}</strong>
                  </div>
                </div>
              </div>
              <section className="design-section">
                <div className="block-heading">
                  <div className="heading-with-icon">
                    <span className="section-icon">
                      <Layers3 size={19} />
                    </span>
                    <div>
                      <h2>
                        Design library <span>{designs.length}</span>
                      </h2>
                      <p>Keep each website design and its files together.</p>
                    </div>
                  </div>
                  <div className="design-library-actions">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const items = await api(
                            "/api/library?project=" + project.id + "&trash=1",
                          );
                          setDesignTrash({ project, designs: items.designs });
                        })
                      }
                    >
                      <Trash2 size={15} />
                      Design Trash
                    </button>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => setEditor({})}
                    >
                      <Plus size={16} />
                      Add design
                    </button>
                  </div>
                </div>
                <div className="library-toolbar">
                  <div className="library-count">
                    <strong>{designs.length}</strong> unique designs{" "}
                    <span className="toolbar-divider" />
                    <span>
                      {designs.filter((d) => d.status === "Active").length}{" "}
                      active
                    </span>
                    <span>
                      {designs.filter((d) => d.status === "Suspended").length}{" "}
                      suspended
                    </span>
                  </div>
                  <select
                    aria-label="Filter designs by use status"
                    className="status-filter"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    {["All", ...statuses].map((s) => (
                      <option key={s} value={s}>
                        {s === "All" ? "All statuses" : s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="table-scroll">
                  <table className="design-table">
                    <thead>
                      <tr>
                        <th>Design</th>
                        <th>Use status</th>
                        <th>Website</th>
                        <th>Last updated</th>
                        <th className="align-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <div className="design-name">
                              <span className="design-icon">
                                <FileCode2 size={20} />
                              </span>
                              <div>
                                <button
                                  className="design-title"
                                  disabled={busy}
                                  onClick={() => setEditor(d)}
                                >
                                  {d.name}
                                </button>
                                <small>
                                  {d.format}
                                  {d.entryPoint
                                    ? " · " + d.entries.length + " files"
                                    : ""}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <select
                              aria-label={"Use status for " + d.name}
                              className={
                                "status-select status-" + d.status.toLowerCase()
                              }
                              value={d.status}
                              disabled={busy}
                              onChange={(e) =>
                                void action(async () => {
                                  await api(
                                    "/api/library",
                                    json("PATCH", {
                                      id: d.id,
                                      status: e.target.value,
                                    }),
                                  );
                                  await refresh();
                                })
                              }
                            >
                              {statuses.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {d.revision ? (
                              <span className="website-state">
                                {d.published ? "Live" : "Offline"}
                              </span>
                            ) : (
                              <span className="muted">Linked design</span>
                            )}
                          </td>
                          <td className="updated">{date(d.updated)}</td>
                          <td>
                            <div className="row-actions">
                              {d.revision > 0 && (
                                <button
                                  className="secondary compact"
                                  disabled={busy}
                                  aria-label={"Files for " + d.name}
                                  onClick={() => setFileEditor(d)}
                                >
                                  <FolderOpen size={14} />
                                  Files
                                </button>
                              )}
                              {d.revision > 0 && (
                                <button
                                  className="secondary compact"
                                  disabled={busy}
                                  title="Preview website"
                                  onClick={() =>
                                    void action(async () => {
                                      const result = await api(
                                        "/api/preview",
                                        json("POST", {
                                          id: d.id,
                                          revision: d.revision,
                                        }),
                                      );
                                      setPreview({
                                        design: d,
                                        url: result.url,
                                      });
                                    })
                                  }
                                >
                                  <Eye size={14} />
                                  Preview
                                </button>
                              )}
                              {(d.liveUrl || d.url) && (
                                <a
                                  className="icon-button"
                                  href={d.liveUrl || d.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={"Open " + d.name}
                                >
                                  <ExternalLink size={16} />
                                </a>
                              )}
                              <button
                                className="icon-button"
                                disabled={busy}
                                aria-label={"Edit " + d.name}
                                onClick={() => setEditor(d)}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                className="secondary compact danger"
                                disabled={busy}
                                aria-label={"Delete " + d.name}
                                onClick={() => deleteDesign(d)}
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!visible.length && (
                  <div className="empty-state compact-empty">
                    <div className="empty-icon">
                      <FileCode2 size={26} />
                    </div>
                    <h3>
                      {designs.length
                        ? "No " + filter.toLowerCase() + " designs"
                        : "Your next design starts here."}
                    </h3>
                    <p>
                      {designs.length
                        ? "Choose another status to see more designs."
                        : "Upload a website ZIP or folder. Keep different designs as separate records; replace files to update a design."}
                    </p>
                    {!designs.length && (
                      <button
                        className="secondary"
                        onClick={() => setEditor({})}
                      >
                        <Plus size={15} />
                        Add your first design
                      </button>
                    )}
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    {visible.length} of {designs.length} designs
                  </span>
                  <span>
                    Status labels organise designs. Use Unpublish to take a
                    website offline.
                  </span>
                </div>
              </section>
              {editor && (
                <UploadEditor
                  design={editor}
                  project={project}
                  onClose={() => setEditor(null)}
                  onSaved={async () => {
                    await refresh();
                    setNotice("Design saved.");
                  }}
                />
              )}
              {preview && (
                <Modal
                  title={preview.design.name}
                  onClose={() => setPreview(null)}
                  wide
                  busy={busy}
                >
                  <iframe
                    title={"Preview " + preview.design.name}
                    src={preview.url}
                    className="website-preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                    referrerPolicy="no-referrer"
                  />
                  <div className="preview-actions">
                    <a
                      className="secondary"
                      href={preview.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open preview <ExternalLink size={14} />
                    </a>
                    <span>File replacements update the same website URL.</span>
                    {preview.design.published && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          setConfirmation({
                            title: "Unpublish website?",
                            message:
                              "This website will go offline. Its files will remain available.",
                            label: "Unpublish",
                            run: async () => {
                              await api(
                                "/api/publish",
                                json("DELETE", { id: preview.design.id }),
                              );
                              await refresh();
                              setPreview(null);
                              setNotice("Website unpublished.");
                            },
                          });
                        }}
                      >
                        Unpublish
                      </button>
                    )}
                    {!preview.design.published && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await api(
                              "/api/publish",
                              json("POST", {
                                id: preview.design.id,
                                revision: preview.design.revision,
                              }),
                            );
                            await refresh();
                            setPreview(null);
                            setNotice(
                              "Website published. Open it using the link in its design row.",
                            );
                          })
                        }
                      >
                        {busy ? "Publishing…" : "Publish website"}
                      </button>
                    )}
                  </div>
                  {error && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                </Modal>
              )}
            </>
          )}
        </div>
      </main>
      {projectEditor && (
        <ProjectEditor
          project={projectEditor.project}
          onClose={() => setProjectEditor(null)}
          onSaved={projectSaved}
        />
      )}
      {trash && (
        <Modal title="Project Trash" onClose={() => setTrash(null)} busy={busy}>
          <p className="dialog-subtitle">
            Restore projects with their designs and files. Websites stay offline
            until you publish them again.
          </p>
          {!trash.length ? (
            <p>Trash is empty.</p>
          ) : (
            <ul className="trash-list">
              {trash.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.count} designs</small>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const restored = await api(
                          "/api/projects/" + p.id + "/restore",
                          { method: "POST" },
                        );
                        await projectSaved(restored);
                        setTrash(null);
                        setNotice(
                          "Project restored. Publish its websites when ready.",
                        );
                      })
                    }
                  >
                    <RotateCcw size={14} />
                    Restore {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </Modal>
      )}
      {fileEditor && (
        <DesignFiles
          design={fileEditor}
          onClose={() => setFileEditor(null)}
          onSaved={async () => {
            await refresh();
            setNotice("File replaced. The website keeps the same URL.");
          }}
        />
      )}
      {designTrash && (
        <Modal
          title="Design Trash"
          onClose={() => setDesignTrash(null)}
          busy={busy}
        >
          <p className="dialog-subtitle">
            {designTrash.project.name} · Restore designs with their uploaded
            files. Websites stay offline until you publish them again.
          </p>
          {!designTrash.designs.length ? (
            <p>No deleted designs in this project.</p>
          ) : (
            <ul className="trash-list">
              {designTrash.designs.map((d) => (
                <li key={d.id}>
                  <div>
                    <strong>{d.name}</strong>
                    <small>
                      {d.format} ·{" "}
                      {d.revision ? "Website files" : "Linked design"}
                    </small>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await api("/api/library/" + d.id + "/restore", {
                          method: "POST",
                        });
                        await refresh();
                        setDesignTrash(null);
                        setFilter("All");
                        setNotice(
                          "Design restored. Publish its website when ready.",
                        );
                      })
                    }
                  >
                    <RotateCcw size={14} />
                    Restore {d.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={confirmation.title}
          onClose={() => setConfirmation(null)}
          busy={busy}
        >
          <p className="dialog-subtitle">{confirmation.message}</p>
          <div className="confirmation-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </button>
            <button
              className="primary danger"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await confirmation.run();
                  setConfirmation(null);
                })
              }
            >
              {busy ? "Working…" : confirmation.label}
            </button>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
