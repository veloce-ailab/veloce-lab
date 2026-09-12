/**
 * A Hirari loader plugin for development.
 *
 * In development a package is loaded from the file it is written in rather than
 * the file it is published as: `package.json`'s `dev` field names that source,
 * and this plugin resolves the workspace packages to it. A build is then only
 * needed for publishing, not for running.
 *
 * It also makes a reload reload. Yumeri disposes a plugin and imports it again
 * when one of its files changes, but an ES module is cached by URL, so the
 * second import would return the first module and the plugin would be applied
 * again with the code it already had. Each time Yumeri imports a workspace
 * package this bumps that package's generation and serves its files under a
 * URL carrying it, so a reload re-reads them.
 *
 * Only the reloaded package's own files are versioned. Its imports of other
 * packages keep their identity, so shared classes stay one class.
 */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const scope = "@velocelab/";
const workspaceRoot = path.resolve(process.env.HIRARI_WORKSPACE ?? process.cwd());
const sourceExtensions = [".ts", ".tsx", ".mts", ".cts", ".jsx", ".js", ".mjs", ".cjs"];
const buildExtensions = /\.(js|mjs|cjs|jsx)$/;
const packageDirectories = new Map();
const generations = new Map();
/** The URL a package was last loaded from, so its importers share that module. */
const loadedFrom = new Map();

function packageDirectory(name) {
  if (packageDirectories.has(name)) return packageDirectories.get(name);
  let directory = null;
  try {
    directory = path.dirname(require.resolve(`${name}/package.json`, { paths: [workspaceRoot] }));
  } catch {
    // A package with an exports map that does not publish its manifest still
    // has one on disk; find it through the entry it does publish.
    try {
      let current = path.dirname(require.resolve(name, { paths: [workspaceRoot] }));
      while (current !== path.dirname(current) && !fs.existsSync(path.join(current, "package.json"))) {
        current = path.dirname(current);
      }
      directory = fs.existsSync(path.join(current, "package.json")) ? current : null;
    } catch {
      directory = null;
    }
  }
  packageDirectories.set(name, directory);
  return directory;
}

/** The file a package is written in, which is what development should run. */
function sourceEntry(directory) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  } catch {
    return null;
  }
  for (const candidate of [manifest.dev, manifest.module, manifest.main]) {
    if (typeof candidate !== "string") continue;
    const file = path.join(directory, candidate);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Sources are written as they will build, so `./routes.js` has to find
 * `routes.ts` while the file is still a source.
 */
function resolveFrom(base) {
  if (isFile(base)) return base;
  const withoutRuntimeExtension = base.replace(buildExtensions, "");
  if (withoutRuntimeExtension !== base) {
    for (const extension of sourceExtensions) {
      if (isFile(withoutRuntimeExtension + extension)) return withoutRuntimeExtension + extension;
    }
  }
  for (const extension of sourceExtensions) {
    const index = path.join(base, `index${extension}`);
    if (isFile(index)) return index;
  }
  return null;
}

function generationOf(file) {
  for (const [directory, generation] of generations) {
    if (file === directory || file.startsWith(directory + path.sep)) return generation;
  }
  return null;
}

function inWorkspace(file) {
  return file === workspaceRoot || file.startsWith(workspaceRoot + path.sep);
}

/**
 * Packages import each other while they load; those are ordinary imports and
 * must keep resolving to one module. Only an import from outside the packages
 * is Yumeri loading a plugin, which is where a new generation starts.
 */
function fromAnotherPackage(file) {
  return inWorkspace(file) && file.startsWith(path.join(workspaceRoot, "packages") + path.sep);
}

function versioned(file, generation) {
  if (process.env.HIRARI_DEV_DEBUG) {
    console.log(`[hirari-dev] generation ${generation} -> ${file}`);
  }
  return {
    url: `${pathToFileURL(file).href}?hirari=${generation}`,
    format: /\.(cjs|cts)$/.test(file) ? "commonjs" : "module",
  };
}

module.exports = {
  name: "@velocelab/hirari-dev",
  extensions: [],
  // Nothing is transformed here; the typescript plugins own that.
  match: () => false,
  resolve(specifier, importer) {
    if (process.env.HIRARI_DEV_DEBUG) {
      console.log(`[hirari-dev] resolve ${specifier} from ${importer ?? "(no importer)"}`);
    }
    if (typeof specifier !== "string" || !specifier || specifier.startsWith("node:")) return null;

    if (specifier.startsWith(scope)) {
      const name = specifier.split("/").slice(0, 2).join("/");
      // Subpaths keep their own resolution; only a package entry starts a load.
      if (specifier !== name) return null;
      const directory = packageDirectory(name);
      if (!directory) return null;
      // Imports between workspace packages are ordinary imports: they share the
      // module the package was loaded as, and never start a new generation.
      if (importer && fromAnotherPackage(importer)) {
        const loaded = loadedFrom.get(directory);
        if (loaded) return { url: loaded, format: "module" };
        const entry = sourceEntry(directory);
        return entry ? versioned(entry, 0) : null;
      }
      const entry = sourceEntry(directory);
      if (!entry) return null;
      const generation = (generations.get(directory) ?? 0) + 1;
      generations.set(directory, generation);
      const resolved = versioned(entry, generation);
      loadedFrom.set(directory, resolved.url);
      return resolved;
    }

    if (!importer || !inWorkspace(importer)) return null;
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
    const generation = generationOf(importer);
    if (generation === null) return null;
    const file = resolveFrom(path.resolve(path.dirname(importer), specifier));
    if (!file) return null;
    return versioned(file, generation);
  },
};
