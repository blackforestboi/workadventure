function normalizePathname(pathname: string): string {
    if (pathname === "/") {
        return "";
    }
    return pathname.replace(/\/+$/, "");
}

export function getFrontendBasePath(): string {
    const frontUrl = window.env.FRONT_URL;
    if (!frontUrl) {
        return "";
    }

    try {
        return normalizePathname(new URL(frontUrl, window.location.origin).pathname);
    } catch {
        return "";
    }
}

export function stripFrontendBasePath(pathname: string): string {
    const basePath = getFrontendBasePath();
    if (basePath === "") {
        return pathname;
    }
    if (pathname === basePath || pathname === `${basePath}/`) {
        return "/";
    }
    return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
}

export function prependFrontendBasePath(pathname: string): string {
    const basePath = getFrontendBasePath();
    if (basePath === "" || pathname === basePath || pathname.startsWith(`${basePath}/`)) {
        return pathname;
    }
    return `${basePath}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export function getFrontendServiceWorkerScope(): string {
    return `${getFrontendBasePath()}/`;
}
