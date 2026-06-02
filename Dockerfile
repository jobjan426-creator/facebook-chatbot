FROM node:20-alpine

# Install openssl for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies (workspace-aware)
COPY package*.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci

# Copy all source
COPY . .

# Generate Prisma client and build
RUN cd backend && node "../node_modules/prisma/build/index.js" generate
RUN npm run build

EXPOSE 3001

CMD ["sh", "-c", "cd backend && node ../node_modules/prisma/build/index.js migrate deploy && node ../node_modules/tsx/dist/cli.mjs prisma/seed.ts && npm start"]
