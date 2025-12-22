import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

// 优先从 .env.local 加载（本地测试用）
dotenv.config({ path: ".env.local" });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("未设置 GEMINI_API_KEY（可在 .env.local 或环境变量中配置）");
}

async function main() {
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: [{ role: "user", parts: [{ text: "你好，给我一句中文问候。" }] }],
  });
  console.log("Key 有效，模型响应：", res.text?.trim());
}

main().catch((err) => {
  // 常见错误包含 401/403（无效或权限不足）、404（模型不可用）、429（限流）
  console.error("调用失败：", err.message || err);
  process.exit(1);
});