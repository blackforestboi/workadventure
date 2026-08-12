import {
    BRAND_AUTHOR,
    BRAND_CARD_IMAGE_URL,
    BRAND_DESCRIPTION,
    BRAND_ERROR_IMAGE_URL,
    BRAND_ERROR_LOGO_URL,
    BRAND_FAVICON_URL,
    BRAND_LOADING_BACKGROUND_URL,
    BRAND_LOADING_LOGO_URL,
    BRAND_LOGO_URL,
    BRAND_LOGIN_LOGO_URL,
    BRAND_MANIFEST_ICON_URL,
    BRAND_NAME,
    BRAND_POWERED_BY_LOGO_URL,
    BRAND_PROVIDER,
    BRAND_PWA_BACKGROUND_URL,
    BRAND_SHORT_NAME,
    BRAND_STATUS_CHARACTER_URL,
    BRAND_STATUS_FONT_DATA_URL,
    BRAND_STATUS_FONT_IMAGE_URL,
    BRAND_STATUS_ICON_URL,
    BRAND_THEME_COLOR,
    BRAND_WEBSITE_URL,
} from "./Enum/EnvironmentVariable";
import defaultErrorImage from "./Components/UI/images/error.gif";
import defaultErrorLogo from "./Components/images/logo-min-white.png";
import defaultLoadingBackground from "./Components/images/map-exemple.png";
import defaultLoadingLogo from "./Components/images/Workadventure.gif";
import defaultLogo from "./Components/images/logo.svg";
import defaultPwaBackground from "./Components/images/pwa-background-image.jpg";

/**
 * All user-visible branding and loading/error assets live behind this registry.
 * Deployment-specific values are injected through window.env; bundled assets remain safe defaults.
 */
export const BRANDING = Object.freeze({
    name: BRAND_NAME,
    shortName: BRAND_SHORT_NAME,
    description: BRAND_DESCRIPTION,
    author: BRAND_AUTHOR,
    provider: BRAND_PROVIDER,
    themeColor: BRAND_THEME_COLOR,
    websiteUrl: BRAND_WEBSITE_URL,
    assets: Object.freeze({
        logo: BRAND_LOGO_URL ?? defaultLogo,
        loadingLogo: BRAND_LOADING_LOGO_URL ?? defaultLoadingLogo,
        loginLogo: BRAND_LOGIN_LOGO_URL ?? BRAND_LOGO_URL ?? defaultLogo,
        errorLogo: BRAND_ERROR_LOGO_URL ?? BRAND_LOGO_URL ?? defaultErrorLogo,
        errorImage: BRAND_ERROR_IMAGE_URL ?? defaultErrorImage,
        loadingBackground: BRAND_LOADING_BACKGROUND_URL ?? defaultLoadingBackground,
        pwaBackground: BRAND_PWA_BACKGROUND_URL ?? defaultPwaBackground,
        poweredByLogo: BRAND_POWERED_BY_LOGO_URL ?? BRAND_LOGO_URL ?? defaultLogo,
        statusIcon: BRAND_STATUS_ICON_URL ?? "/static/images/favicons/favicon-32x32.png",
        statusCharacter: BRAND_STATUS_CHARACTER_URL ?? "resources/characters/pipoya/Cat 01-1.png",
        statusFontImage: BRAND_STATUS_FONT_IMAGE_URL ?? "resources/fonts/arcade.png",
        statusFontData: BRAND_STATUS_FONT_DATA_URL ?? "resources/fonts/arcade.xml",
        favicon: BRAND_FAVICON_URL ?? "/static/images/favicons/favicon-512x512.svg",
        manifestIcon: BRAND_MANIFEST_ICON_URL ?? "/static/images/favicons/icon-512x512.png",
        cardImage: BRAND_CARD_IMAGE_URL ?? "/static/images/favicons/icon-512x512.png",
    }),
});
