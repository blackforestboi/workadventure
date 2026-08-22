import {
    BRAND_AUTHOR,
    BRAND_CARD_IMAGE_URL,
    BRAND_CONTACT_EMAIL,
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
import defaultLoadingBackground from "./Components/images/map-exemple.png";
import defaultPwaBackground from "./Components/images/pwa-background-image.jpg";

const defaultBrandLogo = "/static/images/branding/default-icon.svg";
const websiteUrl = BRAND_WEBSITE_URL ?? window.location.origin;

function getDefaultContactEmail(url: string): string {
    try {
        return `hello@${new URL(url).hostname}`;
    } catch {
        return "hello@localhost";
    }
}

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
    websiteUrl,
    contactEmail: BRAND_CONTACT_EMAIL ?? getDefaultContactEmail(websiteUrl),
    assets: Object.freeze({
        logo: BRAND_LOGO_URL ?? defaultBrandLogo,
        loadingLogo: BRAND_LOADING_LOGO_URL ?? defaultBrandLogo,
        loginLogo: BRAND_LOGIN_LOGO_URL ?? BRAND_LOGO_URL ?? defaultBrandLogo,
        errorLogo: BRAND_ERROR_LOGO_URL ?? BRAND_LOGO_URL ?? defaultBrandLogo,
        errorImage: BRAND_ERROR_IMAGE_URL ?? defaultErrorImage,
        loadingBackground: BRAND_LOADING_BACKGROUND_URL ?? defaultLoadingBackground,
        pwaBackground: BRAND_PWA_BACKGROUND_URL ?? defaultPwaBackground,
        poweredByLogo: BRAND_POWERED_BY_LOGO_URL ?? BRAND_LOGO_URL ?? defaultBrandLogo,
        statusIcon: BRAND_STATUS_ICON_URL ?? defaultBrandLogo,
        statusCharacter: BRAND_STATUS_CHARACTER_URL ?? "resources/characters/pipoya/Cat 01-1.png",
        statusFontImage: BRAND_STATUS_FONT_IMAGE_URL ?? "resources/fonts/arcade.png",
        statusFontData: BRAND_STATUS_FONT_DATA_URL ?? "resources/fonts/arcade.xml",
        favicon: BRAND_FAVICON_URL ?? "/static/images/branding/default-icon.svg",
        manifestIcon: BRAND_MANIFEST_ICON_URL ?? "/static/images/branding/default-icon.svg",
        cardImage: BRAND_CARD_IMAGE_URL ?? "/static/images/branding/default-icon.svg",
    }),
});
