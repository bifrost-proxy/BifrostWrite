import fs from "node:fs";

const [, , modeOrVersion, maybeVersion] = process.argv;
const checkOnly = modeOrVersion === "--check";
const version = checkOnly ? maybeVersion : modeOrVersion;

if (!version || !/^\d+\.\d+\.\d+(?:[.-][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("Usage: node scripts/sync-tauri-version.mjs [--check] <version>");
}

const files = [
    {
        path: "apps/desktop/package.json",
        read(value) {
            return JSON.parse(value).version;
        },
        write(value) {
            const data = JSON.parse(value);
            data.version = version;
            return `${JSON.stringify(data, null, 4)}\n`;
        },
    },
    {
        path: "apps/desktop/package-lock.json",
        read(value) {
            const data = JSON.parse(value);
            const rootVersion = data.packages?.[""]?.version;
            return data.version === rootVersion ? data.version : null;
        },
        write(value) {
            const data = JSON.parse(value);
            data.version = version;
            if (data.packages?.[""]) {
                data.packages[""].version = version;
            }
            return `${JSON.stringify(data, null, 4)}\n`;
        },
    },
    {
        path: "apps/desktop/src-tauri/tauri.conf.json",
        read(value) {
            return JSON.parse(value).version;
        },
        write(value) {
            const data = JSON.parse(value);
            data.version = version;
            return `${JSON.stringify(data, null, 2)}\n`;
        },
    },
    {
        path: "apps/desktop/src-tauri/Cargo.toml",
        read(value) {
            return value.match(/^version = "([^"]+)"/m)?.[1];
        },
        write(value) {
            return value.replace(/^version = "[^"]+"/m, `version = "${version}"`);
        },
    },
    {
        path: "apps/desktop/native-backend/Cargo.toml",
        read(value) {
            return value.match(/^version = "([^"]+)"/m)?.[1];
        },
        write(value) {
            return value.replace(/^version = "[^"]+"/m, `version = "${version}"`);
        },
    },
];

for (const file of files) {
    const value = fs.readFileSync(file.path, "utf8");
    const current = file.read(value);
    if (checkOnly) {
        if (current !== version) {
            throw new Error(`${file.path} has version ${current}, expected ${version}`);
        }
    } else {
        fs.writeFileSync(file.path, file.write(value));
    }
}

console.log(`${checkOnly ? "Validated" : "Updated"} BifrostWrite version ${version}`);
