import { Suspense } from "react";
import { ViewingChatIndex } from "@/components/home/ViewingChatIndex";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ViewingChatIndex />
    </Suspense>
  );
}
