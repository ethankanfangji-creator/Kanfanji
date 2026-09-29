import { Suspense } from "react";
import { ViewingChatApp } from "@/components/viewing-chat/ViewingChatApp";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ViewingChatApp />
    </Suspense>
  );
}
