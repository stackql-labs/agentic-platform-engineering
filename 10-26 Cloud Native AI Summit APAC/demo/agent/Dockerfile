# The agent as a container image: Node, the agent, the stackql binary and the
# k8s provider baked in so a run makes no downloads.
#   docker build -t platform-agent:dev .
#   kind load docker-image platform-agent:dev --name platform-demo
FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*

# the stackql binary; the npm launcher uses it through STACKQL_MCP_BIN instead of downloading
RUN curl -fsSL https://releases.stackql.io/stackql/latest/stackql_linux_amd64.zip -o /tmp/stackql.zip \
    && unzip -q /tmp/stackql.zip -d /usr/local/bin && chmod +x /usr/local/bin/stackql && rm /tmp/stackql.zip
ENV STACKQL_MCP_BIN=/usr/local/bin/stackql
ENV STACKQL_APPROOT=/stackql

# the k8s provider, pulled at build time
RUN mkdir -p /stackql && stackql exec --approot /stackql "REGISTRY PULL k8s"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit
COPY tsconfig.json ./
COPY src ./src
COPY prompts ./prompts

RUN mkdir -p /audit && chown -R node:node /app /audit /stackql
USER node
ENV NODE_ENV=production
CMD ["npx", "tsx", "src/agent.ts"]
