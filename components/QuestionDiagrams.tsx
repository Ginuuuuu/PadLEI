import Image from "next/image";
import type { Question } from "@/types/models";
import { cn } from "@/lib/utils";

export function QuestionDiagrams({ question, className }: { question: Pick<Question, "diagrams" | "questionNumber">; className?: string }) {
  const diagrams = (question.diagrams || []).filter((diagram) => diagram.src);
  if (!diagrams.length) return null;

  return (
    <div className={cn("grid gap-3", className)}>
      {diagrams.map((diagram, index) => (
        <figure key={diagram.id || `${question.questionNumber}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Image
            src={diagram.src}
            alt={diagram.alt || `Diagram for question ${question.questionNumber}`}
            width={diagram.width || 900}
            height={diagram.height || 520}
            unoptimized
            className="max-h-[22rem] w-full object-contain"
          />
          {diagram.pageNumber ? <figcaption className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Extracted from page {diagram.pageNumber}</figcaption> : null}
        </figure>
      ))}
    </div>
  );
}
