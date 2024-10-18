import { ChatOpenAI } from "@langchain/openai";
import { Ollama } from "@langchain/ollama";

import { config } from 'dotenv';
config();

export const ChatGPT = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.9,
});
