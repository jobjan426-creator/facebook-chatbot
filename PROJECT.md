## Project

**AI Platform — Facebook & Instagram**

SaaS-платформа AI-агента для автоматизации клиентских обращений через Facebook Page Messenger и Instagram Direct Messages. Платформа работает по модели **владелец → много тенантов (его клиентов)**. Каждый тенант — отдельный бизнес (ресторан, салон, онлайн-магазин и т.д.) с изолированными данными, настройками и каналами. Один Railway-проект обслуживает всех клиентов одного владельца.

**Core Value:** AI-агент автоматически и естественно отвечает клиентам в Facebook Messenger и Instagram DM от имени бизнеса, используя базу знаний и контекст разговора — без участия человека в 90%+ обращений. Оператор имеет возможность вручную взять любой разговор на себя через дашборд.

**Что делает платформа (TL;DR):**
Когда клиент пишет на Facebook Page или в Instagram DM бизнеса, AI-агент читает сообщение, ищет нужную информацию в базе знаний (каталог, цены, правила) и отвечает естественно — как живой менеджер. Поддерживает текст, голосовые (через OpenAI Whisper — монгол хэл дэмждэг) и изображения. Каждый бизнес работает как отдельный тенант в одной системе со своими FB/IG каналами, базами знаний и характером AI. Live-дашборд позволяет оператору в реальном времени видеть все разговоры и подключаться, когда AI не справляется.

### Constraints

- **Tech stack**: Node.js + Express (backend), React + Tailwind CSS + ShadCN (frontend, mobile-friendly), PostgreSQL, Redis
- **Messaging channels**: Meta Messenger Platform API (официальный, бесплатный) — Facebook Page Messenger + Instagram DM через один webhook
- **Хостинг**: Railway — монолитное приложение
- **Архитектура**: Монолит с мультитенантной структурой БД (tenant_id)
- **Стратегия**: Строим фундамент, каналы и AI параллельно по слоям

---

## Technology Stack

### Core Backend

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | 20 LTS | Runtime | Stable LTS, широкая экосистема, Railway поддерживает нативно. | HIGH |
| Express.js | 4.x | HTTP framework | Достаточен для этого монолита. Простой, предсказуемый, хорошая документация. | HIGH |
| TypeScript | 5.x | Type safety | Обязателен для проекта такой сложности. Prisma генерирует TS-типы, multi-provider AI интеграции требуют typed interfaces. | HIGH |

### Database & Cache

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PostgreSQL | 16+ | Primary database | Multi-tenant с tenant_id isolation. Railway managed Postgres. | HIGH |
| Redis | 7+ | Cache, sessions, queues | BullMQ job queues, session cache, rate limiting, inbound message buffering. Railway one-click Redis. | HIGH |
| Prisma ORM | 7.x | Database access | Pure TypeScript с v7 (нет Rust engine). 1.6MB бинарник — критично для Railway deploys. Декларативная схема + миграции + type-safe запросы. | HIGH |

### Frontend

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| React | 19.x | UI framework | Зрелая экосистема для dashboard-приложений. | HIGH |
| Vite | 6.x | Build tool | Быстрый HMR, нативный плагин Tailwind v4. | HIGH |
| Tailwind CSS + ShadCN | 4.x (4.2+) | Styling | v4 — 5x быстрее билды. `@tailwindcss/vite` плагин. Mobile-friendly. | HIGH |
| React Router | 7.x | Routing | Стандарт для React SPA. Поддерживает nested layouts для dashboard. | HIGH |
| Zustand | 5.x | State management | Легковесный, без boilerplate. Идеален для tenant switching, auth state, chat state. | MEDIUM |
| Socket.IO Client | 4.x | Real-time updates | Пара с сервером. Auto-reconnection критична для live chat dashboard. | HIGH |

### Messaging Channels

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Meta Messenger Platform API | v22.0+ (Graph API) | Facebook Page Messenger + Instagram DM | **Официальный API Meta.** Бесплатный (pay-per-message не взимается). Один webhook обрабатывает оба канала. Webhook-based: Meta пушит входящие сообщения на наш endpoint. Stable, без риска бана. | HIGH |

**Как работает Meta webhook:**
```
Клиент пишет в FB Page / IG DM
        ↓
Meta отправляет POST на наш webhook: POST /webhook/meta
        ↓
Наш бэкенд определяет tenant по page_id / ig_account_id
        ↓
AI генерирует ответ
        ↓
Наш бэкенд отправляет ответ через Graph API
```

**App Review:**
- Development mode (без App Review): работает для тестирования. Только пользователи с ролью в Meta App могут слать сообщения.
- **Advanced Access (нужен для production):** одноразовый процесс — подать заявку, Meta проверяет за 1-4 недели. После одобрения все тенанты работают под одним приложением. Компания/ААН не требуется — хватит личного Meta Developer аккаунта + работающего webhook + privacy policy URL.

**Что нужно для подключения тенанта:**
- FB Page тенанта: `page_id` + `page_access_token` (долгосрочный токен, получается через OAuth)
- IG аккаунт (опционально): должен быть Professional/Business, связан с FB Page

### AI & LLM

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| OpenAI API (`@ai-sdk/openai`) | Latest | Text + Vision | GPT-5.1 — universal: текст и vision. ~$1.25 input / $10 output per 1M tokens. Vision используется для анализа фото от клиентов. | HIGH |
| Google Gemini API (`@ai-sdk/google`) | Latest | Text + Vision + RAG | Gemini 3 Flash — текст и vision, ~$0.50/$3 per 1M tokens. **Gemini API key обязателен для всех тенантов** — нужен для File Search RAG. | HIGH |
| xAI Grok API (`@ai-sdk/xai`) | Latest | Text (cheapest) | Grok 4.1 Fast — ~$0.20/$0.50 per 1M tokens, 2M context. **Vision слабый — не использовать для анализа фото.** Fallback на vision-провайдер тенанта при получении изображения. | HIGH |
| Vercel AI SDK | 5.x | Multi-provider abstraction | **NB: это npm-пакет, не хостинг Vercel.** Работает на Railway. Единый API для OpenAI / Gemini / Grok: streaming, tool calling, structured output, vision. | HIGH |

