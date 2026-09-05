import {
  CopilotRuntime,
  GroqAdapter,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import Groq from "groq-sdk";
import OpenAI from "openai";
import { NextRequest } from "next/server";


function getServiceAdapter() {
  const groqApiKey = process.env.GROQ_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (groqApiKey) {
    const openai = new OpenAI({
      apiKey: groqApiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    return new OpenAIAdapter({
      openai,
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      disableParallelToolCalls: true,
    });
  }

  if (openaiApiKey) {
    const openai = new OpenAI({ apiKey: openaiApiKey });
    return new OpenAIAdapter({
      openai,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      disableParallelToolCalls: true,
    });
  }

  console.warn("Neither GROQ_API_KEY nor OPENAI_API_KEY is configured in .env.local");
  const openai = new OpenAI({
    apiKey: "dummy",
    baseURL: "https://api.groq.com/openai/v1",
  });
  return new OpenAIAdapter({
    openai,
    model: "openai/gpt-oss-120b",
    disableParallelToolCalls: true,
  });
}

export const POST = async (req: NextRequest) => {
  const serviceAdapter = getServiceAdapter();
  const runtime = new CopilotRuntime();
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};