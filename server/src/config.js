import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(projectRoot, ".env") });

export const config = {
  projectRoot,
  host: process.env.HOST || "0.0.0.0",
  clientPort: Number(process.env.CLIENT_PORT || 228),
  serverPort: Number(process.env.SERVER_PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || "local-dev-secret",
  serveClient: process.env.SERVE_CLIENT === "true",
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 200) * 1024 * 1024,
  maxReadmeBytes: 2 * 1024 * 1024,
  databasePath: path.join(projectRoot, "data", "database", "app.sqlite"),
  submissionsDir: path.join(projectRoot, "data", "submissions"),
  admin: {
    id: process.env.ADMIN_ID || "admin",
    password: process.env.ADMIN_PASSWORD || "admin",
    name: process.env.ADMIN_NAME || "관리자"
  }
};

