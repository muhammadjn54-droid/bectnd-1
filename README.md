# Product API (Swagger / OpenAPI) — v2

REST API барои идораи маҳсулот: **ном, миқдор, нархи харид, нархи фурӯш**
(бо ҳисоби худкори фоида), ва бор кардани **2 то 6 расм** барои ҳар маҳсулот
(расмҳо худкор фишурда мешаванд).

## Нав дар ин версия
- ✅ **CORS кушода шуд** — frontend аз ҳар домен (Netlify, Vercel, ва ғ.) метавонад бе хатогӣ пайваст шавад
- ✅ **Расмҳо**: ҳадди ақал **2**, ҳадди аксар **6** (пеш аз ин 5–10 буд)
- ✅ **Фишурдани худкори расмҳо**: ҳар расм то 1280px васеъ карда, ба WebP (сифати 72%) табдил дода мешавад — андозаи файл даҳҳо маротиба хурдтар мешавад, сомона тезтар кор мекунад
- ✅ **Нархи харид/фурӯш + фоида**: ба ҷои як `price`, акнун `costPrice` (нархи харид) ва `sellPrice` (нархи фурӯш) ҳастанд; API худкор ҳисоб мекунад:
  - `profitPerUnit` = sellPrice − costPrice
  - `totalCost` = costPrice × quantity
  - `totalRevenue` = sellPrice × quantity
  - `totalProfit` = totalRevenue − totalCost

**Мисол** (мисоли ту — ручка): costPrice=0.50, sellPrice=1.00, quantity=50 →
`totalCost=25`, `totalRevenue=50`, `totalProfit=25` сомонӣ.

## Кор фармоӣ

```bash
npm install
npm start
```

Swagger UI: **http://localhost:3000/api-docs**
Дар продакшн: **https://becend-7ryb.onrender.com/api-docs/**

## Эндпоинтҳо

| Метод | Роҳ | Тавсиф |
|---|---|---|
| GET | /api/products | Рӯйхати ҳамаи маҳсулот (бо фоида) |
| POST | /api/products | Сохтани маҳсулот (`name`, `quantity`, `costPrice`, `sellPrice`) |
| GET | /api/products/{productId} | Гирифтани як маҳсулот |
| PUT | /api/products/{productId} | Таҳрир кардани маҳсулот |
| DELETE | /api/products/{productId} | Нест кардани маҳсулот |
| POST | /api/products/{productId}/images | Бор кардани 2–6 расм (auto-compressed) |
| GET | /api/products/{productId}/images | Рӯйхати расмҳо |
| DELETE | /api/products/{productId}/images/{imageId} | Нест кардани як расм |

## Қоидаҳои валидатсия
- **name**: ҳатмӣ, на холӣ, ≤200 аломат
- **quantity**: ҳатмӣ, бутуни на манфӣ
- **costPrice / sellPrice**: ҳатмӣ, рақами на манфӣ
- **images**: ҳангоми бор кардан ҳатмӣ, **2 то 6** файл, ҳар як то 15MB (пеш аз фишурдан), навъҳо: jpeg/png/webp

## Тест шуд пеш аз супоридан
CORS preflight, рад кардани upload-и 1-расма (камтар аз 2), қабули 3-расма,
рад кардани 7-расма (зиёда аз 6), фишурдани воқеии расм (аз 47KB → 2.3KB дар
теcт), ва ҳисоби дурусти фоида — ҳама бе хатогӣ дар сервер-лог санҷида шуданд.
