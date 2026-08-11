import fs from "fs";
import type { Application } from "express";
import express from "express";
import cookieParser from "cookie-parser";
import * as Sentry from "@sentry/node";
import cors from "cors";
import uWebsockets from "uWebSockets.js";
import { adminApi } from "./services/AdminApi";
import { IoSocketController } from "./controllers/IoSocketController";
import { AuthenticateController } from "./controllers/AuthenticateController";
import { MapController } from "./controllers/MapController";
import { PrometheusController } from "./controllers/PrometheusController";
import { DebugController } from "./controllers/DebugController";
import { AdminController } from "./controllers/AdminController";
import { OpenIdProfileController } from "./controllers/OpenIdProfileController";
import { WokaListController } from "./controllers/WokaListController";
import { SwaggerController } from "./controllers/SwaggerController";
import {
    ALLOWED_CORS_ORIGIN,
    ENABLE_OPENAPI_ENDPOINT,
    FRONT_URL,
    PUSHER_URL,
    PROMETHEUS_PORT,
    GRPC_MAX_MESSAGE_SIZE,
    SECRET_KEY,
    TEAPOT_AGENT_BRIDGE_SECRET,
    TEAPOT_AGENT_BRIDGE_URL,
    TEAPOT_WOKA_PUBLIC_BASE_URL,
    TEAPOT_WOKA_STORAGE_DIRECTORY,
    TEAPOT_X_BOOTSTRAP_USER_IDS,
    TEAPOT_X_CLIENT_ID,
    TEAPOT_X_CLIENT_SECRET,
    TEAPOT_X_REDIRECT_URI,
} from "./enums/EnvironmentVariable";
import { PingController } from "./controllers/PingController";
import { CompanionListController } from "./controllers/CompanionListController";
import { FrontController } from "./controllers/FrontController";
import { globalErrorHandler } from "./services/GlobalErrorHandler";
import { jwtTokenManager } from "./services/JWTTokenManager";
import { CompanionService } from "./services/CompanionService";
import { WokaService } from "./services/WokaService";
import { UserController } from "./controllers/UserController";
import { MatrixRoomAreaController } from "./controllers/MatrixRoomAreaController";
import { LocalScriptController } from "./controllers/LocalScriptController";
import { LivekitWebhookController } from "./controllers/LivekitWebhookController";
import { TeapotAdmissionController } from "./controllers/TeapotAdmissionController";
import { configureTeapotAuthoringAccess } from "./middlewares/TeapotAuthoringMiddleware";
import { videoQualityAnalyticsQueue } from "./services/VideoQualityAnalyticsQueue";
import { getTeapotDataServices, initializeTeapotDataRuntime } from "./teapot/TeapotDataRuntime";
import { TeapotAdmissionService } from "./teapot/TeapotAdmissionService";
import { TeapotSecretBox } from "./teapot/TeapotTokenSecurity";
import { TeapotXOAuthService } from "./teapot/TeapotXOAuthService";
import { XOAuthClient } from "./teapot/XOAuthClient";
import { TeapotMapController } from "./controllers/TeapotMapController";
import { TeapotWokaController } from "./controllers/TeapotWokaController";
import { TeapotHealthController } from "./controllers/TeapotHealthController";
import { TeapotMcpController } from "./controllers/TeapotMcpController";
import { FileSystemTeapotWokaObjectStore } from "./teapot/TeapotWokaObjectStore";
import { TeapotWokaService } from "./teapot/TeapotWokaService";
import { TeapotTilesetService } from "./teapot/TeapotTilesetService";
import { TeapotTilesetController } from "./controllers/TeapotTilesetController";
import { TeapotGeneratedAssetService } from "./teapot/TeapotGeneratedAssetService";
import { TeapotGeneratedAssetController } from "./controllers/TeapotGeneratedAssetController";
import { TeapotAiProviderController } from "./controllers/TeapotAiProviderController";
import { TeapotAgentBridgeClient } from "./teapot/TeapotAgentBridgeClient";

const VIDEO_QUALITY_ANALYTICS_CAPABILITY = "api/analytics/video-quality-batch";

