import { NextRequest } from "next/server";
import { ratelimit, setRandomKey } from "@/lib/upstash";
import Replicate from "replicate";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabase } from "@/lib/supabase";

export const config = {
  runtime: "edge",
};

const replicate = new Replicate({
  // get your token from https://replicate.com/account
  auth: process.env.REPLICATE_API_TOKEN || "",
});

export default async function handler(req: NextRequest) {
  const formData = await req.formData();
  const image = formData.get("image") as File;
  if (!image) {
    return new Response("Missing image", { status: 400 });
  }
  const { success } = await ratelimit.limit("upload");
  if (!success) {
    return new Response("Don't DDoS me pls 🥺", { status: 429 });
  }
  if (req.method === "POST") {
    const { key } = await setRandomKey();
    const domain =
      process.env.NODE_ENV === "development"
        ? "https://c14c-2600-1700-b5e4-b50-4dcb-f2e2-e081-ddbe.ngrok-free.app"
        : `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;

    await Promise.allSettled([
      supabaseAdmin.storage.from("data").upload(`/${key}`, image, {
        contentType: image.type,
        cacheControl: "3600",
        upsert: true,
      }),
      supabase.from("data").upsert({ id: key }),
      replicate.predictions.create({
        version:
          "9222a21c181b707209ef12b5e0d7e94c994b58f01c7b2fec075d2e892362f13c",
        input: {
          image,
          target_age: "default",
        },
        webhook: `${domain}/api/images/${key}/webhook`,
        webhook_events_filter: ["completed"],
      }),
    ]).then((results) =>
      results.map((result) => {
        if (result.status === "fulfilled") {
          return result.value;
        } else {
          return result.reason;
        }
      }),
    );

    return new Response(JSON.stringify({ key }));
  } else {
    return new Response("Method Not Allowed", { status: 405 });
  }
}
