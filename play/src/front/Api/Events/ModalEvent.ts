import { z } from "zod";
import { BRAND_NAME } from "../../Enum/EnvironmentVariable";

export const isModalEvent = z.object({
    src: z.string(),
    allow: z.string().optional().nullable().default(null),
    title: z.string().optional().default(`${BRAND_NAME} modal iframe`),
    position: z.enum(["right", "left", "center"]).optional().default("right"),
    allowApi: z.boolean().optional().default(false),
    allowFullScreen: z.boolean().optional().default(true),
    closable: z.boolean().optional().default(true),
});

/**
 * A message sent from the iFrame to the game to emit a notification.
 */
export type ModalEvent = z.infer<typeof isModalEvent>;
