import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { assemblePropertyFacts } from "../lib/property-facts/orchestrator";
import { extractBriefingFoundFacts } from "../lib/viewing-chat/briefing-facts";

const prompt = readFileSync(path.join(process.cwd(), "prompts/briefing.md"), "utf8").trim();

const addresses = [
  "2143 Spring Street, Port Moody",
  "350 W Georgia St, Vancouver, BC",
];

async function run() {
  console.log("===== BRIEFING PROMPT (prompts/briefing.md) =====\n");
  console.log(prompt);
  console.log("\n");

  const apiKey = process.env.OPENAI_API_KEY;
  for (const address of addresses) {
    console.log(`===== ${address} =====`);
    const card = await assemblePropertyFacts({ address });
    const { facts, sourcesQueried } = extractBriefingFoundFacts(card);
    console.log("sourcesQueried:", JSON.stringify(sourcesQueried, null, 2));
    console.log("factsFound:", facts.length);
    console.log("FOUND_FACTS:", JSON.stringify(facts, null, 2));

    if (!facts.length || !apiKey) {
      console.log("points: [] (no facts or no OPENAI_API_KEY)\n");
      continue;
    }

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: `${prompt}\n\nRespond in Traditional Chinese.`,
        },
        {
          role: "user",
          content: `Address: ${address}
locale: zh-Hant

FOUND_FACTS (only these may be used):
${JSON.stringify(facts, null, 0)}

Return JSON: {"points":[{"text":string,"source":string}]}`,
        },
      ],
    });
    console.log("points:", completion.choices[0]?.message?.content?.trim() || "{}");
    console.log("");
  }
}

void run();
