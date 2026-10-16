FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_CONTACT_EMAIL=support@example.com
ARG NEXT_PUBLIC_OPERATOR_NAME="The Marriage Swipe team"
ENV NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL NEXT_PUBLIC_OPERATOR_NAME=$NEXT_PUBLIC_OPERATOR_NAME
RUN npx next build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.mjs ./
USER node
EXPOSE 3000
CMD ["npx","next","start","-p","3000"]
