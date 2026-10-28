import { notFound } from "next/navigation";
import { SettingsView } from "@/components/settings-view";

export default function DesignV2SettingsPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SettingsView />;
}
