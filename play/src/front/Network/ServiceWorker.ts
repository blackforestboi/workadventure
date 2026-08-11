import { NODE_ENV } from "../Enum/EnvironmentVariable";

const WORKADVENTURE_CACHE_PREFIX = "workavdenture-cache";

export async function clearDevelopmentServiceWorkersAndCaches(): Promise<void> {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter((cacheName) => cacheName.startsWith(WORKADVENTURE_CACHE_PREFIX))
                .map((cacheName) => caches.delete(cacheName)),
        );
    }
}

export class _ServiceWorker {
    constructor() {
        if ("serviceWorker" in navigator) {
            if (navigator.storage && navigator.storage.persist) {
                navigator.storage
                    .persist()
                    .then((persistent) => {
                        if (persistent) {
                            console.info("Storage will not be cleared except by explicit user action");
                        } else {
                            console.info("Storage may be cleared by the UA under storage pressure.");
                        }
                    })
                    .catch((err) => console.error("_ServiceWorker => err", err));
            }
            this.init();
        }
    }

    init() {
        // Development is driven by Vite's live module graph. Do not leave a
        // service worker or an old navigation cache in front of that graph:
        // it makes a browser appear to reload while it is still running stale
        // application code.
        if (NODE_ENV === "development") {
            clearDevelopmentServiceWorkersAndCaches().catch((error) => {
                console.error("Error clearing the development Service Worker: ", error);
            });
            return;
        }
        navigator.serviceWorker
            .register(
                `/service-worker-prod.js?playUri=${window.location.protocol}//${window.location.host}${window.location.pathname}`,
            )
            .then((serviceWorker) => {
                console.info("Service Worker registered: ", serviceWorker);
            })
            .catch((error) => {
                console.error("Error registering the Service Worker: ", error);
            });
    }
}
