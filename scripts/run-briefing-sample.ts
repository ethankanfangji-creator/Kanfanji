import { assemblePropertyFacts } from "../lib/property-facts/orchestrator";
import { extractBriefingFoundFacts } from "../lib/viewing-chat/briefing-facts";
import { extractBriefingListingFacts } from "../lib/viewing-chat/briefing-listing";
import {
  BriefingGenerateError,
  generateAddressBriefing,
} from "../lib/viewing-chat/generate-briefing";

const address = process.argv[2] || "2143 Spring Street, Port Moody, BC";
const listingUrl = process.argv[3] || "";

async function run() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY missing");
    process.exit(1);
  }

  console.log(`===== ${address} =====`);
  if (listingUrl) console.log("listingUrl:", listingUrl);

  const card = await assemblePropertyFacts({ address });
  const { facts, sourcesQueried } = extractBriefingFoundFacts(card);
  let listingFacts: Awaited<ReturnType<typeof extractBriefingListingFacts>>["facts"] = [];
  if (listingUrl) {
    const extracted = await extractBriefingListingFacts({ listingUrl, apiKey });
    listingFacts = extracted.facts;
    console.log("listingFacts:", JSON.stringify(listingFacts, null, 2));
  }

  try {
    const briefing = await generateAddressBriefing({
      address,
      locale: "zh-Hant",
      facts,
      listingFacts,
      listingUrl: listingUrl || null,
      sourcesQueried,
      apiKey,
    });
    console.log("sourcesQueried:", briefing.sourcesQueried);
    console.log("summary:", briefing.summary);
    console.log("sources:", briefing.sources);
  } catch (error) {
    if (error instanceof BriefingGenerateError) {
      console.error("briefing failed:", error.code, error.status, error.message);
      process.exit(1);
    }
    throw error;
  }
}

void run();