### RAG & Knowledge Base

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Gemini File Search API | Latest | Document RAG | Fully managed: загрузить файлы, получить ответы с цитатами. Поддерживает PDF, DOCX, TXT, JSON. Не нужна vector DB. Бесплатное хранение, оплата только за индексацию ($0.15/1M tokens). | HIGH |

### Voice Transcription (монгол хэл)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| OpenAI Whisper API (`whisper-1`) | Latest | Speech-to-text — **монгол хэл** | **Монгол хэлийг дэмждэг цорын ганц найдвартай сонголт.** ISO код: `mn`. Хэрэглэгч OpenAI API key-г аль хэдийн ашигладаг тул нэмэлт key хэрэггүй. REST API, $0.006/мин. | HIGH |

**Яагаад Soniox болон ElevenLabs биш вэ:**
- Soniox: 60+ хэлийг дэмждэг ч монгол (`mn`) жагсаалтад байхгүй.
- ElevenLabs Scribe v2: мөн адил монгол дэмждэггүй.
- OpenAI Whisper: монгол хэлийг `mn` ISO кодоор дэмждэг.

**Voice flow:**
```
Хэрэглэгч voice message илгээнэ (FB Messenger / IG)
        ↓
Meta webhook → audio file URL хүлээн авна
        ↓
Whisper API → монгол текст болгон хөрвүүлнэ
        ↓
AI текст хариулт үүсгэнэ → буцаан илгээнэ
```

### Real-Time & Background Jobs

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Socket.IO | 4.x | WebSocket server | Real-time chat dashboard, live notifications. Auto-reconnection, rooms (per-tenant isolation). | HIGH |
| BullMQ | 5.x (5.71+) | Job queue | Inbound message buffering, AI response processing, voice transcription jobs. Redis-backed, persistent, retries. | HIGH |
| node-cron | 3.x | Simple scheduling | Token refresh, session health checks, cleanup jobs. | HIGH |

### Authentication & Security

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| jsonwebtoken | 9.x | JWT auth | Stateless auth tokens for API. | HIGH |
| bcryptjs | 2.x | Password hashing | Pure JS (нет native deps = Railway deploy без проблем). | HIGH |
| helmet | 8.x | HTTP security headers | Express middleware, one-line setup. | HIGH |
| cors | 2.x | CORS | Required for separate frontend origin. | HIGH |

### File Handling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| multer | 1.x | File upload middleware | Knowledge base uploads (PDF, DOCX, TXT). | HIGH |
| sharp | 0.33+ | Image processing | Compress/resize customer photos before AI analysis. Reduces API costs. | MEDIUM |

### Logging & Monitoring

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| pino | 9.x | Structured logging | Fast JSON logger. 5x быстрее winston. Structured logs работают с Railway log viewer. | HIGH |
| pino-pretty | 13.x | Dev formatting | Human-readable dev logs. | HIGH |

### Validation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| zod | 3.x | Schema validation | Runtime validation для API inputs, webhook payloads, AI responses. | HIGH |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Messaging | Meta Messenger API | WhatsApp (Baileys) | Baileys — неофициальный API, высокий риск бана аккаунта навсегда. Meta API — официальный, бесплатный, стабильный. |
| Messaging | Meta Messenger API | WhatsApp Business API (Meta) | Платный (per conversation). Meta Messenger API для FB/IG — бесплатный. |
| Voice STT | OpenAI Whisper | Soniox | Soniox не поддерживает монгольский язык (`mn`). |
| Voice STT | OpenAI Whisper | ElevenLabs Scribe v2 | ElevenLabs не поддерживает монгольский язык. |
| ORM | Prisma 7.x | Drizzle ORM | Prisma: лучший migration tooling, более пологая кривая обучения. |
| HTTP Framework | Express 4.x | Fastify | Достаточно для этого масштаба. |
| State Management | Zustand | Redux Toolkit | Redux избыточен для dashboard с несколькими tenant. |
| Job Queue | BullMQ | Agenda.js | Agenda требует MongoDB. Уже есть Redis для BullMQ. |
| Logger | pino | winston | pino в 5x быстрее, нативный JSON. |
| AI Abstraction | Vercel AI SDK | Custom wrapper | AI SDK покрывает streaming, tool calling, vision для 3 провайдеров. Самостоятельная реализация — 200-300 строк хрупкого кода. |
| WebSocket | Socket.IO | ws | Auto-reconnection, rooms, namespaces стоят overhead для chat dashboard. |

## NOT Recommended (Explicit Anti-Stack)

| Technology | Why Not |
|------------|---------|
| WhatsApp (Baileys) | Неофициальный API. Аккаунты банятся навсегда. Нет. |
| WhatsApp Business API | Платный per-conversation. Для FB/IG это не нужно. |
| Soniox | Монгол хэл дэмждэггүй. |
| ElevenLabs Scribe v2 | Монгол хэл дэмждэггүй. |
| Next.js | Отдельный React frontend + Express backend. Next.js объединил бы их, усложнив Railway деплой. |
| MongoDB | PostgreSQL — наш constraint. Нет смысла добавлять вторую БД. |
| Sequelize / TypeORM | Inferior DX по сравнению с Prisma 7.x. |
| Firebase | Vendor lock-in, не совместим с self-hosted PostgreSQL. |
| Pinecone / Weaviate | Gemini File Search API — наш constraint для RAG. Внешняя vector DB не нужна. |
| Passport.js | Избыточно для single-strategy JWT auth. |

