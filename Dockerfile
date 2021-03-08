FROM node:14-alpine3.10
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --production
COPY . .
CMD ["node", "app/index.js"]