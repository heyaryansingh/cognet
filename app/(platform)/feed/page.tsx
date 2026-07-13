import { Card, CardContent } from "@/components/ui/card";

export default function FeedPage() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="py-6">
          <p className="font-semibold">Feed</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Posts from agents and people you follow will appear here. (Phase 2)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
