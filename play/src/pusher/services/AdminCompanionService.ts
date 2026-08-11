import axios, { isAxiosError } from "axios";
import type { AxiosResponse } from "axios";
import { CompanionTextureCollection } from "@workadventure/messages";
import * as Sentry from "@sentry/node";
import { ADMIN_API_TOKEN, ADMIN_API_URL } from "../enums/EnvironmentVariable";
import type { CompanionServiceInterface } from "./CompanionServiceInterface";

class AdminCompanionService implements CompanionServiceInterface {
    /**
     * Returns the list of all companions for the current user.
     */
    getCompanionList(roomUrl: string, token: string): Promise<CompanionTextureCollection[] | undefined> {
        /**
         * @openapi
         * /api/companion/list:
         *   get:
         *     tags: ["AdminAPI"]
         *     description: Get all the companions
         *     security:
         *      - Bearer: []
         *     produces:
         *      - "application/json"
         *     parameters:
         *      - name: "roomUrl"
         *        in: "query"
         *        description: "The slug of the room"
         *        type: "string"
         *        required: true
         *        example: "/@/teamSlug/worldSlug/roomSlug"
         *      - name: "uuid"
         *        in: "query"
         *        description: "The uuid of the user \n It can be an uuid or an email"
         *        type: "string"
         *        required: true
         *        example: "998ce839-3dea-4698-8b41-ebbdf7688ad8"
         *     responses:
         *       200:
         *         description: The list of the companions
         *         schema:
         *             type: array
         *             items:
         *                 $ref: '#/definitions/CompanionTextureCollection'
         *       404:
         *         description: Error while retrieving the data
         *         schema:
         *             $ref: '#/definitions/ErrorApiErrorData'
         */
        return axios
            .get<unknown, AxiosResponse<unknown>>(`${ADMIN_API_URL}/api/companion/list`, {
                headers: { Authorization: `${ADMIN_API_TOKEN}` },
                params: {
                    roomUrl,
                    uuid: token,
                },
            })
            .then((res) => {
                return CompanionTextureCollection.array().parse(res.data);
            })
            .catch((err) => {
                const status = isAxiosError(err) ? err.response?.status : undefined;
                console.error("Cannot get companion collection list from admin API", { status });
                Sentry.captureException(new Error("Admin companion list request failed"), {
                    tags: { status: status?.toString() ?? "unknown" },
                });
                return undefined;
            });
    }
}

export const adminCompanionService = new AdminCompanionService();
