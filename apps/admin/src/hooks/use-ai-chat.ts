import { useCallback, useRef, useState } from "react";

import { chat, chatStream } from "@/api/ai";
import type { AIChatMessage } from "@/api/ai";

interface UseAIChatReturn {
  messages: AIChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  cancel: () => void;
  clearMessages: () => void;
}

export function useAIChat(): UseAIChatReturn {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      setError(null);
      setIsLoading(true);

      const userMessage: AIChatMessage = { role: "user", content: content.trim() };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        let responseContent = "";

        try {
          const stream = chatStream(updatedMessages, {
            signal: abortController.signal,
          });
          for await (const token of stream) {
            responseContent += token;
            setMessages([...updatedMessages, { role: "assistant", content: responseContent }]);
          }
        } catch (streamError) {
          if (streamError instanceof DOMException && streamError.name === "AbortError") {
            return;
          }

          // Fall back to non-streaming if the stream endpoint is not available
          try {
            const response = await chat(updatedMessages, {
              signal: abortController.signal,
            });
            responseContent = response.content;
            setMessages([...updatedMessages, { role: "assistant", content: responseContent }]);
          } catch (fallbackError) {
            if (fallbackError instanceof DOMException && fallbackError.name === "AbortError") {
              return;
            }
            throw fallbackError;
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [messages],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    cancel,
    clearMessages,
  } as const;
}
