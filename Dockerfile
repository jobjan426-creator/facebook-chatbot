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

# Make startup script executable
RUN chmod +x /app/start.sh

# Generate Prisma client and build
RUN cd backend && node "../node_modules/prisma/build/index.js" generate
RUN npm run build

EXPOSE 3001

CMD ["/app/start.sh"]