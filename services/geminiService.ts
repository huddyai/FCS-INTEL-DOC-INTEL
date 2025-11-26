import { GoogleGenAI, GenerateContentResponse, Chat, Modality } from "@google/genai";
import { MODEL_NAME, TTS_MODEL_NAME, SYSTEM_INSTRUCTION } from "../constants";

// Initialize the API client using process.env.API_KEY
const getClient = () => {
  const apiKey = process.env.API_KEY as string;

  if (!apiKey) {
    console.error("❌ Missing API_KEY environment variable");
  }

  return new GoogleGenAI({ apiKey });
};


/**
 * Initializes a chat session with the document content (text) loaded into the context.
 */
export const initializeChatWithDocument = async (
  documentContent: string,
  fileName: string
): Promise<Chat> => {
  const ai = getClient();
  
  const chat = ai.chats.create({
    model: MODEL_NAME,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    },
    history: [
      {
        role: 'user',
        parts: [
          {
            text: `I have uploaded a document named "${fileName}". Here is its full text content:\n\n${documentContent}\n\nPlease analyze this text. Provide a 1-sentence summary to confirm you have read it.`
          }
        ]
      },
      {
        role: 'model',
        parts: [
          {
            text: `I have reviewed the content of **${fileName}**. I am ready to answer your questions, analyze key dates, risks, and provide summaries based on this text.`
          }
        ]
      }
    ]
  });

  return chat;
};

/**
 * Sends a message to the active chat session.
 */
export const sendMessageStream = async (
  chat: Chat, 
  message: string
): Promise<AsyncGenerator<GenerateContentResponse, void, unknown>> => {
  return chat.sendMessageStream({ message });
};

/**
 * Quick analysis for the sidebar stats using text content
 */
export const analyzeDocumentMetadata = async (documentContent: string) => {
  const ai = getClient();
  const previewContent = documentContent.slice(0, 100000); 

  const prompt = `
    Analyze the following document text. Return a valid JSON object (no markdown formatting around it) with the following structure:
    {
      "summary": "A 2 sentence summary of the document",
      "keyTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4"],
      "sentiment": "Positive/Neutral/Negative/Mixed",
      "suggestedQuestions": ["Question 1", "Question 2", "Question 3", "Question 4"]
    }

    Document Text (first 100k chars):
    ${previewContent}
  `;
  
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });
    
    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Metadata analysis failed", error);
    return { summary: "Analysis failed", keyTopics: [], sentiment: "Unknown", suggestedQuestions: [] };
  }
};

/**
 * Generates speech audio from text using Gemini TTS model.
 */
export const generateSpeechFromText = async (text: string): Promise<string | undefined> => {
  const ai = getClient();
  
  try {
    const response = await ai.models.generateContent({
      model: TTS_MODEL_NAME,
      contents: [
        {
          parts: [{ text: text }]
        }
      ],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Zephyr' }
          }
        }
      }
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return audioData;
  } catch (error) {
    console.error("TTS Generation failed:", error);
    return undefined;
  }
};