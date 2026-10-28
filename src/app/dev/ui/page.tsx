import { notFound } from "next/navigation";
import { UiPreview } from "@/components/ui/ui-preview";

export default function UiPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <UiPreview />;
}
