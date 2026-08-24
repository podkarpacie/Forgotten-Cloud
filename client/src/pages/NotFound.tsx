import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="label-meta">404 · signal lost</div>
      <h2 className="text-3xl font-bold">This page wandered into the fog</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        The route you requested does not exist in Forgotten Cloud.
      </p>
      <Link href="/">
        <Button variant="secondary">Back to dashboard</Button>
      </Link>
    </div>
  );
}

