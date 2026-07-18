import { getChatModel } from "./features/ai/utils/model";
import { chatTools } from "./features/ai/tools";
import { generateText, stepCountIs } from "ai";

async function runTest() {
  console.log("=== AI SDK v7 Tool Integration Tests ===\n");

  // ── Test 1: Custom get_weather tool with stopWhen ──
  console.log("--- Test 1: get_weather (custom function tool) ---");
  try {
    const weatherResult = await generateText({
      model: getChatModel(),
      prompt: "What is the current weather in Delhi, India?",
      tools: { get_weather: chatTools.get_weather },
      stopWhen: stepCountIs(5),
      onStepFinish: (step) => {
        console.log(`  [step] finishReason=${step.finishReason}, toolCalls=${step.toolCalls?.map(tc => tc.toolName).join(",") || "none"}, hasText=${!!step.text}`);
      },
    });
    console.log(`  Steps: ${weatherResult.steps.length}`);
    console.log(`  Final text: ${weatherResult.text.slice(0, 200)}...\n`);
  } catch (err: any) {
    console.error("  ERROR:", err.message, "\n");
  }

  // ── Test 2: google_search provider tool ──
  console.log("--- Test 2: google_search (provider-defined tool) ---");
  try {
    const searchResult = await generateText({
      model: getChatModel(),
      prompt: "Who won the Euro 2024 football championship?",
      tools: { google_search: chatTools.google_search },
      stopWhen: stepCountIs(5),
      onStepFinish: (step) => {
        console.log(`  [step] finishReason=${step.finishReason}, toolCalls=${step.toolCalls?.map(tc => tc.toolName).join(",") || "none"}, hasText=${!!step.text}`);
      },
    });
    console.log(`  Steps: ${searchResult.steps.length}`);
    console.log(`  Final text: ${searchResult.text.slice(0, 200)}...\n`);
  } catch (err: any) {
    console.error("  ERROR:", err.message, "\n");
  }

  // ── Test 3: Both tools combined (known limitation test) ──
  console.log("--- Test 3: Both tools combined (expect warning) ---");
  try {
    const combinedResult = await generateText({
      model: getChatModel(),
      prompt: "What is the weather in London right now?",
      tools: chatTools,
      stopWhen: stepCountIs(5),
      onStepFinish: (step) => {
        console.log(`  [step] finishReason=${step.finishReason}, toolCalls=${step.toolCalls?.map(tc => tc.toolName).join(",") || "none"}, hasText=${!!step.text}`);
      },
    });
    console.log(`  Steps: ${combinedResult.steps.length}`);
    console.log(`  Final text: ${combinedResult.text.slice(0, 200)}...\n`);
  } catch (err: any) {
    console.error("  ERROR:", err.message, "\n");
  }

  console.log("=== Tests complete ===");
}

runTest().catch(console.error);