class App {
    private readonly app: Application;
    private readonly websocketApp: uWebsockets.TemplatedApp;
    private readonly prometheusWebserver: Application | undefined;

    constructor() {
        this.websocketApp = uWebsockets.App();
        this.app = express();
        configureTeapotAuthoringAccess({
            getDataServices: getTeapotDataServices,
            isXAdmissionConfigured: () => Boolean(TEAPOT_X_CLIENT_ID && TEAPOT_X_REDIRECT_URI && FRONT_URL),
        });

        // LiveKit webhooks must keep the raw body for signature verification in the back; register before express.json().
        new LivekitWebhookController(this.app);

        this.app.use(express.json({ limit: "8mb" }));
        this.app.use(express.urlencoded());
        // It seems the cookieParser type is not yet compatible with express 5
        //eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        this.app.use(cookieParser());

        // Global middlewares
        this.app.use(
            cors({
                origin: ALLOWED_CORS_ORIGIN === "*" ? true : ALLOWED_CORS_ORIGIN,
                methods: ["GET", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"],
                allowedHeaders: [
                    "Content-Type",
                    "Authorization",
                    "Origin",
                    "X-Requested-With",
                    "Accept",
                    "Pragma",
                    "Cache-Control",
                    "baggage",
                    "sentry-trace",
                ],
                credentials: true,
            }),
        );

        //this.app.set_error_handler(globalErrorHandler);

        let path: string;
        if (fs.existsSync("dist/public")) {
            // In prod mode
            path = "dist/public";
        } else if (fs.existsSync("public")) {
            // In dev mode
            path = "public";
        } else {
            throw new Error("Could not find public folder");
        }

        // Socket controllers
        new IoSocketController(this.websocketApp);

        // Http controllers
        new AuthenticateController(this.app);
        new MapController(this.app);
        if (PROMETHEUS_PORT) {
            this.prometheusWebserver = express();
            new PrometheusController(this.prometheusWebserver);
        } else {
            new PrometheusController(this.app);
        }
        new DebugController(this.app);
        new AdminController(this.app, GRPC_MAX_MESSAGE_SIZE);
        new OpenIdProfileController(this.app);
        new PingController(this.app);
        new LocalScriptController(this.app);

        if (ENABLE_OPENAPI_ENDPOINT) {
            new SwaggerController(this.app);
        }
        new FrontController(this.app);
        new UserController(this.app);
        new TeapotMapController(this.app);
        new TeapotMcpController(this.app);
        new MatrixRoomAreaController(this.app);

        const staticOptions = {
            extensions: [
                ".css",
                ".js",
                ".png",
                ".svg",
                ".ico",
                ".xml",
                ".mp3",
                ".json",
                ".html",
                ".ttf",
                ".woff2",
                ".map",
                ".gif",
                ".odf",
            ],
            etag: true,
            maxAge: "15d",
        };

        this.app.use(
            "assets",
            express.static(path + "/assets", {
                ...staticOptions,
                maxAge: "1y",
            }),
        );

        this.app.use(
            "resources",
            express.static(path + "/resources", {
                ...staticOptions,
                maxAge: "1d",
            }),
        );

        this.app.use(
            "static",
            express.static(path + "/static", {
                ...staticOptions,
                maxAge: "1d",
            }),
        );

        this.app.use(
            "collections",
            express.static(path + "/collections", {
                ...staticOptions,
                maxAge: "1d",
            }),
        );

        this.app.use(
            express.static(path, {
                ...staticOptions,
                maxAge: "1h",
            }),
        );
    }

    public async init() {
        await initializeTeapotDataRuntime();
        new TeapotHealthController(this.app);

        const teapotDataServices = getTeapotDataServices();
        const teapotWokaObjectStore = new FileSystemTeapotWokaObjectStore(TEAPOT_WOKA_STORAGE_DIRECTORY);
        await teapotWokaObjectStore.initialize();
        const teapotWokaService = new TeapotWokaService(
            teapotDataServices.repository,
            teapotDataServices.identity,
            teapotDataServices.authorization,
            teapotWokaObjectStore,
            { publicPusherUrl: TEAPOT_WOKA_PUBLIC_BASE_URL },
        );
        WokaService.configureGeneratedWokas(teapotWokaService);
        new TeapotWokaController(this.app, teapotWokaService);
        new TeapotTilesetController(
            this.app,
            new TeapotTilesetService(
                teapotDataServices.repository,
                teapotDataServices.identity,
                teapotDataServices.authorization,
                teapotWokaObjectStore,
                TEAPOT_WOKA_PUBLIC_BASE_URL,
            ),
        );
        new TeapotGeneratedAssetController(
            this.app,
            new TeapotGeneratedAssetService(
                teapotDataServices.repository,
                teapotDataServices.identity,
                teapotDataServices.authorization,
                teapotWokaObjectStore,
                TEAPOT_WOKA_PUBLIC_BASE_URL,
            ),
        );
        new TeapotAiProviderController(
            this.app,
            new TeapotAgentBridgeClient(TEAPOT_AGENT_BRIDGE_URL, TEAPOT_AGENT_BRIDGE_SECRET),
        );

        const xOAuthClient = new XOAuthClient({
            clientId: TEAPOT_X_CLIENT_ID ?? "",
            clientSecret: TEAPOT_X_CLIENT_SECRET,
        });
        const teapotFrontUrl = resolveTeapotFrontUrl(FRONT_URL, PUSHER_URL);
        const teapotOAuthService = new TeapotXOAuthService(
            teapotDataServices,
            jwtTokenManager,
            xOAuthClient,
            new TeapotSecretBox(SECRET_KEY),
            {
                clientId: TEAPOT_X_CLIENT_ID ?? "",
                redirectUri: TEAPOT_X_REDIRECT_URI,
                frontUrl: teapotFrontUrl,
                bootstrapXUserIds: TEAPOT_X_BOOTSTRAP_USER_IDS,
            },
        );
        const teapotAdmissionService = new TeapotAdmissionService(teapotDataServices, { frontUrl: teapotFrontUrl });
        new TeapotAdmissionController(
            this.app,
            jwtTokenManager,
            teapotDataServices,
            teapotOAuthService,
            teapotAdmissionService,
        );

        const companionListController = new CompanionListController(this.app, jwtTokenManager);
        const wokaListController = new WokaListController(this.app, jwtTokenManager);

        // Handle 404 errors with no-cache headers
        this.app.use((req, res, _next) => {
            // Set no-cache headers for 404 responses
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
            res.status(404).send("Not Found");
        });

        this.app.use(globalErrorHandler);

        try {
            const capabilities = await adminApi.initialise();
            companionListController.setCompanionService(CompanionService.get(capabilities));
            wokaListController.setWokaService(WokaService.get(capabilities));
            videoQualityAnalyticsQueue.setEnabled(capabilities[VIDEO_QUALITY_ANALYTICS_CAPABILITY] === "v1");
        } catch (error) {
            console.error("Failed to initialize: problem getting AdminAPI capabilities", error);
            Sentry.captureException(`Failed to initialized companion and woka services : ${error}`);
        }
    }

    public listenWebServer(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.app.listen(port, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    public listenWebSocket(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.websocketApp.listen(port, (token) => {
                if (token) {
                    resolve();
                } else {
                    reject(new Error(`Error starting WorkAdventure Pusher on port ${port}!`));
                }
            });
        });
    }

    public listenPrometheusPort(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (PROMETHEUS_PORT && this.prometheusWebserver) {
                this.prometheusWebserver.listen(PROMETHEUS_PORT, (err) => {
                    if (err) {
                        console.error(err);
                        Sentry.captureException(err);
                        reject(err);
                        return;
                    }
                    console.info(`WorkAdventure Prometheus web-server started on port ${PROMETHEUS_PORT}!`);
                    resolve();
                });
            }
            return;
        });
    }
}

export default new App();

function resolveTeapotFrontUrl(frontUrl: string, pusherUrl: string): string {
    try {
        return new URL(frontUrl).toString();
    } catch {
        try {
            return new URL(frontUrl, pusherUrl).toString();
        } catch {
            return frontUrl;
        }
    }
}
