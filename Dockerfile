# Imagem estática da Sala de Tela.

FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-slim

WORKDIR /app

RUN npm install -g serve

COPY --from=build /app/dist /app/dist

USER node

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
