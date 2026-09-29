import os from "node:os";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import "./db.js";
import { authRoutes } from "./routes/authRoutes.js";
import { assignmentRoutes } from "./routes/assignmentRoutes.js";
import { adminRoutes } from "./routes/adminRoutes.js";

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api", assignmentRoutes);
app.use("/api/admin", adminRoutes);

if (config.serveClient) {
  const dist = path.join(config.projectRoot, "client", "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "파일 크기가 제한을 초과했습니다." });
  }
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "서버 오류가 발생했습니다." });
});

function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

app.listen(config.serverPort, config.host, () => {
  console.log(`API server listening on ${config.host}:${config.serverPort}`);
  const publicPort = config.serveClient ? config.serverPort : config.clientPort;
  localAddresses().forEach((address) => {
    console.log(`내부망 접속 주소: http://${address}:${publicPort}`);
  });
});

