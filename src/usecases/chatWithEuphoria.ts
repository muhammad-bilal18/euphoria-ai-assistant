import { ChatGPT } from "../lib/llm";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { Document } from "@langchain/core/documents";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { Message } from "../lib/types";

import "pdf-parse";
import "mammoth";
import { generateQuestionPrompt, generateAnswerPrompt } from "../lib/prompts";

const CHUNK_SIZE = 400;
const CHUNK_OVERLAP = 300;
const RETRIEVER_K = 2;

const pineconeIndexName = process.env.PINECONE_INDEX_NAME!;

const prompt = ChatPromptTemplate.fromTemplate(generateAnswerPrompt);

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
      namespace: "default",
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
    case "pdf":
      return new PDFLoader(path);
    case "docx":
      return new DocxLoader(path);
    default:
      throw new Error("Unsupported file type");
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
  return session.map((s) => `${s.role}: ${s.content}`).join("\n");
};

const optimizedPromptTemplate = ChatPromptTemplate.fromTemplate(generateQuestionPrompt);

const getOptimizedPrompt = async (
  question: string,
  history: string
): Promise<string> => {
  const optimizedPromptChain = optimizedPromptTemplate
    .pipe(ChatGPT)
    .pipe(new StringOutputParser());
  return await optimizedPromptChain.invoke({ question, history });
};

export const chatWithEuphoria = async (
  question: string,
  session: Message[],
  fileType: string,
  path: string
): Promise<ReadableStream> => {
  try {
    const docs = await loadAndProcessDocument(fileType, path);
    const retrievalChain = await createRetrievalChainFromDocs(docs);
    const sessionHistory = formatSessionHistory(session);
    const optimizedPrompt = await getOptimizedPrompt(question, sessionHistory);
    const stream = await retrievalChain.stream({
      input: optimizedPrompt,
      history: sessionHistory,
    });
    return stream;
  } catch (error) {
    console.error("Error in chatWithDocsLocally:", error);
    throw new Error("Failed to process the document or answer the question");
  }
};
