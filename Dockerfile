FROM node:20.19.2
LABEL author=wuyuan
COPY . /
RUN npm install
EXPOSE 3000
CMD ["sh", "-c", "npm run prisma && npm run start"]
