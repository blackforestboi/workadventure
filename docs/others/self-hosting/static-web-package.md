# Package the browser build for another website

The `package:web` command turns the current checkout into a local npm dependency containing the compiled Play browser files. It deliberately packages the browser shell only: room state, WebSockets, authentication, APIs, map storage, uploads, icons, MCP, and agent services remain separately hosted services.

## Build the dependency

From the repository root, run:

```console
npm ci
npm run package:web -- --config contrib/docker/instance.config.json
```

If no `--config` is supplied, the command uses `contrib/docker/instance.config.json` when present and otherwise the checked-in example. The selected `publicOrigin`, `frontendBasePath`, branding, email, favicon, loading logo, other assets, and service URLs are baked into the browser bootstrap. Rebuild once per domain/environment.

Site-specific configuration can live in the consuming website repository. Pass
its absolute or relative path to the package command:

```console
npm run package:web -- --config /path/to/website/config/tpot-maps.instance.json
```

A profile with `frontendBasePath` set to `/play` emits the game shell at
`public/play/index.html`, Vite assets at `public/play/assets/`, and the manifest
at `public/play/manifest.webmanifest`.

The command writes:

- `artifacts/tpot-maps-web/`: a stable, unpacked package for local development.
- `artifacts/tpot-maps-web-build-<version>.tgz`: a versioned snapshot suitable for a lockfile and deployment.
- `artifacts/tpot-maps-web.tgz`: a mutable convenience copy of the newest snapshot.

`build-info.json` records the Git revision, dirty flag, and a content fingerprint covering tracked changes and non-ignored untracked files. This means an uncommitted working tree can be packaged without pretending it is the clean commit.

By default, `window.capabilities` is `{}`. To deliberately bake a public capability snapshot without contacting a live admin service, pass `--capabilities path/to/capabilities.json`.

## Consume it from a website build

Use the stable directory during local development:

```json
{
  "dependencies": {
    "@tpot-maps/web-build": "file:../tpot-maps/workadventure/artifacts/tpot-maps-web"
  }
}
```

For a deployment, point the dependency at a versioned `.tgz` instead. Run `npm install` after rebuilding so the website's lockfile and installed package pick up the new version. In the website build, copy the dependency's `public/` overlay into the website output root; for example:

```console
mkdir -p dist
cp -R node_modules/@tpot-maps/web-build/public/. dist/
```

The generated Vite shell and hashed assets use `frontendBasePath`. Intentional public resources such as `/static`, `/collections`, `/resources`, and the service-worker scripts remain at the domain root, so the package must be copied as an overlay rather than placing the whole package inside the subdirectory.

## Static-host and proxy contract

Configure backend proxies before the static history fallback. At minimum, preserve the routes used by your deployment, including `/ws`, `/api`, `/map-storage`, `/uploader`, `/icon`, `/mcp`, and `/teapot`. Serve real `/play/assets`, `/static`, `/collections`, and `/resources` files before applying fallbacks. For the Oliver's Tools profile, redirect `/play` to `/play/` and rewrite unmatched `/play/*` browser GET routes to `/play/index.html`.

A static shell has generic instance metadata. It does not perform FrontController's request-time room metadata, palette overrides, admin redirects, or POST-based auth-token injection. Keep those routes behind the Play server if your deployment needs those behaviors.

## Update flow

1. Update this checkout to the source state you want.
2. Keep or apply any local edits you intentionally deploy.
3. Run `npm run package:web -- --config <your-config>`.
4. Refresh the file dependency in the website (`npm install`), then run the website build.
5. Deploy the website output and the compatible backend services together.
