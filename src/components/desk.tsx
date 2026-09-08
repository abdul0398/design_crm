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
  Users,
  LogOut,
  X,
  Upload,
  Building2,
  Save,
  Menu,
} from "lucide-react";
import {
  agencies,
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
        {project.name} · Keep each website and its files together.
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
          <details className="template-help">
            <summary>Connect HTML to saved project & client details</summary>
            <p>
              Use these fields in HTML text or quoted attributes. Save project
              details before previewing or publishing.
            </p>
            <div>
              {[
                "project_name",
                "project_location",
                "developer",
                "total_units",
                "project_information",
                "client_name",
                "mobile",
                "cea",
                "agency_name",
                "agency_licence",
                "agency_address",
              ].map((k) => (
                <code key={k}>{"{{" + k + "}}"}</code>
              ))}
            </div>
          </details>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="primary save" disabled={busy}>
            {busy
              ? "Saving…"
              : selection
                ? "Save website revision"
                : "Save design"}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
export default function Desk({ email }: { email: string }) {
  const [nav, setNav] = useState<ProjectNav[]>([]),
    [selected, setSelected] = useState("amberwood"),
    [project, setProject] = useState<Project | null>(null),
    [saved, setSaved] = useState(""),
    [designs, setDesigns] = useState<Design[]>([]),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [editor, setEditor] = useState<Partial<Design> | null>(null),
    [preview, setPreview] = useState<{ design: Design; url: string } | null>(
      null,
    ),
    [menu, setMenu] = useState(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const dirty = !!project && JSON.stringify(project) !== saved;
  const refresh = useCallback(async () => {
    const id = selected;
    const [library, items] = await Promise.all([
      api("/api/library?project=" + id),
      api("/api/projects"),
    ]);
    if (selectedRef.current === id) setDesigns(library.designs);
    setNav(items.projects);
  }, [selected]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const id = selected;
      const [p] = await Promise.all([api("/api/projects/" + id), refresh()]);
      if (selectedRef.current === id) {
        setProject(p);
        setSaved(JSON.stringify(p));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (selectedRef.current === selected) setLoading(false);
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
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
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
  function switchProject(id: string) {
    if (id === selected) return;
    if (dirty && !window.confirm("Discard unsaved project and client changes?"))
      return;
    setSelected(id);
    setProject(null);
    setFilter("All");
    setNotice("");
    setMenu(false);
  }
  async function saveProject(e: FormEvent) {
    e.preventDefault();
    if (!project) return;
    await action(async () => {
      const p = await api("/api/projects/" + project.id, json("PUT", project));
      setProject(p);
      setSaved(JSON.stringify(p));
      setNotice("Project and client details saved.");
    });
  }
  const visible = designs.filter(
      (d) => filter === "All" || d.status === filter,
    ),
    agency =
      agencies.find((a) => a.id === project?.client.agency) || agencies[0];
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
            Agency workspace<small title={email}>{email}</small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={() => {
              if (
                dirty &&
                !window.confirm("Discard unsaved changes and sign out?")
              )
                return;
              void action(async () => {
                await api("/api/auth/logout", { method: "POST" });
                window.location.assign("/login");
              });
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
            Agency workspace
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
          {loading || !project ? (
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
                  <span
                    className={
                      "launch-pill " +
                      (project.id === "dunearn" ? "launched" : "")
                    }
                  >
                    {project.window}
                  </span>
                  <div className="last-project-updated">
                    Last project updated<strong>{date(project.updated)}</strong>
                  </div>
                </div>
              </div>
              <div className="folder-row">
                <FolderOpen size={20} />
                <strong>Project folder</strong>
                <span className="folder-link">
                  {project.folderUrl ||
                    "Add a shared folder link in project details below."}
                </span>
                {project.folderUrl && (
                  <a
                    className="secondary"
                    href={project.folderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open folder <ExternalLink size={14} />
                  </a>
                )}
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
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => setEditor({})}
                  >
                    <Plus size={16} />
                    Add design
                  </button>
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
                        <th>Website revision</th>
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
                              <div className="revision-label">
                                <strong>Revision {d.revision}</strong>
                                <small>
                                  {d.publishedRevision === d.revision
                                    ? "Published"
                                    : d.publishedRevision
                                      ? "New revision · Not published"
                                      : "Ready to preview"}
                                </small>
                              </div>
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
                                  disabled={busy || dirty}
                                  title={
                                    dirty
                                      ? "Save changes before previewing"
                                      : "Preview website"
                                  }
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
                {dirty && (
                  <p className="unsaved-hint">
                    Save project and client changes before previewing or
                    publishing.
                  </p>
                )}
              </section>
              <form onSubmit={saveProject}>
                <fieldset disabled={busy}>
                  <section className="client-section">
                    <div className="block-heading">
                      <div className="heading-with-icon">
                        <span className="section-icon">
                          <Building2 size={19} />
                        </span>
                        <div>
                          <h2>Project details</h2>
                          <p>Details used by your website templates.</p>
                        </div>
                      </div>
                      <span
                        className={"save-indicator " + (dirty ? "unsaved" : "")}
                      >
                        {dirty ? "Unsaved changes" : "Saved details"}
                      </span>
                    </div>
                    <div className="project-edit-grid">
                      <label>
                        Total units
                        <input
                          maxLength={30}
                          value={project.units}
                          onChange={(e) =>
                            setProject({ ...project, units: e.target.value })
                          }
                          placeholder="Enter total units"
                        />
                      </label>
                      <label>
                        Shared folder link
                        <input
                          type="url"
                          maxLength={2048}
                          value={project.folderUrl}
                          onChange={(e) =>
                            setProject({
                              ...project,
                              folderUrl: e.target.value,
                            })
                          }
                          placeholder="https://drive.google.com/..."
                        />
                      </label>
                      <label className="full-width">
                        Project information
                        <textarea
                          rows={3}
                          maxLength={10000}
                          value={project.details}
                          onChange={(e) =>
                            setProject({ ...project, details: e.target.value })
                          }
                          placeholder="Key facts, location and project notes"
                        />
                      </label>
                    </div>
                  </section>
                  <section className="client-section">
                    <div className="block-heading">
                      <div className="heading-with-icon">
                        <span className="section-icon">
                          <Users size={19} />
                        </span>
                        <div>
                          <h2>Client & agency</h2>
                          <p>Saved contact details for {project.name}.</p>
                        </div>
                      </div>
                    </div>
                    <div className="client-layout">
                      <div className="client-fields">
                        <div className="form-section-label">CLIENT DETAILS</div>
                        <label>
                          Client / agent name
                          <input
                            maxLength={100}
                            value={project.client.name}
                            onChange={(e) =>
                              setProject({
                                ...project,
                                client: {
                                  ...project.client,
                                  name: e.target.value,
                                },
                              })
                            }
                            placeholder="Enter full name"
                          />
                        </label>
                        <div className="field-row">
                          <label>
                            Mobile number
                            <input
                              type="tel"
                              maxLength={24}
                              value={project.client.mobile}
                              onChange={(e) =>
                                setProject({
                                  ...project,
                                  client: {
                                    ...project.client,
                                    mobile: e.target.value,
                                  },
                                })
                              }
                              placeholder="+65 9123 4567"
                            />
                          </label>
                          <label>
                            CEA registration
                            <input
                              maxLength={8}
                              pattern="[Rr][0-9]{6}[A-Za-z]"
                              value={project.client.cea}
                              onChange={(e) =>
                                setProject({
                                  ...project,
                                  client: {
                                    ...project.client,
                                    cea: e.target.value.toUpperCase(),
                                  },
                                })
                              }
                              placeholder="R012345A"
                            />
                          </label>
                        </div>
                        <label>
                          Agency
                          <select
                            value={project.client.agency}
                            onChange={(e) =>
                              setProject({
                                ...project,
                                client: {
                                  ...project.client,
                                  agency: e.target.value,
                                },
                              })
                            }
                          >
                            {agencies.map((a) => (
                              <option key={a.id}>{a.id}</option>
                            ))}
                          </select>
                        </label>
                        <div className="agency-line">
                          <Building2 size={16} />
                          <div>
                            <strong>{agency.name}</strong>
                            <span>{agency.licence}</span>
                          </div>
                        </div>
                      </div>
                      <div className="preview-column">
                        <div className="form-section-label">
                          CONTACT PREVIEW <span>Updates as you type</span>
                        </div>
                        <div className="client-preview-card">
                          <div className="preview-card-top">
                            <span className="client-avatar">
                              {project.client.name
                                .trim()
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((s) => s[0])
                                .join("")
                                .toUpperCase() || <Users size={22} />}
                            </span>
                            <span className="agency-wordmark">{agency.id}</span>
                          </div>
                          <h3>{project.client.name || "Client name"}</h3>
                          <div className="preview-contact">
                            {project.client.mobile || "Mobile number"}
                            <span className="cea-pill">
                              {project.client.cea || "CEA registration"}
                            </span>
                          </div>
                          <div className="preview-agency">
                            <strong>
                              {agency.name} ({agency.licence})
                            </strong>
                            <p>{agency.address}</p>
                          </div>
                        </div>
                        <p className="preview-caption">
                          Saved details are filled into website previews and
                          publication snapshots.
                        </p>
                      </div>
                    </div>
                    <div className="panel-actions">
                      <span>
                        Agency licence and address are filled automatically.
                      </span>
                      <button
                        type="submit"
                        className="primary"
                        disabled={!dirty || busy}
                      >
                        <Save size={15} />
                        {busy ? "Saving…" : "Save project & client details"}
                      </button>
                    </div>
                  </section>
                </fieldset>
              </form>
              <footer className="workspace-footnote">
                Project and agency information imported from your supplied
                design.
              </footer>
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
                  title={
                    preview.design.name +
                    " · Revision " +
                    preview.design.revision
                  }
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
                    <span>
                      Publishing uses the saved project and client details.
                    </span>
                    {preview.design.published && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("Take this website offline?"))
                            void action(async () => {
                              await api(
                                "/api/publish",
                                json("DELETE", { id: preview.design.id }),
                              );
                              await refresh();
                              setPreview(null);
                              setNotice("Website unpublished.");
                            });
                        }}
                      >
                        Unpublish
                      </button>
                    )}
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
                      {busy
                        ? "Publishing…"
                        : preview.design.published
                          ? "Publish this revision"
                          : "Publish website"}
                    </button>
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
    </div>
  );
}
