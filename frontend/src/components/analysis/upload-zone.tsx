"use client";

import { useCallback, useRef, useState, DragEvent } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/hooks/use-lang";

const MAX_TABULAR_SIZE_MB = 5;
const MAX_TABULAR_BYTES = MAX_TABULAR_SIZE_MB * 1024 * 1024;

interface UploadZoneProps {
  onFileSelected?: (file: File, featureEngineering: boolean) => void | Promise<void>;
  onUrlSubmitted?: (url: string) => void | Promise<void>;
  className?: string;
  disabled?: boolean;
}

export function UploadZone({
  onFileSelected,
  onUrlSubmitted,
  className,
  disabled,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [featureEngEnabled, setFeatureEng] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLang();

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      setError(null);

      const lowerName = file.name.toLowerCase();
      const isSupported = lowerName.endsWith(".csv") || lowerName.endsWith(".json");
      if (!isSupported) {
        setError(t.upload.errorOnlyCsvJson);
        return;
      }
      if (file.size > MAX_TABULAR_BYTES) {
        setError(t.upload.errorFileTooLarge(MAX_TABULAR_SIZE_MB));
        return;
      }
      if (!onFileSelected) return;

      setIsUploading(true);
      try {
        await onFileSelected(file, featureEngEnabled);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.upload.uploadFailed);
      } finally {
        setIsUploading(false);
      }
    },
    [onFileSelected, featureEngEnabled]
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (disabled || isUploading) return;
    handleFiles(event.dataTransfer.files);
  };

  const preventDefaults = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const triggerFileInput = () => {
    if (disabled || isUploading) return;
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    e.target.value = "";
  };

  const handleUrlSubmit = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setError(null);
    if (!onUrlSubmitted) return;
    setIsUploading(true);
    try {
      await onUrlSubmitted(trimmed);
      setUrlInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.upload.urlImportFailed);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={cn("bg-background", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json"
        onChange={handleInputChange}
        className="hidden"
        aria-hidden
      />

      <div
        role="button"
        tabIndex={0}
        onClick={triggerFileInput}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            triggerFileInput();
          }
        }}
        onDragEnter={(e) => {
          preventDefaults(e);
          if (!disabled && !isUploading) setIsDragging(true);
        }}
        onDragOver={preventDefaults}
        onDragLeave={(e) => {
          preventDefaults(e);
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-10 text-center transition-colors",
          isDragging
            ? "border-accent bg-accent-light"
            : "border-border hover:border-accent hover:bg-accent-light/50",
          (disabled || isUploading) && "cursor-not-allowed opacity-60"
        )}
      >
        {/* Icon */}
        <div
          className={cn(
            "mb-4 flex h-10 w-10 items-center justify-center border-2",
            isDragging ? "border-accent text-accent" : "border-foreground text-foreground"
          )}
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <span className="text-lg leading-none font-bold">↑</span>
          )}
        </div>

        <p className="text-foreground font-sans text-xs font-bold tracking-widest uppercase">
          {isUploading ? t.upload.uploading : t.upload.dropZoneText}
        </p>
        <p className="text-muted mt-1 font-mono text-[9px] tracking-wider uppercase">
          {t.upload.dropZoneHint(MAX_TABULAR_SIZE_MB)}
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerFileInput();
          }}
          disabled={disabled || isUploading}
          className="bg-foreground text-background hover:bg-foreground/80 mt-4 px-4 py-2 font-sans text-[10px] font-bold tracking-widest uppercase transition-colors disabled:opacity-50"
        >
          {t.upload.browseFile}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="text-destructive mt-2 font-mono text-[10px] tracking-wide uppercase"
        >
          {error}
        </p>
      )}

      <div className="border-border bg-surface mt-3 border p-3">
        <p className="text-muted font-mono text-[9px] tracking-wider uppercase">
          {t.upload.urlImportLabel}
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={t.upload.urlPlaceholder}
            disabled={disabled || isUploading}
            className="border-border bg-background text-foreground focus:border-accent min-w-0 flex-1 border px-2 py-2 text-xs outline-none"
          />
          <button
            type="button"
            onClick={handleUrlSubmit}
            disabled={disabled || isUploading || !urlInput.trim()}
            className="bg-foreground text-background hover:bg-foreground/80 px-3 py-2 font-sans text-[10px] font-bold tracking-widest uppercase transition-colors disabled:opacity-50"
          >
            {t.upload.importUrl}
          </button>
        </div>
      </div>

      <div className="border-border bg-surface mt-3 border p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <div className="relative mt-px shrink-0">
            <input
              type="checkbox"
              checked={featureEngEnabled}
              onChange={(e) => setFeatureEng(e.target.checked)}
              disabled={disabled || isUploading}
              className="peer sr-only"
            />
            <div
              className={cn(
                "border-foreground h-4 w-4 border-2 transition-colors",
                featureEngEnabled ? "bg-foreground" : "bg-background",
                (disabled || isUploading) && "opacity-50"
              )}
            >
              {featureEngEnabled && (
                <svg
                  viewBox="0 0 12 12"
                  className="text-background h-full w-full"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="2,6 5,9 10,3" />
                </svg>
              )}
            </div>
          </div>
          <div>
            <p className="text-foreground font-mono text-xs font-bold tracking-wider uppercase">
              {t.upload.featureEngLabel}
            </p>
            <p className="text-muted mt-1 font-mono text-[11px] leading-relaxed tracking-wide">
              {t.upload.featureEngHint}
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
