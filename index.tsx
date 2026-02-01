import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Initialize Gemini API Client safely
// We use a safe accessor for the key to prevent runtime crashes if process.env is not fully shimmed in the browser
const getApiKey = () => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env.API_KEY || '';
    }
  } catch (e) {
    // Ignore error
  }
  return '';
};

// If key is missing, this might throw or simply fail later. We proceed to allow UI to render.
const ai = new GoogleGenAI({ apiKey: getApiKey() });

type Message = {
  id: string;
  role: "user" | "ai";
  text: string;
  isThinking?: boolean;
};

// SVG Components
const GeminiIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="gemini-logo-svg">
    <path
      d="M12.867 2.13838C12.4468 0.621034 10.5532 0.621033 10.133 2.13838L8.71181 7.27042C8.24354 8.9614 6.9614 10.2435 5.27042 10.7118L2.13838 11.867C0.621034 12.2872 0.621033 14.1808 2.13838 14.601L5.27042 15.7562C6.9614 16.2245 8.24354 17.5065 8.71181 19.1975L10.133 24.3295C10.5532 25.8469 12.4468 25.8469 12.867 24.3295L14.2882 19.1975C14.7565 17.5065 16.0386 16.2245 17.7296 15.7562L20.8616 14.601C22.379 14.1808 22.379 12.2872 20.8616 11.867L17.7296 10.7118C16.0386 10.2435 14.7565 8.9614 14.2882 7.27042L12.867 2.13838Z"
      fill="url(#gemini-gradient)"
    />
    <defs>
      <linearGradient id="gemini-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#4285F4" />
        <stop offset="50%" stopColor="#D96570" />
        <stop offset="100%" stopColor="#9B72CB" />
      </linearGradient>
    </defs>
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16">
    <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16">
    <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" />
  </svg>
);

interface CodeBlockProps {
  language: string;
  code: string;
  key?: string | number;
}

// Remove React.FC to avoid potential type resolution issues in lighter environments
const CodeBlock = ({ language, code }: CodeBlockProps) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <div className="code-block">
      <div className="code-header">
        <span>{language}</span>
        <button className="copy-btn" onClick={handleCopy} title="Copy code">
          {isCopied ? (
            <>
              <CheckIcon /> Copied
            </>
          ) : (
            <>
              <CopyIcon /> Copy code
            </>
          )}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
};

type Part =
  | { type: "text"; content: string }
  | { type: "code"; content: string; language: string };

const MessageContent = ({ text }: { text: string }) => {
  const parts: Part[] = [];
  const regex = /```(\w*)\n?([\s\S]*?)(?:```|$)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: text.substring(lastIndex, match.index),
      });
    }

    parts.push({
      type: "code",
      language: match[1] || "plaintext",
      content: match[2],
    });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      content: text.substring(lastIndex),
    });
  }

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "code") {
          return (
            <CodeBlock
              key={index}
              language={part.language}
              code={part.content}
            />
          );
        }
        return <span key={index}>{part.content}</span>;
      })}
    </>
  );
};

const App = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "ai",
      text: "Hello, I'm Gemini. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const handleScroll = () => {
    if (mainRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = mainRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShouldAutoScroll(isAtBottom);
    }
  };

  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, shouldAutoScroll]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      text: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setShouldAutoScroll(true);
    
    setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 10);

    try {
      const aiMessageId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        { id: aiMessageId, role: "ai", text: "", isThinking: true },
      ]);

      const stream = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: userMessage.text,
        config: {
          systemInstruction: "You are a helpful assistant.",
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
          ],
        },
      });

      let fullText = "";

      for await (const chunk of stream) {
        const chunkText = chunk.text;
        if (chunkText) {
          fullText += chunkText;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, text: fullText, isThinking: false }
                : msg
            )
          );
        }
      }
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      setMessages((prev) => 
        prev.map((msg) => {
           if (msg.role === 'ai' && msg.isThinking) {
             return { ...msg, text: "I'm sorry, I encountered an error. Please try again.", isThinking: false };
           }
           return msg;
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header>
        <GeminiIcon />
        <span className="logo-text">Gemini</span>
      </header>

      <main ref={mainRef} onScroll={handleScroll}>
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            {msg.role === "ai" && (
              <div className="avatar">
                <GeminiIcon />
              </div>
            )}
            {msg.isThinking ? (
              <div className="thinking-dots">
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
              </div>
            ) : (
              <div className="bubble">
                <MessageContent text={msg.text} />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Gemini"
            disabled={isLoading}
            autoFocus
          />
          <button type="submit" disabled={isLoading || !input.trim()}>
            <SendIcon />
          </button>
        </form>
      </footer>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);