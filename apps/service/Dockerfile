# Construit depuis la racine du dépôt : docker build -f apps/service/Dockerfile .

FROM node:26.13.1-alpine AS construction
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /depot

# Les dépendances ne sont retéléchargées que si le lockfile change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch

COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "@relaismetier/service..." \
 && pnpm --filter @relaismetier/service build

# Image livrée : Node seul et un fichier JavaScript, sans dépendance ni outil de build.
FROM node:26.13.1-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=construction /depot/apps/service/dist/main.mjs ./main.mjs
USER node
EXPOSE 3000
CMD ["node", "main.mjs"]
