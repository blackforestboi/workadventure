import type { AssetGenerationReference } from "./AssetGenerationTypes";
import { copyToArrayBuffer, decodeBase64 } from "./Base64";

// The down-facing idle frame cropped from the bundled, unclothed vanilla Woka
// (`resources/customisation/character_color/character_color3.png`). It is the
// canonical body-shape guide for the first design: oversized round head,
// compact torso, and short limbs. It is intentionally not a styled avatar.
const DEFAULT_WOKA_NEUTRAL_BODY =
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACj0lEQVR42u1Xv4vTcBT/pI0KZzU0d6YWrvYKJ0e2YqWTg+A/UAoduprF3c1Jl9vcb6lrhy7d9UDQqXjQrRUEW+phE2hCFO+0oHG4e1/S/PomucotPiiU9/1+3+/3eS/Af7pkEtI8evbkkRN2tn9wmEimmEZxo14FAGyWVXa2mI7or5PEECGJ8ka9ypTmSwXfHWumM2P6g2EsI8SkyoMUE7nPGufR4BkROwVe5ZIi++7YhrlqyGDIlZuJ672bgpQH8Rv1amTBxjLA632Ycq8R+VJhpUgvZADP87T3uAbwwrcO3MhEPdJa7bWgndZqhxqRwSWTyIFUh4Alqv/DiNCx0+uGglJkBJLieho5YszHjnbeUnEq3DZMWDM9FhzHroFOrwtrpjO04ynv9LrrmYZuJOz0uoiaCdZMZ4PIhZ5O6hSQ8lqzCdswoZXVM884GK+12siXCu50hRrBjQApt2Y68qUCtFYbOzV1Zfi4a2NydNYxNJprzSb6EQZned5f3yywnKrbFezUVGRyuxCuyrh25RS/fpxCUmTGk7aymI8n7L4gZqH8/olbxY3n7z58fpGoCHcfPPRuOz46sb5zcYDkxI4AeV+5fw/z8QTd128AAOWciOUJIG1l4SxNfP04xUb+BqwvBnI3/8BZmpgcjbCYjjA+nmN8PIe6XcHtu3cgfbMCo5CJyr3Xe6p+2zBhGyaKe2VIioziXpnxvGOY3pO8RCmwDXMFTBbTESs2wgT6UdFJisyU7h8cCv3BMBI7RN4cCGofSZHx6f1bX21QdySRlQjrB6+eOpQGL9pR7xMY1R+/FC68kHiJ+pnC7fWK+P0Yy2iqDxPa9SRF9uU1jL/WCCRZSv/Zt6F7tXKHP4zPo78PvlLEARUv0wAAAABJRU5ErkJggg==";

export function createDefaultWokaStyleReference(): AssetGenerationReference {
    const bytes = decodeBase64(DEFAULT_WOKA_NEUTRAL_BODY);
    return {
        id: "default-woka-neutral-body-front-idle",
        blob: new Blob([copyToArrayBuffer(bytes)], { type: "image/png" }),
        mimeType: "image/png",
        role: "object-reference",
    };
}
