import { BRANDING } from "./Branding";

const LEGACY_BRAND_PATTERN =
    /(?<![A-Za-z0-9@._/-])(?:WorkAdventures?|Workadventures?|workadventures?)(?![A-Za-z0-9._/-])/g;
const LEGACY_BRAND_URL_PATTERN = /https?:\/\/(?:play\.|docs\.)?workadventu\.re/gi;
const LEGACY_BRAND_EMAIL_PATTERN = /hello@workadventu\.re/gi;

/** Replaces legacy product-name wording and contact links in translated/server-provided UI text. */
export function replaceLegacyBrand(value: string): string {
    return value
        .replace(LEGACY_BRAND_URL_PATTERN, BRANDING.websiteUrl)
        .replace(LEGACY_BRAND_EMAIL_PATTERN, BRANDING.contactEmail)
        .replace(LEGACY_BRAND_PATTERN, BRANDING.name);
}

function isExcludedElement(element: Element): boolean {
    return element.closest("script, style, code, pre, textarea, input") !== null;
}

function rewriteTextNode(node: Text): void {
    const parentElement = node.parentElement;
    if (!parentElement || isExcludedElement(parentElement)) {
        return;
    }

    const rewritten = replaceLegacyBrand(node.data);
    if (rewritten !== node.data) {
        node.data = rewritten;
    }
}

function rewriteElementAttributes(element: Element): void {
    if (isExcludedElement(element)) {
        return;
    }

    for (const attribute of ["title", "alt", "aria-label"]) {
        const value = element.getAttribute(attribute);
        if (value === null) {
            continue;
        }

        const rewritten = replaceLegacyBrand(value);
        if (rewritten !== value) {
            element.setAttribute(attribute, rewritten);
        }
    }
}

function rewriteNode(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
        rewriteTextNode(node as Text);
        return;
    }

    if (node instanceof Element) {
        rewriteElementAttributes(node);
        for (const descendant of node.querySelectorAll("[title], [alt], [aria-label]")) {
            rewriteElementAttributes(descendant);
        }
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let textNode: Node | null = walker.nextNode();
        while (textNode) {
            rewriteTextNode(textNode as Text);
            textNode = walker.nextNode();
        }
    }
}

function applyConfiguredFavicon(): void {
    let faviconLinks = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
    if (faviconLinks.length === 0) {
        const favicon = document.createElement("link");
        favicon.rel = "icon";
        document.head.append(favicon);
        faviconLinks = [favicon];
    }

    for (const favicon of faviconLinks) {
        favicon.href = BRANDING.assets.favicon;
        favicon.removeAttribute("sizes");
        favicon.removeAttribute("type");
    }
}

/**
 * Keeps legacy translated/server-provided brand wording out of the rendered UI
 * without modifying generated i18n output. Returns the observer cleanup function.
 */
export function installBrandingRuntime(): () => void {
    if (typeof document === "undefined") {
        return () => undefined;
    }

    applyConfiguredFavicon();

    if (!document.body) {
        return () => undefined;
    }

    rewriteNode(document.body);

    const observer = new MutationObserver((records) => {
        for (const record of records) {
            if (record.type === "characterData") {
                rewriteTextNode(record.target as Text);
            } else if (record.type === "attributes") {
                rewriteElementAttributes(record.target as Element);
            } else {
                for (const node of record.addedNodes) {
                    rewriteNode(node);
                }
            }
        }
    });

    observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["title", "alt", "aria-label"],
    });

    return () => observer.disconnect();
}
