# ساخت و اجرای «راهکار» در یک کانتینر سبک
# مرحله ۱: ساخت خروجیِ فرانت‌اند و وابستگی‌ها
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# مرحله ۲: تصویرِ نهاییِ کوچک
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# کلیدِ امضای توکن باید در اجرا تنظیم شود (حداقل ۳۲ کاراکتر)
ENV JWT_SECRET=

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY database ./database
RUN mkdir -p /app/.data

VOLUME ["/app/.data"]
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# پیش‌فرض: اجرای بدونِ کلیدِ عملیاتی؛ برای استفاده‌ی واقعی JWT_SECRET را تنظیم کنید
CMD ["node", "--experimental-strip-types", "server/index.ts"]
