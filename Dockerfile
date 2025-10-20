FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy built application and public files
COPY dist ./dist
COPY public ./public

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Set environment variable for production
ENV NODE_ENV=production
ENV PORT=8080

# Run the application
CMD ["node", "dist/index.js"]
