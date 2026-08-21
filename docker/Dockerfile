ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
WORKDIR /usr/src/app
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
ENV CI=true

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG APP_NAME
COPY . .
RUN pnpm exec prisma generate
RUN pnpm exec nest build ${APP_NAME}

FROM base AS production
ARG APP_NAME
ENV APP_NAME=${APP_NAME}
ENV NODE_ENV=production
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist/apps/${APP_NAME} ./dist
COPY --from=build /usr/src/app/prisma ./prisma
USER node
CMD ["sh", "-c", "node dist/apps/${APP_NAME}/src/main.js"]