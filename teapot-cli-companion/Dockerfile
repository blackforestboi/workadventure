FROM node:24-bookworm-slim

ARG CODEX_CLI_VERSION=0.147.0-alpha.6.5
ARG CLAUDE_CODE_VERSION=2.1.220
ARG TSX_VERSION=4.22.3

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global \
        "@openai/codex@${CODEX_CLI_VERSION}" \
        "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
        "tsx@${TSX_VERSION}" \
    && npm cache clean --force

ENV NODE_ENV=production \
    TEAPOT_AGENT_BRIDGE_HOST=0.0.0.0 \
    TEAPOT_AGENT_BRIDGE_PORT=17375 \
    TEAPOT_AGENT_AUTH_ROOT=/var/lib/teapot-agent-auth \
    TEAPOT_HOSTED_BRIDGE_HOST=0.0.0.0 \
    TEAPOT_HOSTED_BRIDGE_PORT=17375 \
    TEAPOT_CODEX_BRIDGE_HOST=0.0.0.0 \
    TEAPOT_CODEX_BRIDGE_PORT=17375 \
    TEAPOT_CODEX_AUTH_ROOT=/var/lib/teapot-agent-auth/codex \
    TEAPOT_CLAUDE_AUTH_ROOT=/var/lib/teapot-agent-auth/claude \
    TEAPOT_CLAUDE_CLI=claude

WORKDIR /app
RUN mkdir -p /var/lib/teapot-agent-auth/codex /var/lib/teapot-agent-auth/claude \
    && chown -R node:node /var/lib/teapot-agent-auth
COPY --chown=node:node teapot-cli-companion/package.json ./package.json
COPY --chown=node:node teapot-cli-companion/tsconfig.json ./tsconfig.json
COPY --chown=node:node teapot-cli-companion/src ./src

USER node
EXPOSE 17375
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
    CMD node -e "fetch('http://127.0.0.1:17375/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["tsx", "src/hostedServer.ts"]
