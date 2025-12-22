import OpenAI from "openai";
import { AnalysisResult, PostureType, SessionSummary } from "../types";
import { POSTURE_LABELS } from "../constants";

// 懒加载 DashScope（OpenAI 兼容）客户端
let aiClient: OpenAI | null = null;

function getAiClient(): OpenAI {
  if (!aiClient) {
    const apiKey =
      process.env.DASHSCOPE_API_KEY ||
      process.env.API_KEY || // 兼容旧变量
      "";
    if (!apiKey) {
      throw new Error("未检测到 API Key。请在环境变量中配置 DASHSCOPE_API_KEY。");
    }

    aiClient = new OpenAI({
      apiKey,
      baseURL:
        process.env.DASHSCOPE_BASE_URL ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
      // 浏览器环境下需要显式允许，否则 openai SDK 会拒绝执行
      dangerouslyAllowBrowser: true,
    });
  }
  return aiClient;
}

// 默认模型名称，可在环境变量中覆盖
const VISION_MODEL = process.env.QWEN_VL_MODEL || "qwen3-vl-plus";
const TEXT_MODEL = process.env.QWEN_TEXT_MODEL || "qwen-plus"; // 用于总结

function extractText(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function parseJsonSafely(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("模型未返回有效 JSON");
  }
  return JSON.parse(text.slice(start, end + 1));
}

// --- Vision Analysis with Qwen ---
export async function analyzeStudentState(
  base64Image: string
): Promise<Omit<AnalysisResult, "timestamp">> {
  const ai = getAiClient();
  const imageDataUrl = `data:image/jpeg;base64,${base64Image}`;

  const resp = await ai.chat.completions.create({
    model: VISION_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "你是网课专注度监测助手，请严格按照指令输出 JSON。",
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: imageDataUrl },
          },
          {
            type: "text",
            text: `请分析这张网课学生的摄像头截图，返回如下 JSON：
{
  "concentrationScore": 0-100,
  "isLookingAtScreen": true/false,
  "posture": "GOOD"|"SLOUCHING"|"TOO_CLOSE"|"TOO_FAR"|"UNKNOWN",
  "hasElectronicDevice": true/false,
  "detectedDistractions": ["..."],
  "feedback": "中文鼓励与提醒，30字以内"
}
若学生不在画面中，专注度设为0，posture=UNKNOWN，干扰项可为空数组。仅输出 JSON，不要额外说明。`,
          },
        ],
      },
    ],
  });

  const content = resp.choices?.[0]?.message?.content;
  const text = extractText(content);
  if (!text) {
    throw new Error("模型未返回内容");
  }
  const data = parseJsonSafely(text);

  return {
    concentrationScore: data.concentrationScore,
    isLookingAtScreen: data.isLookingAtScreen,
    posture: data.posture as PostureType,
    hasElectronicDevice: data.hasElectronicDevice,
    detectedDistractions: data.detectedDistractions || [],
    feedback: data.feedback,
  };
}

// --- Session Summary with Qwen ---
export async function generateSessionSummary(
  history: AnalysisResult[]
): Promise<string> {
  if (history.length === 0) return "本次学习时间太短，无法生成报告。";

  const totalScore = history.reduce((sum, item) => sum + item.concentrationScore, 0);
  const avgScore = Math.round(totalScore / history.length);
  const postureCounts = history.reduce((acc, item) => {
    acc[item.posture] = (acc[item.posture] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const mostFrequentPosture = Object.entries(postureCounts).sort((a, b) => b[1] - a[1])[0][0];
  const distractions = history
    .flatMap((h) => h.detectedDistractions)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");

  const prompt = `
你是网课专注度监测助手。以下是学习数据：
- 学习时长：约 ${history.length * 5} 秒
- 平均专注度：${avgScore}/100
- 最常出现的姿态：${POSTURE_LABELS[mostFrequentPosture as PostureType]}
- 检测到的干扰项：${distractions || "无"}
- 姿态分布：${JSON.stringify(postureCounts)}

请生成一段 200 字以内的中文总结，包含：
1) 整体表现鼓励或点评
2) 主要姿态问题（如有）
3) 针对干扰项的改进建议
语气亲切、专业。`;

  try {
    const ai = getAiClient();
    const resp = await ai.chat.completions.create({
      model: TEXT_MODEL,
      temperature: 0.6,
      messages: [
        { role: "system", content: "你是专业的学习助教，请用中文简洁总结。" },
        { role: "user", content: prompt },
      ],
    });
    return extractText(resp.choices?.[0]?.message?.content) || "无法生成总结。";
  } catch (e) {
    console.error("Summary generation failed", e);
    return "生成总结报告时发生错误。";
  }
}

// --- Text-to-Speech ---
// Qwen TTS 接口与现有前端集成差异较大，这里优先使用浏览器 TTS 作为兜底。
export async function generateSpeech(text: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.speechSynthesis) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
    });
  }
}