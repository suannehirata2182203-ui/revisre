FROM node:18-alpine

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package.json ./
RUN npm install --production

# Копируем остальные файлы
COPY . .

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["node", "server.js"]

