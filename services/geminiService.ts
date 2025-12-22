import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AnalysisResult, PostureType, SessionSummary } from "../types";
import { POSTURE_LABELS } from "../constants";

// Lazy initialization holder
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    // Access process.env.API_KEY directly as required
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("未检测到 API Key。请在 Netlify 环境变量设置中配置 API_KEY。");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// Using gemini-2.0-flash-exp as it is currently the most stable multimodal model available
const VISION_MODEL = 'gemini-2.0-flash-exp';
// Keep TTS on the specialized model
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    concentrationScore: {
      type: Type.INTEGER,
      description: "A score from 0 to 100 indicating how focused the student appears.",
    },
    isLookingAtScreen: {
      type: Type.BOOLEAN,
      description: "True if the student's eyes are directed at the screen.",
    },
    posture: {
      type: Type.STRING,
      enum: ["GOOD", "SLOUCHING", "TOO_CLOSE", "TOO_FAR", "UNKNOWN"],
      description: "Assessment of the student's sitting posture.",
    },
    hasElectronicDevice: {
      type: Type.BOOLEAN,
      description: "True if a phone, tablet, or gaming device (other than the main computer) is visible and being used.",
    },
    detectedDistractions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of distracting elements or behaviors detected (e.g. 'Playing with phone', 'Eating', 'Talking to others'). Return empty array if none.",
    },
    feedback: {
      type: Type.STRING,
      description: "A short, encouraging, and corrective feedback message in Chinese for the student (max 30 words).",
    },
  },
  required: ["concentrationScore", "isLookingAtScreen", "posture", "hasElectronicDevice", "detectedDistractions", "feedback"],
};

// --- Vision Analysis ---

export async function analyzeStudentState(base64Image: string): Promise<Omit<AnalysisResult, 'timestamp'>> {
  const ai = getAiClient();
  
  // REMOVED try/catch here so App.tsx can handle 429/Quota errors
  const response = await ai.models.generateContent({
    model: VISION_MODEL,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
          },
        },
        {
          text: `请分析这张网课学生的摄像头截图。判断学生的专注度、视线方向、坐姿以及是否有违规电子设备。
          如果学生不在画面中，请将专注度设为0，姿态设为UNKNOWN。
          请严格按照 JSON 格式返回。`,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("No response from Gemini.");
  }

  const data = JSON.parse(text);
  
  return {
    concentrationScore: data.concentrationScore,
    isLookingAtScreen: data.isLookingAtScreen,
    posture: data.posture as PostureType,
    hasElectronicDevice: data.hasElectronicDevice,
    detectedDistractions: data.detectedDistractions || [],
    feedback: data.feedback,
  };
}

export async function generateSessionSummary(history: AnalysisResult[]): Promise<string> {
  if (history.length === 0) return "本次学习时间太短，无法生成报告。";

  const totalScore = history.reduce((sum, item) => sum + item.concentrationScore, 0);
  const avgScore = Math.round(totalScore / history.length);
  const postureCounts = history.reduce((acc, item) => {
    acc[item.posture] = (acc[item.posture] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const mostFrequentPosture = Object.entries(postureCounts).sort((a, b) => b[1] - a[1])[0][0];
  const distractions = history
    .flatMap(h => h.detectedDistractions)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");

  const prompt = `
    我是一名网课专注度监测AI助手。以下是学生在一段学习过程中的数据统计摘要：
    - 学习时长：约 ${history.length * 5} 秒
    - 平均专注度分数：${avgScore}/100
    - 最常出现的姿态：${POSTURE_LABELS[mostFrequentPosture as PostureType]}
    - 检测到的干扰项：${distractions || "无"}
    - 姿态分布数据：${JSON.stringify(postureCounts)}

    请根据以上数据，生成一份给学生的学习总结报告（中文）。
    报告应包含：
    1. 对整体表现的鼓励或点评。
    2. 指出主要的姿态问题（如果有）。
    3. 针对干扰项的改进建议。
    语气要亲切、专业，像一位负责任的助教。字数控制在 200 字以内。
  `;

  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: VISION_MODEL,
      contents: prompt,
    });
    return response.text || "无法生成总结。";
  } catch (e) {
    console.error("Summary generation failed", e);
    return "生成总结报告时发生错误。";
  }
}

// --- Text-to-Speech (Audio) ---

// Helper: Decode base64 to byte array
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper: Decode raw PCM/Audio data into AudioBuffer
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export async function generateSpeech(text: string): Promise<void> {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: { parts: [{ text }] },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' }, 
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
  if (!base64Audio) {
    throw new Error("No audio data returned from Gemini TTS");
  }

  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContext({ sampleRate: 24000 }); 

  const audioBuffer = await decodeAudioData(
    decode(base64Audio),
    ctx,
    24000,
    1
  );

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.start();
}