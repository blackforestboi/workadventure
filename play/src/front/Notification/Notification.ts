import { BRANDING } from "../Branding";

export const defaultOptions = {
    icon: BRANDING.assets.statusIcon,
    image: BRANDING.assets.statusIcon,
    badge: BRANDING.assets.statusIcon,
};

export interface NotificationWA {
    sendNotification: () => Promise<void>;
}

export const TIME_NOTIFYING_MILLISECOND = 10000;
