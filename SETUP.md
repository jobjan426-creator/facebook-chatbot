# AI Platform — Тохируулах заавар

## Шаардлага

- Node.js v20+
- PostgreSQL 16+
- Redis 7+
- Meta Developer App (FB/IG)

## 1. Эхлүүлэх

```bash
cd C:\Users\Dell\Desktop\Claude

# Dependencies суулгах (хийгдсэн)
npm install

# Prisma client generate (хийгдсэн)
cd backend && node "../node_modules/prisma/build/index.js" generate
```

## 2. `.env` тохируулах

`.env` файлд дараах утгуудыг өөрчилнө үү:

```
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/aiplatform
REDIS_URL=redis://localhost:6379
SUPER_ADMIN_EMAIL=танай@email.com
SUPER_ADMIN_PASSWORD=аюулгүй_нууц_үг
META_APP_ID=Meta Developer Console-оос
META_APP_SECRET=Meta Developer Console-оос
```

## 3. Database migration

```bash
cd C:\Users\Dell\Desktop\Claude\backend

# Migration ажиллуулах
node "../node_modules/prisma/build/index.js" migrate dev --name init

# Super-admin бүртгэл үүсгэх
node "../node_modules/tsx/dist/cli.mjs" prisma/seed.ts
```

## 4. Development-д ажиллуулах

```bash
# Root directory-аас
cd C:\Users\Dell\Desktop\Claude
npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:5173

## 5. Meta Webhook тохируулах

1. Meta Developer Console → App → Webhooks
2. Callback URL: `https://yourapp.railway.app/webhook/meta`
3. Verify Token: `.env`-ийн `META_WEBHOOK_VERIFY_TOKEN`
4. Subscribe fields: `messages`, `feed`, `comments`

## 6. Railway деплой

```bash
# Railway CLI суулгах
npm install -g @railway/cli

railway login
railway init
railway up
```

Railway dashboard-д environment variables тохируулна уу.

## 7. Анхны нэвтрэлт

1. `http://localhost:5173/login` → super-admin email/password
2. Admin → "+ Шинэ тенант" → бизнес нэмэх
3. Тенантын Onboarding хийх (7 алхам)
4. Facebook Page холбох → AI идэвхжих

## TypeScript шалгах

```bash
# Backend
cd backend && node "../node_modules/typescript/bin/tsc" --noEmit

# Frontend  
cd ../frontend && node "../node_modules/typescript/bin/tsc" --noEmit
```
