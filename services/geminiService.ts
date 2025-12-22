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
// 支持不同语音风格的 TTS，通过调整语音参数和选择不同音色实现
export type VoiceStyle = 'gentle' | 'strict' | 'energetic' | 'calm' | 'motivational';

interface VoiceConfig {
  rate: number;    // 语速 0.1-10
  pitch: number;   // 音调 0-2
  volume: number;  // 音量 0-1
  voiceName?: string; // 优先选择的语音名称（部分匹配）
}

const VOICE_CONFIGS: Record<VoiceStyle, VoiceConfig> = {
  gentle: { rate: 0.9, pitch: 1.3, volume: 0.85, voiceName: '温柔' },      // 温柔学姐：女声，较高音调，较慢，柔和
  strict: { rate: 1.05, pitch: 0.8, volume: 0.95, voiceName: '标准' },     // 严厉老师：男声，较低音调，正常速度，清晰
  energetic: { rate: 1.2, pitch: 0.9, volume: 1.0, voiceName: '活力' },   // 活力教练：男声，中等音调，较快，大声
  calm: { rate: 0.8, pitch: 1.2, volume: 0.75, voiceName: '平静' },        // 平静导师：女声，较高音调，很慢，很柔和
  motivational: { rate: 1.1, pitch: 0.85, volume: 0.98, voiceName: '激励' }, // 励志演讲：男声，较低音调，稍快，较大声
};

// 获取可用的中文语音列表
function getChineseVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().filter(voice => 
    voice.lang.startsWith('zh') || voice.lang.includes('Chinese')
  );
}

// 根据语音风格选择最合适的语音（明确区分男声/女声）
function selectVoice(style: VoiceStyle, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  
  // 根据风格明确选择男声或女声
  const needFemale = style === 'gentle' || style === 'calm';  // 温柔学姐、平静导师用女声
  const needMale = style === 'strict' || style === 'energetic' || style === 'motivational'; // 其他用男声
  
  // 尝试匹配女声的关键词
  const femaleKeywords = ['Female', '女', 'female', 'Xiaoxiao', 'Xiaoyi', 'Xiaoyan', 'Xiaoxuan', 'Xiaomo', 'Xiaoxian', 'Xiaomei'];
  // 尝试匹配男声的关键词
  const maleKeywords = ['Male', '男', 'male', 'Yunxi', 'Yunyang', 'Yunye', 'Yunjian', 'Yunxia', 'Yunhao'];
  
  if (needFemale) {
    // 优先找女声
    for (const keyword of femaleKeywords) {
      const found = voices.find(v => 
        v.name.includes(keyword) || 
        v.name.toLowerCase().includes(keyword.toLowerCase())
      );
      if (found) return found;
    }
    // 如果找不到明确的女声，尝试通过索引选择（通常系统语音列表中女声在前）
    if (voices.length >= 2) {
      return voices[0]; // 通常第一个是女声
    }
  } else if (needMale) {
    // 优先找男声
    for (const keyword of maleKeywords) {
      const found = voices.find(v => 
        v.name.includes(keyword) || 
        v.name.toLowerCase().includes(keyword.toLowerCase())
      );
      if (found) return found;
    }
    // 如果找不到明确的男声，尝试通过索引选择（通常男声在后）
    if (voices.length >= 2) {
      return voices[voices.length - 1]; // 通常最后一个是男声
    }
  }
  
  // 默认返回第一个中文语音
  return voices[0];
}

export async function generateSpeech(text: string, style: VoiceStyle = 'gentle'): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  
  return new Promise((resolve) => {
    // 获取中文语音列表
    let voices = getChineseVoices();
    
    // 如果语音列表为空，等待语音加载完成
    if (voices.length === 0) {
      const checkVoices = () => {
        voices = getChineseVoices();
        if (voices.length > 0) {
          setupAndSpeak();
        } else {
          setTimeout(checkVoices, 100);
        }
      };
      window.speechSynthesis.onvoiceschanged = checkVoices;
      checkVoices();
      return;
    }
    
    setupAndSpeak();
    
    function setupAndSpeak() {
      const config = VOICE_CONFIGS[style];
      const selectedVoice = selectVoice(style, voices);
      
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = config.rate;
      u.pitch = config.pitch;
      u.volume = config.volume;
      
      if (selectedVoice) {
        u.voice = selectedVoice;
      }
      
      u.onend = resolve;
      u.onerror = resolve;
      
      window.speechSynthesis.speak(u);
    }
  });
}