/* Website package upload for the local frontend prototype.
 * ZIP contents are inspected, not extracted or executed. The original archive
 * or folder files are kept locally; serving complete websites belongs to the backend.
 */
const WP_MAX_BYTES = 50 * 1024 * 1024;
const WP_MAX_FILES = 2000;

function wpSize(bytes) {
  return bytes < 1024
    ? bytes + " B"
    : bytes < 1048576
      ? (bytes / 1024).toFixed(1) + " KB"
      : (bytes / 1048576).toFixed(1) + " MB";
}

function wpPath(input) {
  if (
    !input ||
    input.includes("\\") ||
    /[\x00-\x1f]/.test(input) ||
    input.startsWith("/") ||
    /^[a-z]:/i.test(input)
  )
    throw Error("The package contains an invalid file path.");
  const parts = input.split("/");
  if (parts.some((part) => part === ".." || part === "."))
    throw Error("The package contains an unsafe file path.");
  return input;
}

function wpIgnored(path) {
  return path
    .split("/")
    .some((part) =>
      [".DS_Store", "__MACOSX", ".git", "node_modules"].includes(part),
    );
}

function wpCheckEntries(entries) {
  if (!entries.length) throw Error("This package has no website files.");
  if (entries.length > WP_MAX_FILES)
    throw Error("Choose a website with no more than 2,000 files.");
  if (entries.reduce((total, file) => total + file.size, 0) > WP_MAX_BYTES)
    throw Error("Website files must total 50 MB or less when uncompressed.");
  const names = new Set();
  for (const file of entries) {
    wpPath(file.path);
    if (names.has(file.path))
      throw Error("The package contains duplicate file paths.");
    names.add(file.path);
  }
  if (!entries.some((file) => /\.html?$/i.test(file.path)))
    throw Error(
      "No HTML page found. Choose the exported website folder or ZIP, including index.html.",
    );
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function wpZipEntries(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 22) throw Error("This is not a valid ZIP file.");
  let end = -1;
  for (
    let i = view.byteLength - 22;
    i >= Math.max(0, view.byteLength - 65557);
    i--
  ) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === view.byteLength
    ) {
      end = i;
      break;
    }
  }
  if (end < 0)
    throw Error(
      "This ZIP is incomplete or unsupported. Export a standard ZIP and try again.",
    );
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const directorySize = view.getUint32(end + 12, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count ||
    count === 65535 ||
    cursor === 0xffffffff
  )
    throw Error(
      "Split archives and ZIP64 are not supported. Choose a standard ZIP.",
    );
  if (count > WP_MAX_FILES || cursor + directorySize !== end)
    throw Error("This ZIP has too many files or an unsupported directory.");
  const entries = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw Error("The ZIP file directory is damaged.");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end) throw Error("The ZIP file directory is damaged.");
    if (flags & 1)
      throw Error("Password-protected ZIP files are not supported.");
    if (![0, 8].includes(method))
      throw Error("Use a standard ZIP with Store or Deflate compression.");
    if (size === 0xffffffff) throw Error("ZIP64 files are not supported.");
    const mode = view.getUint32(cursor + 38, true) >>> 16;
    if ((mode & 0xf000) === 0xa000)
      throw Error("Remove symbolic links before uploading the website.");
    let path;
    try {
      path = decoder.decode(new Uint8Array(buffer, cursor + 46, nameLength));
    } catch {
      throw Error("Use UTF-8 file names when exporting the ZIP.");
    }
    wpPath(path);
    if (!path.endsWith("/") && !wpIgnored(path)) entries.push({ path, size });
    cursor = next;
  }
  if (cursor !== end) throw Error("The ZIP file directory is damaged.");
  return wpCheckEntries(entries);
}

function wpDefaultEntry(entries) {
  const pages = entries.filter((file) => /\.html?$/i.test(file.path));
  return (
    [...pages].sort((a, b) => {
      const score = (path) =>
        /^index\.html?$/i.test(path)
          ? 0
          : /(^|\/)index\.html?$/i.test(path)
            ? 1
            : 2;
      return (
        score(a.path) - score(b.path) ||
        a.path.split("/").length - b.path.split("/").length ||
        a.path.localeCompare(b.path)
      );
    })[0]?.path || ""
  );
}

async function wpChooseFiles(fileList, kind) {
  const selected = Array.from(fileList || []);
  if (!selected.length) return null;
  if (kind === "zip") {
    const file = selected[0];
    if (selected.length !== 1 || !/\.zip$/i.test(file.name))
      throw Error("Choose one .zip file.");
    if (file.size > WP_MAX_BYTES) throw Error("Choose a ZIP file up to 50 MB.");
    const entries = wpZipEntries(await file.arrayBuffer());
    return {
      kind,
      name: file.name,
      size: file.size,
      entries,
      entryPoint: wpDefaultEntry(entries),
      sourceFiles: [file],
    };
  }
  if (selected.length > WP_MAX_FILES)
    throw Error("Choose a folder with no more than 2,000 files.");
  const root = selected[0].webkitRelativePath?.split("/")[0] || "Website";
  const sourceFiles = selected.filter(
    (file) => !wpIgnored(file.webkitRelativePath || file.name),
  );
  const entries = wpCheckEntries(
    sourceFiles.map((file) => ({
      path: file.webkitRelativePath || file.name,
      size: file.size,
    })),
  );
  return {
    kind,
    name: root,
    size: sourceFiles.reduce((sum, file) => sum + file.size, 0),
    entries,
    entryPoint: wpDefaultEntry(entries),
    sourceFiles,
  };
}

export { wpChooseFiles };
