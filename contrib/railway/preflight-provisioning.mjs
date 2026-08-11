#!/usr/bin/env node

/**
 * Verifies that local, uncommitted credentials can provision tpot-world.
 * It performs read-only requests and intentionally never prints token values.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const directory = dirname(fileURLToPath(import.meta.url));
const credentialsPath = join(directory, ".env.provisioning");

if (!existsSync(credentialsPath)) {
    fail(
        `Missing ${credentialsPath}. Copy .env.provisioning.example and fill it locally.`,
    );
}

const credentials = parseDotenv(readFileSync(credentialsPath, "utf8"));
const railwayToken = requireValue(credentials, "RAILWAY_TOKEN");
const cloudflareToken = requireValue(credentials, "CLOUDFLARE_API_TOKEN");

const railway = await railwayRequest(railwayToken, {
    query: "query { me { name } }",
});

if (railway.errors || !railway.data?.me?.name) {
    fail(
        "RAILWAY_TOKEN is not an account token. Create an account-level Railway token; the existing Memex project token is insufficient.",
    );
}

const zones = await cloudflareRequest(
    cloudflareToken,
    "/zones?name=tpot.world&status=active",
);
const zone = zones.result?.[0];
if (!zones.success || !zone?.id) {
    fail(
        "Cloudflare cannot read an active tpot.world zone. Check nameserver propagation and token Zone:Read scope.",
    );
}

const dns = await cloudflareRequest(
    cloudflareToken,
    `/zones/${zone.id}/dns_records?per_page=1`,
);
if (!dns.success) {
    fail("Cloudflare token cannot read DNS records. Add Zone:DNS:Edit scope.");
}

const ssl = await cloudflareRequest(
    cloudflareToken,
    `/zones/${zone.id}/settings/ssl`,
);
if (!ssl.success) {
    fail("Cloudflare token cannot read zone settings. Add Zone Settings:Edit scope.");
}

console.log("Credential preflight passed.");
console.log(`Railway account: ${railway.data.me.name}`);
console.log(`Cloudflare zone: ${zone.name} (${zone.status})`);
console.log(`Cloudflare SSL mode: ${ssl.result?.value ?? "unknown"}`);

function parseDotenv(source) {
    const values = {};
    for (const line of source.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const separator = trimmed.indexOf("=");
        if (separator < 1) continue;
        const key = trimmed.slice(0, separator).trim();
        const raw = trimmed.slice(separator + 1).trim();
        values[key] = raw.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2");
    }
    return values;
}

function requireValue(values, key) {
    const value = values[key];
    if (!value) fail(`Missing ${key} in ${credentialsPath}.`);
    return value;
}

async function railwayRequest(token, body) {
    return requestJson("https://backboard.railway.com/graphql/v2", [
        "-H",
        `Authorization: Bearer ${token}`,
        "-H",
        "Content-Type: application/json",
        "--data",
        JSON.stringify(body),
    ]);
}

async function cloudflareRequest(token, path) {
    return requestJson(`https://api.cloudflare.com/client/v4${path}`, [
        "-H",
        `Authorization: Bearer ${token}`,
        "-H",
        "Content-Type: application/json",
    ]);
}

async function requestJson(url, arguments_) {
    const result = spawnSync("curl", ["-fsS", url, ...arguments_], {
        encoding: "utf8",
    });
    if (result.status !== 0) {
        fail(`Credential check failed: ${result.stderr.trim() || "network request failed"}`);
    }
    try {
        return JSON.parse(result.stdout);
    } catch {
        fail("Credential check returned an invalid JSON response.");
    }
}

function fail(message) {
    console.error(`Preflight failed: ${message}`);
    process.exit(1);
}
