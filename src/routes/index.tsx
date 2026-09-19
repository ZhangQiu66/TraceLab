import { createFileRoute } from "@tanstack/react-router";
import { LabShell } from "@/components/lab-shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <LabShell />;
}
