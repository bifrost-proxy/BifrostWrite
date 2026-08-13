import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", "node_modules", "target", "vendor"]);
const telemetryPackages = [
    "airbrake",
    "amplitude",
    "appcenter",
    "appsignal",
    "bugsnag",
    "countly",
    "crashlytics",
    "datadog",
    "firebase-analytics",
    "google-analytics",
    "honeycomb",
    "matomo",
    "mixpanel",
    "newrelic",
    "opentelemetry",
    "plausible",
    "posthog",
    "raygun",
    "rollbar",
    "segment",
    "sentry",
    "statsig",
    "telemetrydeck",
];

function isTelemetryPackage(name) {
    const normalized = name.toLowerCase();
    return telemetryPackages.some(
        (candidate) =>
            normalized === candidate ||
            normalized.startsWith(`${candidate}-`) ||
            normalized.includes(`/${candidate}`) ||
            normalized.includes(`@${candidate}`),
    );
}

async function collectManifests(directory, manifests = []) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!ignoredDirectories.has(entry.name)) {
                await collectManifests(path.join(directory, entry.name), manifests);
            }
            continue;
        }
        if (entry.name === "package.json" || entry.name === "Cargo.toml") {
            manifests.push(path.join(directory, entry.name));
        }
    }
    return manifests;
}

function packageJsonDependencies(contents) {
    const manifest = JSON.parse(contents);
    return [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.optionalDependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
    ];
}

function cargoDependencies(contents) {
    const dependencies = [];
    let inDependencySection = false;
    for (const line of contents.split(/\r?\n/u)) {
        const section = line.match(/^\s*\[([^\]]+)\]\s*$/u)?.[1];
        if (section) {
            inDependencySection =
                section === "dependencies" ||
                section === "dev-dependencies" ||
                section === "build-dependencies" ||
                section.endsWith(".dependencies") ||
                section.endsWith(".dev-dependencies") ||
                section.endsWith(".build-dependencies");
            continue;
        }
        if (!inDependencySection || line.trimStart().startsWith("#")) continue;
        const name = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/u)?.[1];
        if (name) dependencies.push(name);
    }
    return dependencies;
}

const violations = [];
for (const manifestPath of await collectManifests(repositoryRoot)) {
    const contents = await readFile(manifestPath, "utf8");
    const dependencies = manifestPath.endsWith("package.json")
        ? packageJsonDependencies(contents)
        : cargoDependencies(contents);
    for (const dependency of dependencies) {
        if (isTelemetryPackage(dependency)) {
            violations.push(
                `${path.relative(repositoryRoot, manifestPath)}: ${dependency}`,
            );
        }
    }
}

if (violations.length > 0) {
    console.error("Telemetry dependencies are not allowed in BifrostWrite:");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
} else {
    console.log("No direct telemetry dependencies found.");
}
