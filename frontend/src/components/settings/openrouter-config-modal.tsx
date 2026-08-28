"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogCloseButton,
  Button,
  Input,
} from "@/components/ui";
import { VISION_MODELS, DEFAULT_VISION_MODEL, LLM_CONFIG_KEYS } from "@/lib/openrouter-models";
import { apiClient } from "@/lib/api-client";
import { useLang } from "@/hooks/use-lang";

interface OpenRouterConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OpenRouterConfigModal({ open, onOpenChange }: OpenRouterConfigModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_VISION_MODEL);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; message: string } | null>(null);
  const { t } = useLang();

  useEffect(() => {
    if (open && typeof window !== "undefined") {
      setApiKey(localStorage.getItem(LLM_CONFIG_KEYS.API_KEY) || "");
      setModel(localStorage.getItem(LLM_CONFIG_KEYS.MODEL) || DEFAULT_VISION_MODEL);
      setResult(null);
    }
  }, [open]);

  const handleSave = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      if (apiKey.trim()) {
        const res = await apiClient.post<{ valid: boolean; message: string }>("/api-key/verify", {
          api_key: apiKey,
        });
        setResult({ valid: res.valid, message: res.message });
        if (!res.valid) {
          setLoading(false);
          return;
        }
      }
      if (typeof window !== "undefined") {
        if (apiKey.trim()) {
          localStorage.setItem(LLM_CONFIG_KEYS.API_KEY, apiKey.trim());
          localStorage.setItem(LLM_CONFIG_KEYS.MODEL, model);
        } else {
          localStorage.removeItem(LLM_CONFIG_KEYS.API_KEY);
          localStorage.removeItem(LLM_CONFIG_KEYS.MODEL);
        }
      }
      onOpenChange(false);
    } catch (err) {
      setResult({ valid: false, message: t.settings.networkError });
    } finally {
      setLoading(false);
    }
  }, [apiKey, model, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold tracking-tight uppercase">
            {t.settings.openRouterTitle}
          </DialogTitle>
          <DialogCloseButton onClick={() => onOpenChange(false)} />
        </DialogHeader>
        <div className="flex flex-col gap-5 px-6 pb-6">
          <p className="text-muted font-sans text-xs">{t.settings.openRouterDesc}</p>

          <div className="space-y-1.5">
            <label
              htmlFor="or-api-key"
              className="text-muted font-sans text-[10px] font-bold tracking-widest uppercase"
            >
              {t.settings.apiKeyLabel}
            </label>
            <Input
              id="or-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-..."
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="or-model"
              className="text-muted font-sans text-[10px] font-bold tracking-widest uppercase"
            >
              {t.settings.modelLabel}
            </label>
            <select
              id="or-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="border-border bg-background text-foreground focus:border-foreground w-full border px-3 py-2 font-mono text-xs focus:outline-none"
            >
              {VISION_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {result && (
            <p
              className={`border px-3 py-2 font-mono text-[10px] tracking-wide uppercase ${
                result.valid
                  ? "border-accent/40 text-accent"
                  : "border-destructive/40 text-destructive"
              }`}
            >
              {result.message}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.settings.cancel}
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? t.settings.verifying : t.settings.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
