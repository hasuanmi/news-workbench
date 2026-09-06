import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ModulePlaceholder({ title, phase, desc }: { title: string; phase: string; desc: string }) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-serif text-2xl font-bold">{title}</h1>
      </header>
      <Card>
        <CardContent className="py-20 text-center">
          <Construction className="w-10 h-10 mx-auto text-[var(--muted-foreground)] mb-4" />
          <p className="font-serif text-lg">该模块属于 {phase} 阶段</p>
          <p className="text-sm text-[var(--muted-foreground)] mt-2 max-w-lg mx-auto">{desc}</p>
        </CardContent>
      </Card>
    </div>
  );
}
