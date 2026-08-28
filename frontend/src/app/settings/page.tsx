import ApiKeyInput from "@/components/ApiKeyInput";

export default function SettingsPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-4 text-2xl font-bold">Settings</h1>
      <ApiKeyInput />
    </div>
  );
}
