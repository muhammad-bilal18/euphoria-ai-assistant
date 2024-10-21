import { ChatGPT } from "../lib/llm";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { Document } from "@langchain/core/documents";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { Message } from '../lib/types';

import "pdf-parse";
import "mammoth";

const CHUNK_SIZE = 400;
const CHUNK_OVERLAP = 300;
const RETRIEVER_K = 2;

const pineconeIndexName = process.env.PINECONE_INDEX_NAME!;

const prompt = ChatPromptTemplate.fromTemplate(`
  First, determine if the question is relevant to the context provided. If it's not relevant, respond with a polite message stating that the question is outside the scope of the current document.

  If the question is relevant, answer it based on the context below and also use the chat history for reference. Be concise.

  Context: {context}
  Chat History: {history}
  Question: {input}

  Rules: 
  1. If the question is not relevant to the context, respond with: "I can't assist with that request. However, if you have any questions related to AR/VR, AI, Blockchain or other related topics, feel free to ask, and I’d be happy to provide useful information."
  2. Every response must end with this line: For more details, please contact us at team@ocs.solution
  Note: These rules are very strict and will not be tolerated.
`);

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const embeddings = new OpenAIEmbeddings();

let vectorStore: PineconeStore | null = null;

const getVectorStore = async (docs: Document[]) => {
  if (!vectorStore) {
    const index = pinecone.Index(pineconeIndexName);
    vectorStore = await PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex: index,
      namespace: 'default',
    });
  }
  return vectorStore;
};

const createRetrievalChainFromDocs = async (docs: Document[]) => {
  const baseChain = prompt.pipe(ChatGPT).pipe(new StringOutputParser());
  const vectorStore = await getVectorStore(docs);
  const retriever = vectorStore.asRetriever({ k: RETRIEVER_K });
  return createRetrievalChain({
    combineDocsChain: baseChain,
    retriever,
  });
};

const getLoader = (fileType: string, path: string) => {
  switch (fileType) {
    case 'pdf':
      return new PDFLoader(path);
    case 'docx':
      return new DocxLoader(path);
    default:
      throw new Error('Unsupported file type');
  }
};

const loadAndProcessDocument = async (fileType: string, path: string) => {
  const loader = getLoader(fileType, path);
  const docs = await loader.load();
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
  return textSplitter.splitDocuments(docs);
};

const formatSessionHistory = (session: Message[]) => {
  return session.map((s) => `${s.role}: ${s.content}`).join('\n');
};

const optimizedPromptTemplate = ChatPromptTemplate.fromTemplate(`
  Based on the given question and conversation history, generate a concise and coherent prompt that accurately reflects the core inquiry.
  
  Ensure the generated prompt:
  - Is general yet maintains relevance to the specific question.
  - Aligns with the context provided in the conversation history.
  - Is easy to understand and actionable.
  - If the history is empty then return the same question.
  - If the question is irrelevant to the context, return the same question.
  - Be concise and to the point.
  - Format should be plain simple string.

  Conversation History: {history}
  Question: {question}
`);


const getOptimizedPrompt = async (
  question: string,
  history: string
): Promise<string> => {
  const optimizedPromptChain = optimizedPromptTemplate.pipe(ChatGPT).pipe(new StringOutputParser());
  return await optimizedPromptChain.invoke({ question, history });
};

export const chatWithEuphoria = async (
  question: string,
  session: Message[],
  fileType: string = 'pdf',
  path: string = 'src/documents/js.pdf'
): Promise<ReadableStream> => {
  try {
    const docs = await loadAndProcessDocument(fileType, path);
    const retrievalChain = await createRetrievalChainFromDocs(docs);
    const sessionHistory = formatSessionHistory(session);
    const optimizedPrompt = await getOptimizedPrompt(question, sessionHistory);
    const stream = await retrievalChain.stream({ input: optimizedPrompt, history: sessionHistory });
    return stream;
  } catch (error) {
    console.error("Error in chatWithDocsLocally:", error);
    throw new Error("Failed to process the document or answer the question");
  }
};