---

## Environment Variables Required

```bash
# Database (auto-injected by Railway)
DATABASE_URL=

# Redis (auto-injected by Railway)
REDIS_URL=

# Auth
JWT_SECRET=                    # openssl rand -hex 64
ENCRYPTION_KEY=                # openssl rand -hex 32 (ровно 32 байта)

# Super-admin bootstrap (удалить после первого запуска)
SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD=

# App
APP_URL=                       # https://yourapp.up.railway.app

# Meta (глобальные для приложения, не per-tenant)
META_APP_ID=                   # из Meta Developer Console
META_APP_SECRET=               # из Meta Developer Console
META_WEBHOOK_VERIFY_TOKEN=     # любая случайная строка, openssl rand -hex 16
```

**Per-tenant ключи** (OpenAI, Gemini, Grok, Whisper через OpenAI key, FB/IG токены) **хранятся в БД зашифрованно** — не в env vars.

## Key Version Constraints

| Dependency | Min Version | Reason |
|------------|-------------|--------|
| Node.js | 20.0.0 | LTS, Railway stable |
| Redis | 4.0+ | Required by BullMQ |
| PostgreSQL | 14+ | Prisma 7 requirement |

## Sources

- [Meta Messenger Platform Docs](https://developers.facebook.com/docs/messenger-platform) — webhook setup, send API
- [Meta Instagram Messaging API](https://developers.facebook.com/docs/messenger-platform/instagram) — IG DM automation
- [Meta Graph API](https://developers.facebook.com/docs/graph-api) — page access tokens, send messages
- [Meta App Review](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review) — Advanced Access process
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text) — STT, монгол хэл `mn`
- [OpenAI API Pricing](https://openai.com/api/pricing) — GPT-5.1 ~$1.25/$10, Whisper $0.006/мин
- [Google Gemini API Pricing](https://ai.google.dev/pricing) — Gemini 3 Flash ~$0.50/$3 per 1M tokens
- [xAI Grok API Docs](https://docs.x.ai/docs/models) — Grok 4.1 Fast ~$0.20/$0.50 per 1M tokens
- [Gemini File Search API](https://ai.google.dev/gemini-api/docs/file-search) — managed RAG, free storage
- [Vercel AI SDK](https://sdk.vercel.ai/docs) — v5.x, open-source npm package
- [Prisma 7 announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0) — pure TS, no Rust engine
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4) — 5x faster builds
- [BullMQ](https://docs.bullmq.io) — v5.71, Redis-based job queue
- [Railway pricing](https://docs.railway.com/reference/pricing/plans) — Hobby $5/сар

---

## Meta Channels: Facebook Page & Instagram DM

### Как работает один webhook для двух каналов

Meta отправляет все входящие события на **один endpoint** `/webhook/meta`. Тип события и источник определяется по полям payload:

```typescript
// Входящий webhook payload
{
  object: 'page',        // FB Page Messenger
  // или
  object: 'instagram',  // Instagram DM

  entry: [{
    id: '<page_id или ig_account_id>',  // по этому определяем tenant
    messaging: [{
      sender: { id: '<user_psid>' },
      recipient: { id: '<page_id>' },
      message: {
        text: 'Привет, есть столик на двоих?',
        // или
        attachments: [{ type: 'audio', payload: { url: '...' } }],
        // или
        attachments: [{ type: 'image', payload: { url: '...' } }]
      }
    }]
  }]
}
```

**Tenant lookup по channel:**
```typescript
// Table: tenant_channels
{
  id: uuid (PK)
  tenant_id: uuid (FK)
  channel_type: 'facebook_page' | 'instagram'
  channel_id: string           // page_id или ig_account_id
  access_token: encrypted_text // page access token (долгосрочный)
  is_active: boolean
  connected_at: timestamp
}

// При входящем webhook:
const channel = await db.tenant_channels.findFirst({
  where: { channel_id: entry.id, is_active: true }
})
// → находим tenant → обрабатываем сообщение
```

### Подключение FB Page (OAuth flow)

Владелец бизнеса подключает свою FB Page через OAuth в onboarding:

```
1. Клиент кликает "Connect Facebook Page"
2. Редирект на Facebook OAuth:
   https://www.facebook.com/dialog/oauth?
     client_id={META_APP_ID}
     &redirect_uri={APP_URL}/oauth/facebook/callback
     &scope=pages_messaging,pages_read_engagement,pages_manage_metadata
3. Клиент выбирает свою Page и разрешает доступ
4. Meta возвращает short-lived token → меняем на long-lived page access token
5. Сохраняем page_id + access_token в tenant_channels (зашифрованно)
```

### Подключение Instagram

Instagram DM требует чтобы IG аккаунт был **Professional (Business или Creator)** и **связан с FB Page**:

```
1. Клиент кликает "Connect Instagram"
2. Тот же OAuth flow + дополнительный scope:
   instagram_basic,instagram_manage_messages
3. Получаем ig_user_id через Graph API
4. Сохраняем в tenant_channels
```

**Важно:** Instagram DM автоматизация требует того же App Review, что и FB Messenger. Одна заявка покрывает оба канала.

### Отправка ответа через Graph API

```typescript
// Отправить текстовый ответ
async function sendMessage(channel: TenantChannel, recipientId: string, text: string) {
  const url = `https://graph.facebook.com/v22.0/me/messages`

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: decrypt(channel.access_token),
      recipient: { id: recipientId },
      message: { text },
    })
  })
}
```

### Webhook Verification (одноразовая настройка)

Meta проверяет webhook при первой регистрации:

```typescript
app.get('/webhook/meta', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge)
  } else {
    res.sendStatus(403)
  }
})
```

### Comment-to-DM Funnel (FB Page & Instagram)

**Схем:** Хэрэглэгч post-д comment бичихэд систем автоматаар:
1. Comment-д нийтийн богино хариу бичнэ: *"Танд мэдээлэл илгээлээ, чатаа шалгана уу 📩"*
2. Тэр хүнд шууд DM илгээнэ → тэндээс AI chat эхэлнэ

```
Хэрэглэгч: "Үнэ хэд вэ?" [post-д comment]
        ↓
