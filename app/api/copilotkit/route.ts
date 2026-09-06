import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";
import { NextRequest } from "next/server";

function getServiceAdapter() {
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is not configured in .env.local");
  }

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