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
# Дефолты для VPS (совместимо с docker-compose.yml + .env.production: PORT=3000, HEALTH_PORT=3001)
# Render переопределяет эти значения через envVars в render.yaml (PORT=10000 / HEALTH_PORT=10000)
# Не хардкодим 10000 здесь, чтобы `docker compose up` на VPS работал без изменений.
ENV PORT=3000
ENV HEALTH_PORT=3001
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist/apps/${APP_NAME} ./dist
COPY --from=build /usr/src/app/prisma ./prisma
COPY --from=build /usr/src/app/prisma.config.ts ./prisma.config.ts
COPY --from=build /usr/src/app/package.json ./package.json
# Авто-миграции: на VPS и на Render `npx prisma migrate deploy` идемпотентен.
# Если хочешь отключить авто-миграции на VPS (ручной `prisma migrate deploy`), замени CMD на: node dist/apps/${APP_NAME}/src/main.js
# Фикс для текущего outDir: nest build дает dist/apps/<app>/apps/<app>/src/main.js, после COPY становится dist/apps/<app>/src/main.js
USER node
EXPOSE 3000 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/apps/${APP_NAME}/src/main.js"]