"use client";

import { useState } from "react";

// 定义后端响应类型（可选，放在组件内部或单独类型文件）
interface VerifyResponse {
  valid: boolean;
  message: string;
  data?: any;
}

export default function ApiKeyInput() {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; message: string } | null>(null);

  const handleVerify = async () => {
    if (!apiKey.trim()) {
      alert("Input your API Key");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/v1/api-key/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
      });

      const data: VerifyResponse = await response.json();
      setResult({ valid: data.valid, message: data.message });

      if (data.valid) {
        localStorage.setItem("openrouter_api_key", apiKey);
      }
    } catch (error) {
      setResult({ valid: false, message: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded border p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold">设置 API Key</h2>
      <p className="mb-3 text-sm text-gray-600"></p>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="sk-or-..."
        className="mb-2 w-full rounded border p-2"
      />
      <button
        onClick={handleVerify}
        disabled={loading}
        className="bg-accent text-accent-foreground hover:bg-accent-dark px-4 py-2 font-sans text-xs font-bold tracking-widest uppercase disabled:opacity-50"
      >
        {loading ? "Verifying..." : "Verify Key"}
      </button>
      {result && (
        <div
          className={`mt-3 rounded p-2 ${
            result.valid ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