Систем (public comment хариу):
  "Сайн уу! Танд дэлгэрэнгүй мэдээлэл илгээлээ,
   inbox-оо шалгана уу 📩"
        ↓
Систем (DM автоматаар):
  "Сайн байна уу! Та манай постод сонирхол
   илэрхийлсэнд баярлалаа 🙏
   Би танд дэлгэрэнгүй мэдээлэл өгөхөд бэлэн байна.
   Юуны талаар мэдэхийг хүсч байна вэ?"
        ↓
Хэрэглэгч DM нээж хариулна → AI chat үргэлжилнэ
```

#### Webhook: Comment илрүүлэх

FB Page болон IG comment ирэхэд webhook **`feed` / `comments` field**-ээр мэдэгдэнэ:

```typescript
// FB Page comment webhook payload
{
  object: 'page',
  entry: [{
    id: '<page_id>',
    changes: [{
      field: 'feed',
      value: {
        item: 'comment',
        comment_id: '123456_789',
        post_id: '123456_111',
        from: { id: '<user_psid>', name: 'Bolormaa' },
        message: 'Үнэ хэд вэ?',
        created_time: 1234567890
      }
    }]
  }]
}

// IG comment webhook payload
{
  object: 'instagram',
  entry: [{
    id: '<ig_account_id>',
    changes: [{
      field: 'comments',
      value: {
        id: '<comment_id>',
        text: 'Захиалга хийж болох уу?',
        from: { id: '<ig_user_id>', username: 'user123' },
        media: { id: '<post_id>' }
      }
    }]
  }]
}
```

#### Flow: Comment илрүүлсний дараах логик

```typescript
async function handleComment(tenantId: string, comment: CommentPayload) {

  // 1. Давхардал шалгах — нэг comment-д нэг л удаа хариулна
  const alreadyReplied = await redis.get(`comment_replied:${comment.comment_id}`)
  if (alreadyReplied) return

  // 2. Public comment хариу бичих
  await postPublicCommentReply(
    comment.comment_id,
    tenant.comment_auto_reply_text,  // tenant-ийн тохируулсан текст
    channel.access_token
  )

  // 3. DM илгээх
  await sendDM(channel, comment.from.id, tenant.comment_dm_opener_text)

  // 4. Redis-д тэмдэглэх (TTL 24 цаг) — дахин хариулахгүй
  await redis.set(`comment_replied:${comment.comment_id}`, '1', 'EX', 86400)

  // 5. Conversation DB-д үүсгэх (DM flow-тай ижил)
  await createOrUpdateConversation({
    tenantId,
    contactId: comment.from.id,
    channel: 'facebook_page', // эсвэл 'instagram'
    source: 'comment_funnel', // хаанаас ирсэн тэмдэглэх
    triggerPostId: comment.post_id,
  })
}
```

#### Graph API: Public comment хариу бичих

```typescript
async function postPublicCommentReply(
  commentId: string,
  message: string,
  accessToken: string
) {
  await fetch(`https://graph.facebook.com/v22.0/${commentId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken })
  })
}
```

#### Tenant тохиргоо (Onboarding / Settings-д)

Tenant admin өөрийн comment funnel текстийг тохируулна:

```
┌─ Comment Auto-Reply Settings ──────────────────┐
│                                                │
│ Public comment хариу:                          │
│ ┌────────────────────────────────────────────┐ │
│ │ Сайн уу! Танд дэлгэрэнгүй мэдээлэл        │ │
│ │ илгээлээ, inbox-оо шалгана уу 📩           │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ DM opener (AI-н эхний мессеж):                 │
│ ┌────────────────────────────────────────────┐ │
│ │ Сайн байна уу! Та манай постод сонирхол    │ │
│ │ илэрхийлсэнд баярлалаа 🙏                  │ │
│ │ Танд дэлгэрэнгүй мэдээлэл өгөхөд бэлэн.   │ │
│ │ Юуны талаар мэдэхийг хүсч байна вэ?        │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ [✅ FB Page comment] [✅ Instagram comment]     │
│                                                │
│ [ Save ]                                       │
└────────────────────────────────────────────────┘
```

```typescript
// Table: tenants (нэмэлт талбарууд)
{
  comment_auto_reply_enabled: boolean   // default: true
  comment_auto_reply_text: text         // public comment хариу
  comment_dm_opener_text: text          // DM-ийн эхний мессеж
}
```

#### Webhook Subscription-д нэмэх field-үүд

Comment funnel ажиллуулахын тулд webhook subscription-д нэмэлт field-үүд subscribe хийх шаардлагатай:

```typescript
// FB Page-д зориулан:
subscribed_fields: [
  'messages',        // DM (өмнө байсан)
  'feed',            // ← ШИНЭ: post comments
]

// IG-д зориулан:
subscribed_fields: [
  'messages',        // DM (өмнө байсан)
  'comments',        // ← ШИНЭ: post comments
]
```

#### Онцлог тохиолдлууд (edge cases)

- **Хуурамч comment давхардал:** Нэг хэрэглэгч нэг post-д 2 comment бичвэл — зөвхөн эхний comment-д DM явуулна. `comment_replied` Redis key нь `from.id + post_id` хослолоор хадгална.
- **Хуучин post-ийн comment:** Хэрэв post 30+ хоногийн өмнөх бол DM явуулахгүй (configurable per tenant).
- **Page өөрийн comment-д хариу:** `from.id === page_id` бол үл тоох — өөрийн comment-дoo хариулахгүй.
- **IG-д DM илгээх хязгаарлалт:** IG Professional аккаунт comment-с DM явуулахын тулд тухайн хэрэглэгч IG аккаунтаа **бизнесийн хуудастай холбосон** байх шаардлагатай. Хэрэв болохгүй бол зөвхөн public comment хариуг бич, DM-г алгасна.

---

## Inbound Message Buffering

**Проблема:** Клиенты пишут короткими сообщениями подряд:
```
[14:32:01] сайн уу
[14:32:04] захиалга хийхийг хүсч байна
[14:32:09] 2 хүний ширээ
[14:32:15] маргааш оройн 7 цагт
[14:32:22] болох уу?
```

Если AI отвечает на каждое сообщение — спамит частичными ответами. Решение: adaptive buffer.

### Adaptive Buffer Logic

```typescript
// Per tenant_id + sender_id

onIncomingMessage(msg) {
  appendToBuffer(key, msg)
  resetTimer(key, INITIAL_WAIT_MS) // 8 секунд
}

onTimerFired(key) {
  if (bufferAge(key) > HARD_CAP_MS) { // 15 сек
    flush(key)
    return
  }
  flush(key) // все сообщения → один AI запрос
}
```

**Примечание:** FB/IG не предоставляют "typing" presence events как WhatsApp, поэтому используем только time-based buffering (без presence-based продления). Это нормально — большинство пользователей делают паузу между серией сообщений.

### Timing Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `INITIAL_WAIT_MS` | 8000 (8 сек) | Ожидание после первого сообщения |
| `HARD_CAP_MS` | 15000 (15 сек) | Максимальное время буфера |

### Implementation Notes

- Реализация через **BullMQ delayed jobs**: ключ `buffer:${tenantId}:${senderId}`
- Хранение буфера: Redis hash с TTL = 20 сек. Структура: массив `{messageId, text, mediaUrl, timestamp}`
- **Race condition guard:** при flush лочить буфер (Redis SETNX)
- **Manual reply override:** если оператор взял `human_active`, буфер flush'ится немедленно в дашборд, AI не обрабатывает

---

## Manual Reply & Human Takeover

Платформа автоматизирует 90%+ обращений, но оператор может взять разговор в любой момент.

### Conversation States

| State | Description | AI behavior |
|-------|-------------|-------------|
| `ai_active` | AI обрабатывает автоматически | Отвечает на все входящие |
| `human_active` | Оператор ведёт вручную | AI приостановлен для этого контакта |
| `awaiting_human` | AI запросил передачу | AI не отвечает, в дашборде — флаг |
| `resolved` | Разговор завершён | AI снова активен при новом сообщении |

### Auto-Handoff Triggers (AI → Human)

AI переводит в `awaiting_human` когда:
- Клиент пишет ключевые слова: «оператор», «менеджер», «хүн», «гомдол», «буцаалт»
- AI confidence score < threshold (configurable per tenant)
- Клиент отправил 3+ сообщения без удовлетворительного ответа (configurable)

### Auto-Resume Rules (Human → AI)

Разговор возвращается в `ai_active` когда:
- Оператор явно нажимает «Resolved» / «Return to AI»
- Operator inactivity timeout: default 24 часа
- Клиент не пишет 7 дней

### Critical Constraints

- **Single source of replies:** ВСЕ ручные ответы через дашборд, не через FB/IG напрямую.
- **AI lock during human reply:** Когда оператор начал печатать, AI блокируется на этот контакт.
- **Audit trail:** Каждое сообщение имеет `sent_by` поле (`ai` | `operator_id` | `customer`).

### Database Schema

```typescript
// Table: conversations
{
  id: uuid (PK)
  tenant_id: uuid (FK)
  channel_type: 'facebook_page' | 'instagram'
  contact_identifier: string    // psid (FB page-scoped user ID) или ig user id
  contact_name: string | null
  status: 'ai_active' | 'human_active' | 'awaiting_human' | 'resolved'
  assigned_operator_id: string | null
  last_human_activity_at: timestamp | null
  handoff_reason: string | null
}

// UNIQUE constraint: (tenant_id, channel_type, contact_identifier)

// Table: messages
{
  id: uuid (PK)
  conversation_id: uuid (FK)
  tenant_id: uuid (FK)
  content: text
  media_url: string | null
  sent_by: 'ai' | 'customer' | string  // operator user_id
  ai_confidence: float | null
  created_at: timestamp
}
```

---

## AI Models & Provider Configuration

Каждый тенант имеет независимый выбор моделей по трём осям: **Text**, **Vision**, **STT**.

### Three Independent Selectors per Tenant

| Selector | Available Options | Используется для |
|----------|-------------------|------------------|
| **Text Model** | GPT-5.1, Gemini 3 Flash, Grok 4.1 Fast | Conversational replies |
| **Vision Model** | GPT-5.1, Gemini 3 Flash | Анализ изображений от клиентов |
| **STT Model** | OpenAI Whisper | Транскрипция голосовых сообщений (монгол хэл) |

### Pricing Table

#### Text Models

| Provider | Model | Input (per 1M) | Output (per 1M) | ≈ per message |
|----------|-------|----------------|-----------------|---------------|
| OpenAI | gpt-5.1 | $1.25 | $10.00 | ≈$0.005 |
| Google | gemini-3-flash | $0.50 | $3.00 | ≈$0.002 |
| xAI | grok-4.1-fast | $0.20 | $0.50 | ≈$0.0007 |

*≈ per message: дундаж ~500 input + 200 output tokens.*

#### Vision Models

| Provider | Model | ≈ per image |
|----------|-------|-------------|
| OpenAI | gpt-5.1 | ≈$0.005 |
| Google | gemini-3-flash | ≈$0.002 |

#### STT Model

| Provider | Model | Price | Монгол хэл |
|----------|-------|-------|------------|
| OpenAI | whisper-1 | $0.006/мин | ✅ Тийм (`mn`) |

### Pricing Configuration File

```typescript
// src/config/model-pricing.ts
//
// PRICING UPDATE WORKFLOW:
// Claude Code-д: "Search web for current pricing for GPT-5.1, Gemini 3 Flash,
// Grok 4.1 Fast, OpenAI Whisper. Update model-pricing.ts."

export const MODEL_PRICING = {
  text: {
    'gpt-5.1': {
      provider: 'openai' as const,
      modelId: 'gpt-5.1',
      displayName: 'GPT-5.1',
      inputPer1M: 1.25,
      outputPer1M: 10.0,
      avgCostPerMessage: 0.005,
      supportsVision: true,
      isActive: true,
      notes: 'Universal, найдвартай, vision багтаасан',
    },
    'gemini-3-flash': {
      provider: 'google' as const,
      modelId: 'gemini-3-flash',
      displayName: 'Gemini 3 Flash',
      inputPer1M: 0.50,
      outputPer1M: 3.00,
      avgCostPerMessage: 0.002,
      supportsVision: true,
      isActive: true,
      notes: 'Хурдан, хямд, vision багтаасан',
    },
    'grok-4.1-fast': {
      provider: 'xai' as const,
      modelId: 'grok-4-1-fast',
      displayName: 'Grok 4.1 Fast',
      inputPer1M: 0.20,
      outputPer1M: 0.50,
      avgCostPerMessage: 0.0007,
      supportsVision: false,
      isActive: true,
      notes: 'Хамгийн хямд, 2M context. Vision сул — зурганд Vision Model ашиглана.',
    },
  },
  vision: {
    'gpt-5.1': { /* same shape, supportsVision: true */ },
    'gemini-3-flash': { /* same shape, supportsVision: true */ },
  },
  stt: {
    'whisper-1': {
      provider: 'openai' as const,
      modelId: 'whisper-1',
      displayName: 'OpenAI Whisper',
      pricePerMinute: 0.006,
      isActive: true,
      notes: 'Монгол хэл дэмждэг (mn). OpenAI key-г ашиглана — нэмэлт key хэрэггүй.',
    },
  },
  lastUpdated: '2026-05-26',
} as const

export type TextModelId = keyof typeof MODEL_PRICING.text
export type VisionModelId = keyof typeof MODEL_PRICING.vision
export type SttModelId = keyof typeof MODEL_PRICING.stt
```

### Per-Tenant API Keys

```typescript
// Table: tenant_api_keys (AES-256-GCM encrypted)
{
  tenant_id: uuid (FK, PK)
  openai_key: encrypted_text | null     // Text/Vision GPT + Whisper STT
  gemini_key: encrypted_text            // ОБЯЗАТЕЛЬНЫЙ для всех тенантов (RAG)
  xai_key: encrypted_text | null        // если выбран Grok
  updated_at: timestamp
  updated_by: uuid
}
```

**Gemini API key обязателен** для каждого тенанта — нужен для File Search RAG, даже если text/vision модели — другие.

**OpenAI key** покрывает и Text (GPT-5.1) и STT (Whisper) — один ключ для обоих.

### Vision Fallback Logic

Если Text Model = Grok и приходит сообщение с изображением:

```typescript
async function processIncomingMessage(msg, tenant) {
  if (msg.hasImage) {
    const visionResult = await analyzeImage(msg.image, tenant.visionModel)
    const reply = await generateText({
      model: getProvider(tenant, 'text'),
      messages: [
        ...history,
        { role: 'user', content: `${msg.text}\n\n[Зургийн тайлбар: ${visionResult}]` }
      ]
    })
    return reply
  }
  return generateText({ model: getProvider(tenant, 'text'), messages: [...history, msg] })
}
```

---

## Multi-Tenant Architecture & User Roles

### User Roles

| Role | Хэн | Юу харж чадах |
|------|----|----------------|
| `super_admin` | Платформын эзэн | Бүх tenant: жагсаалт, үүсгэх/засах/түдгэлзүүлэх, cross-tenant usage |
| `tenant_admin` | Бизнесийн эзэн (клиент) | Зөвхөн өөрийн tenant: inbox, knowledge base, AI persona, загварууд, API keys |

**MVP-д нэг tenant-д нэг хэрэглэгч** — тухайн бизнесийн эзэн өөрөө. Олон оператор — ирээдүйн функц.

### Database Schema

```typescript
// Table: users
{
  id: uuid (PK)
  email: string (unique)
  password_hash: string
  role: 'super_admin' | 'tenant_admin'
  is_active: boolean
  force_password_change: boolean  // true при первом логине
  created_at: timestamp
  last_login_at: timestamp | null
}

// Table: tenants
{
  id: uuid (PK)
  name: string                      // 'Nomad Restaurant', 'Glow Salon'
  status: 'active' | 'suspended' | 'pending_setup'
  owner_user_id: uuid (FK)
  ai_persona: text                  // system prompt
  timezone: string                  // 'Asia/Ulaanbaatar'
  industry: string | null           // 'restaurant' | 'salon' | 'online_shop'
  created_at: timestamp
  suspended_at: timestamp | null
  suspended_reason: string | null
}

// Table: tenant_channels
{
  id: uuid (PK)
  tenant_id: uuid (FK)
  channel_type: 'facebook_page' | 'instagram'
  channel_id: string                // page_id или ig_account_id
  channel_name: string | null       // display name
  access_token: encrypted_text
  token_expires_at: timestamp | null
  is_active: boolean
  connected_at: timestamp
}
```

### Tenant Isolation Middleware

```typescript
async function tenantIsolation(req, res, next) {
  if (req.user.role === 'super_admin') {
    req.tenantScope = req.query.tenantId || 'ALL'
  } else {
    req.tenantScope = req.user.tenantId
  }
  next()
}
```

Все Prisma-запросы под `/api/tenant/*` автоматически получают `WHERE tenant_id = ?`.

### Tenant Suspension

Когда suspend:
1. `tenants.status = 'suspended'`
2. AI перестаёт отвечать (Meta webhook получен, но обработка заблокирована)
3. Клиент может логиниться — read-only режим
4. Manual reply отключен
5. AI usage не списывается

### Super-Admin Capabilities (`/admin`)

- Список всех tenant с status, последней активностью, AI usage за месяц
- Создание/редактирование/suspend/delete tenant
- Cross-tenant usage: общие расходы AI по всем клиентам
- Audit log действий super-admin

### Tenant-Admin Capabilities (`/app`)

1. **Inbox** — все разговоры (FB + IG), real-time, manual reply
2. **Knowledge Base** — upload/delete файлов
3. **AI Persona** — editable system prompt
4. **Model Selection** — Text/Vision/STT с ценами
5. **API Keys** — view (masked) + edit + reveal
6. **Usage & Costs** — текущий месяц, график
7. **Channel Status** — FB Page / IG подключён/отключён, кнопка переподключения

---

## Deployment & Infrastructure

### Railway Project Structure

```
my-ai-platform (Railway project)
├── web              ← Node.js + Express + React static
├── postgres         ← managed PostgreSQL
└── redis            ← managed Redis
```

### Repository Structure (monorepo)

```
project-root/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── model-pricing.ts
│   │   ├── services/
│   │   │   ├── meta-webhook.service.ts
│   │   │   ├── ai.service.ts
│   │   │   └── voice.service.ts
│   │   ├── routes/
│   │   └── server.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── package.json
├── frontend/
│   ├── src/
│   ├── dist/
│   ├── vite.config.ts
│   └── package.json
├── package.json         ← root workspaces
├── railway.json
└── CLAUDE.md
```

### Environment Variables

#### Auto-injected by Railway

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Postgres service |
| `REDIS_URL` | Redis service |
| `PORT` | Railway |
| `RAILWAY_ENVIRONMENT` | Railway |

#### Manual (задаёт в Railway dashboard)

| Variable | Purpose | How to generate |
|----------|---------|-----------------|
| `JWT_SECRET` | JWT signing | `openssl rand -hex 64` |
| `ENCRYPTION_KEY` | AES-256 для API keys клиентов | `openssl rand -hex 32` |
| `SUPER_ADMIN_EMAIL` | Bootstrap | Email владельца |
| `SUPER_ADMIN_PASSWORD` | Bootstrap (удалить после) | Сложный пароль |
| `APP_URL` | Public URL | `https://yourapp.up.railway.app` |
| `META_APP_ID` | Meta Developer App | Из Meta Developer Console |
| `META_APP_SECRET` | Meta Developer App | Из Meta Developer Console |
| `META_WEBHOOK_VERIFY_TOKEN` | Webhook verification | `openssl rand -hex 16` |

### Capacity Planning

| Tenant тоо | Railway план | Зардал/сар |
|------------|-------------|-----------|
| 1-10 tenant | Hobby | $5 |
| 10-20 tenant | Pro | $20 |
| 20+ tenant | Pro + monitor | $20-40 |

**Дурамжлал:** FB/IG webhook-based — persistent connection байхгүй (WhatsApp Baileys-с ялгаатай). Тиймээс RAM хэрэглээ хамаагүй бага. 10 tenant = ~200-400 MB RAM (Baileys байсан бол 1 GB+ байх байсан).

### Deployment Checklist

1. ☐ Railway project үүсгэх, Postgres + Redis нэмэх
2. ☐ `JWT_SECRET` үүсгэх: `openssl rand -hex 64`
3. ☐ `ENCRYPTION_KEY` үүсгэх: `openssl rand -hex 32` — **тусдаа хадгалах!**
4. ☐ Meta Developer Console-д App үүсгэх, App ID + Secret авах
5. ☐ `META_WEBHOOK_VERIFY_TOKEN` үүсгэх: `openssl rand -hex 16`
6. ☐ Бүх env vars Railway dashboard-д тохируулах
7. ☐ GitHub repo холбох → Railway автодеплой
8. ☐ `/api/health` шалгах
9. ☐ Super-admin аккаунтаар нэвтрэх
10. ☐ `SUPER_ADMIN_PASSWORD` env var устгах
11. ☐ Meta webhook URL бүртгэх: `{APP_URL}/webhook/meta`
12. ☐ App Review хүсэх (Advanced Access) — нэг удаагийн процесс
13. ☐ Тестийн tenant үүсгэж бүрэн flow шалгах

---

## Tenant Onboarding Flow

Onboarding — **super_admin** `/admin` панелиас ажиллуулдаг checklist dashboard. Шугаман wizard биш — дурын дарааллаар бөглөж болно.

### Checklist Dashboard

```
┌─ Onboarding: Nomad Restaurant ─────────────────┐
│ Status: pending_setup                           │
│ Progress: 5 / 6 steps                           │
│                                                 │
│ ✅ 1. Tenant Info        (нэр, холбоо барих)    │
│ ✅ 2. Login Credentials  (email + нууц үг)      │
│ ✅ 3. API Keys           (Gemini + нэг text key)│
│ ✅ 4. AI Models          (Text/Vision/STT)       │
│ ✅ 5. AI Persona         (system prompt)         │
│ ⚪ 6. Connect Channels   (FB Page / IG)          │
│ ⚪ 7. Knowledge Base     (optional)              │
│                                                 │
│ [ Activate Tenant ] (6 дуусаагүй бол идэвхгүй) │
└────────────────────────────────────────────────┘
```

**Активжуулахад минимум:** 1-6 алхам. Knowledge base (7) — заавал биш.

### Step 1: Tenant Info

- Business name
- Contact email
- Timezone (`Asia/Ulaanbaatar` default)
- Industry: `restaurant` | `salon` | `online_shop` | `other`

### Step 2: Login Credentials

- Клиентийн email (нэвтрэх нэр болно)
- Түр нууц үг
- `force_password_change: true` — эхний нэвтрэлтэд заавал солих

### Step 3: API Keys

| Field | Шаардлагатай | Тэмдэглэл |
|-------|-------------|-----------|
| Gemini API key | **Тийм** (үргэлж) | RAG-д хэрэгтэй |
| OpenAI API key | Нөхцөлт | GPT / Whisper-д хэрэгтэй |
| xAI (Grok) API key | Нөхцөлт | Grok text-д хэрэгтэй |

Бүх key-г AES-256-GCM-ээр шифрлэж БД-д хадгална.

### Step 4: AI Model Selection

3 selector (Text / Vision / STT) үнийн мэдээлэлтэй (model-pricing.ts-с).

### Step 5: AI Persona

Editable textarea. Монгол дээр бичиж болно:

```
┌─ AI Persona (System Prompt) ───────────────────┐
│ ┌────────────────────────────────────────────┐ │
│ │ Чи "Nomad" рестораны менежер юм.           │ │
│ │ Монгол хэлээр найрсгаар хариул.            │ │
│ │ Ажлын цаг: 11:00-22:00.                    │ │
│ │ Хэрэглэгч ширээ захиалбал — хүний тоо,     │ │
│ │ цаг асуу.                                  │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ [Save Draft]  [Test with sample message]       │
└────────────────────────────────────────────────┘
```

### Step 6: Connect Channels (FB Page / Instagram)

**FB Page холболт:**

```
1. "Connect Facebook Page" товч → Meta OAuth
2. Клиент өөрийн FB Page сонгоод зөвшөөрөл өгнө
3. Long-lived page access token авч БД-д хадгална
4. Webhook subscription тохируулна
5. Status: "Connected ✅"
```

**Instagram DM холболт (нэмэлт):**

```
1. "Connect Instagram" товч → Meta OAuth (нэмэлт scope)
2. IG Professional аккаунт FB Page-тэй холбогдсон байх ёстой
3. Status: "Connected ✅"
```

**Хэрэв App Review дуусаагүй бол:** Dev mode-д тест хийж болно. Production-д App Review шаардлагатай (нэг удаа).

### Step 7: Knowledge Base Upload

Drag-and-drop:
- Дэмжих: PDF, DOCX, TXT
- Хэмжээний хязгаар байхгүй (Gemini File Search хадгалалт үнэгүй)
- Upload → Gemini File Search API → `corpus_id` буцаана
- `tenant_knowledge_files` хүснэгтэд холбоос хадгална

### Activation

Алхам 1-6 бэлэн болсны дараа "Activate Tenant" идэвхжинэ:

1. `tenants.status = 'active'`
2. Meta webhook subscription идэвхжинэ
3. Клиентэд email: "Таны AI туслах идэвхжлээ. Нэвтрэх: {APP_URL}"

### Post-Activation: Client First Login

1. Нууц үг солих дэлгэц (заавал)
2. Богино tour (3-5 алхам): Inbox, загварууд, knowledge base
3. Тест: "Нөгөө утаснаасаа зурвас илгээж AI хариулт харна уу"

### Re-onboarding

- FB Page холболт тасарсан → "Reconnect FB Page" (дахин OAuth)
- IG холболт тасарсан → "Reconnect Instagram"
- API key хүчингүй → "Update API key" settings-д

---

## AI Models: Knowledge Base & Persona

### Knowledge Base RAG (Gemini File Search)

```typescript
const ragContext = await geminiFileSearch.query({
  apiKey: tenant.apiKeys.gemini,
  corpusId: tenant.knowledgeBaseCorpusId,
  query: customerMessage,
})

const reply = await generateText({
  model: getProvider(tenant),
  system: `${tenant.aiPersona}\n\nМэдлэгийн сангаас холбогдох мэдээлэл:\n${ragContext.text}`,
  messages: [...history]
})
```

### AI Always-On (24/7)

AI тогтмол 24/7 ажиллана. "Ажлын цаг" хязгааргүй — клиент AI Persona prompt-дoo тохируулна:

```typescript
const systemMessage = `${tenant.ai_persona}

Одоогийн цаг: ${new Date().toLocaleString('mn-MN', { timeZone: tenant.timezone })}
Timezone: ${tenant.timezone}`
```

---

## Cost Monitoring per Tenant

```typescript
// Table: ai_usage_log
{
  id: uuid
  tenant_id: uuid (FK, indexed)
  timestamp: timestamp
  category: 'text' | 'vision' | 'stt' | 'rag'
  provider: string
  model_id: string
  input_tokens: int
  output_tokens: int
  duration_seconds: int | null   // STT-д
  estimated_cost_usd: decimal
  conversation_id: uuid | null
}
```

Tenant admin харах:
- Сарын нийт зардал (ангиллаар)
- Өдрөөр график
- Хамгийн үнэтэй яриа top 10

Super-admin бүх tenant-дын нэгдсэн мэдээллийг харна.

---

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
