import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: Number(process.env.PORT) || 3000,

  NODE_ENV: process.env.NODE_ENV || "development",

  ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
  REDIS_PORT: Number(process.env.REDIS_PORT) || 6379,

  REDIS_HOST: process.env.REDIS_HOST || "localhost",

  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  AWS_REGION: "eu-north-1",
};
