FROM node:18-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --production
COPY dist dist
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]