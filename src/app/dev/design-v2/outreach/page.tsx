import { notFound } from "next/navigation";
import { OutreachView } from "@/components/outreach-view";

export default function DesignV2OutreachPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <OutreachView demo />;
}
